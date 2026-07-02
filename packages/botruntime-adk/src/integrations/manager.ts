import { Dependencies, ValidationError } from '../agent-project/types.js'
import { IntegrationDefinition, ParsedIntegration, IntegrationValidationResult, IntegrationRef } from './types.js'
import { IntegrationParser } from '../agent-project/dependencies-parser.js'
import { ValidationErrors } from '../agent-project/validation-errors.js'
import type { HubCacheEntry } from './hub-cache.js'
import { CatalogClientFactory, type CatalogClientOptions } from '../dependencies/catalog/client-factory.js'
import { CatalogService } from '../dependencies/catalog/catalog-service.js'
import { IntegrationCatalogSource } from '../dependencies/catalog/integration-source.js'

export interface IntegrationManagerOptions extends CatalogClientOptions {
  noCache?: boolean
}

/**
 * Loads, validates and searches integrations.
 *
 * Since WS4 this is a thin shim: the cloud fetch + two-level cache live in the
 * unified {@link CatalogService} / {@link IntegrationCatalogSource}. This class
 * keeps the parse-and-validate orchestration (`loadIntegrations`) and the stable
 * public surface that the rest of the ADK and the package consumers import.
 */
export class IntegrationManager {
  private readonly source: IntegrationCatalogSource
  private readonly service: CatalogService<IntegrationDefinition, IntegrationRef>

  constructor(options: IntegrationManagerOptions = {}) {
    const { noCache, ...clientOptions } = options
    this.source = new IntegrationCatalogSource(new CatalogClientFactory(clientOptions))
    this.service = new CatalogService(this.source, noCache || false)
  }

  /**
   * Load and validate all integrations from dependencies
   */
  async loadIntegrations(dependencies: Dependencies): Promise<{
    integrations: ParsedIntegration[]
    errors: ValidationError[]
    warnings: ValidationError[]
  }> {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Parse integrations from dependencies
    const parseResult = IntegrationParser.parseIntegrations(dependencies)
    const integrations = parseResult.integrations
    errors.push(...parseResult.errors)

    // Check for duplicates
    const duplicateWarnings = IntegrationParser.checkDuplicates(integrations)
    warnings.push(...duplicateWarnings)

    // Fetch integration definitions in parallel
    const fetchPromises = integrations.map(async (integration) => {
      try {
        const definition = await this.fetchIntegration(integration.ref)
        integration.definition = definition

        // Validate the integration
        const validation = this.validateIntegration(integration)
        integration.validationResult = validation

        if (!validation.valid) {
          validation.errors.forEach(() => {
            errors.push(ValidationErrors.unknownIntegration(integration.alias, integration.ref.fullName))
          })
        }

        if (validation.warnings.length > 0) {
          validation.warnings.forEach((warn) => {
            warnings.push(ValidationErrors.warning(warn, 'agent.config.ts'))
          })
        }
      } catch (error) {
        // Use the specific error message if available
        if (error instanceof Error && error.message.includes('version')) {
          // Version-specific error
          errors.push(ValidationErrors.integrationVersionError(integration.alias, error.message))
        } else {
          // Integration not found - use detailed error message if available
          const errorMessage = error instanceof Error ? error.message : undefined
          errors.push(ValidationErrors.unknownIntegration(integration.alias, integration.ref.fullName, errorMessage))
        }
      }
    })

    await Promise.all(fetchPromises)

    // Check if any integration has channels
    const hasChannels = integrations.some(
      (i) => i.definition?.channels && Object.keys(i.definition.channels).length > 0
    )

    if (!hasChannels && integrations.length > 0) {
      warnings.push(
        ValidationErrors.warning(
          'No integrations with channels found. Your agent may not be able to receive messages.',
          'agent.config.ts',
          'Add an integration with channels (e.g., slack, webchat) to enable conversations'
        )
      )
    }

    return { integrations, errors, warnings }
  }

  /** Fetch an integration definition from API or cache. */
  public async fetchIntegration(ref: IntegrationRef): Promise<IntegrationDefinition> {
    return this.service.getDefinition(ref)
  }

  /** Search public integrations in the Botpress hub. */
  public async searchIntegrations(query: string, limit: number = 20): Promise<HubCacheEntry[]> {
    return this.source.search(query, limit)
  }

  /** Find public integrations that implement a given interface (by interface name). */
  public async findImplementersOfInterface(interfaceName: string, limit: number = 10): Promise<HubCacheEntry[]> {
    return this.source.findImplementersOfInterface(interfaceName, limit)
  }

  /** List known public versions for an integration name. */
  public async listIntegrationVersions(name: string): Promise<string[]> {
    return this.source.listVersions(name)
  }

  async getCacheStats(): Promise<{ count: number; sizeBytes: number }> {
    return this.service.getCacheStats()
  }

  async clearCache(): Promise<void> {
    await this.service.clearCache()
  }

  /**
   * Validate an integration definition
   */
  private validateIntegration(integration: ParsedIntegration): IntegrationValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!integration.definition) {
      errors.push(`Integration definition not found for ${integration.alias}`)
      return { valid: false, errors, warnings }
    }

    // Check if integration has channels
    const hasChannels = integration.definition.channels && Object.keys(integration.definition.channels).length > 0

    // Check if integration requires configuration (only for object-format integrations with explicit enabled)
    if (!integration.config && integration.enabled !== undefined) {
      let requiresConfig = false

      // Check modern configurations (plural)
      if (integration.definition.configurations) {
        requiresConfig = Object.values(integration.definition.configurations).some(
          (config) => config.identifier?.required === true
        )
      }

      // Check legacy configuration (singular) - if it has required fields in schema
      if (!requiresConfig && integration.definition.configuration) {
        const config = integration.definition.configuration
        const schema = config.schema
        requiresConfig = schema?.required && schema.required.length > 0
      }

      if (requiresConfig) {
        warnings.push(
          `Integration '${integration.alias}' requires configuration. Add a config object in agent.config.ts dependencies`
        )
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      missingChannels: !hasChannels,
    }
  }
}
