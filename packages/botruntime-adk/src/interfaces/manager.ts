import { Dependencies, ValidationError } from '../agent-project/types.js'
import { InterfaceDefinition, ParsedInterface, InterfaceRef, InterfaceValidationResult } from './types.js'
import { InterfaceParser } from './parser.js'
import { ValidationErrors } from '../agent-project/validation-errors.js'
import { CatalogClientFactory, type CatalogClientOptions } from '../dependencies/catalog/client-factory.js'
import { CatalogService } from '../dependencies/catalog/catalog-service.js'
import { InterfaceCatalogSource } from '../dependencies/catalog/interface-source.js'

export interface InterfaceManagerOptions extends CatalogClientOptions {
  noCache?: boolean
}

/**
 * Loads and validates interfaces.
 *
 * Since WS4 this is a thin shim over the unified {@link CatalogService} /
 * {@link InterfaceCatalogSource} (fetch-by-ref only — interfaces are never
 * listed/enumerated; the project's interface set is fixed by `BUILTIN_INTERFACES`).
 */
export class InterfaceManager {
  private readonly service: CatalogService<InterfaceDefinition, InterfaceRef>

  constructor(options: InterfaceManagerOptions = {}) {
    const { noCache, ...clientOptions } = options
    const clientFactory = new CatalogClientFactory(clientOptions)
    this.service = new CatalogService(
      new InterfaceCatalogSource(clientFactory),
      noCache || !clientFactory.hasCacheAuthority,
      clientFactory.cacheAuthority,
      () => clientFactory.validateAuthority(),
      !clientFactory.hasCacheAuthority
    )
  }

  async loadInterfaces(dependencies: Dependencies): Promise<{
    interfaces: ParsedInterface[]
    errors: ValidationError[]
    warnings: ValidationError[]
  }> {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    // Parse interfaces from dependencies
    const parseResult = InterfaceParser.parseInterfaces(dependencies)
    const interfaces = parseResult.interfaces
    errors.push(...parseResult.errors)

    // Fetch interface definitions in parallel
    const fetchPromises = interfaces.map(async (intf) => {
      try {
        const definition = await this.fetchInterface(intf.ref)
        intf.definition = definition

        // Validate
        const validation = this.validateInterface(intf)
        intf.validationResult = validation

        if (!validation.valid) {
          validation.errors.forEach((msg) => {
            errors.push(ValidationErrors.warning(msg, 'agent.config.ts'))
          })
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('version')) {
          errors.push(ValidationErrors.unknownInterface(error.message))
        } else {
          errors.push(
            ValidationErrors.invalidDependenciesSyntax(`Unknown interface '${intf.alias}' (${intf.ref.fullName})`)
          )
        }
      }
    })

    await Promise.all(fetchPromises)

    return { interfaces, errors, warnings }
  }

  /** Fetch an interface definition from API or cache. */
  public async fetchInterface(ref: InterfaceRef): Promise<InterfaceDefinition> {
    return this.service.getDefinition(ref)
  }

  private validateInterface(intf: ParsedInterface): InterfaceValidationResult {
    const errors: string[] = []
    const warnings: string[] = []

    if (!intf.definition) {
      errors.push(`Interface definition not found for ${intf.alias}`)
      return { valid: false, errors, warnings }
    }

    return { valid: errors.length === 0, errors, warnings }
  }

  async getCacheStats(): Promise<{ count: number; sizeBytes: number }> {
    return this.service.getCacheStats()
  }

  async clearCache(): Promise<void> {
    await this.service.clearCache()
  }
}
