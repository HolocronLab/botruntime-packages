import { z } from '@holocronlab/botruntime-sdk'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { Dependencies } from './types.js'
import { IntegrationRef, ParsedIntegration } from '../integrations/types.js'
import { PluginRef, ParsedPlugin } from '../plugins/types.js'
import { ValidationErrors } from './validation-errors.js'
import { ValidationError } from './types.js'

// Integration alias validation constants (matching Botpress API requirements)
const INTEGRATION_ALIAS_MIN_LENGTH = 2
const INTEGRATION_ALIAS_MAX_LENGTH = 100

// Regex for valid integration alias: lowercase alphanumeric with optional workspace prefix
// Matches: "slack", "my-slack", "slack_prod", "workspace/slack", "my-workspace/my-integration"
const INTEGRATION_ALIAS_REGEX = /^(?:[a-z][a-z0-9_-]*\/)?[a-z][a-z0-9_-]*$/

/**
 * Validates an integration alias according to Botpress API requirements
 */
function isIntegrationAliasValid(alias: string): boolean {
  return (
    alias.length >= INTEGRATION_ALIAS_MIN_LENGTH &&
    alias.length <= INTEGRATION_ALIAS_MAX_LENGTH &&
    INTEGRATION_ALIAS_REGEX.test(alias)
  )
}

// Integration reference schema
const integrationRefSchema = z.string().transform((val, ctx) => {
  // Match pattern: [workspace/]name@version
  const match = val.match(/^(?:([^/]+)\/)?([^@]+)@(.+)$/)

  if (!match) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid integration version format: ${val}. Expected format: 'name@version' or 'workspace/name@version'`,
    })
    return undefined as never
  }

  const [, workspace, name, version] = match

  return {
    workspace: workspace || undefined,
    name: name!,
    version: version!,
    fullName: workspace ? `${workspace}/${name}` : name!,
  }
})

// Version validation schema
const versionSchema = z.string().refine(
  (version) => {
    if (version === 'latest') return true
    const semverPattern = /^(\d+)\.(\d+)\.(\d+)(-[\w.]+)?(\+[\w.]+)?$/
    return semverPattern.test(version)
  },
  { message: "Version must be exact semver (e.g., 1.2.3) or 'latest'" }
)

export class IntegrationParser {
  /**
   * Parse an integration version string into its components
   * Examples:
   * - "slack@1.2.0" -> { name: 'slack', version: '1.2.0', fullName: 'slack' }
   * - "myworkspace/slack@latest" -> { workspace: 'myworkspace', name: 'slack', version: 'latest', fullName: 'myworkspace/slack' }
   */
  static parseIntegrationRef(versionString: string): IntegrationRef {
    const result = integrationRefSchema.safeParse(versionString)
    if (!result.success) {
      throw new AdkError({
        code: 'INVALID_VERSION_FORMAT',
        expected: true,
        message: result.error.errors[0]?.message || 'Invalid integration version format',
      })
    }
    return result.data
  }

  /**
   * Parse integrations from dependencies object
   */
  static parseIntegrations(dependencies: Dependencies): {
    integrations: ParsedIntegration[]
    errors: ValidationError[]
  } {
    const integrations: ParsedIntegration[] = []
    const errors: ValidationError[] = []

    if (!dependencies.integrations) {
      return { integrations, errors }
    }

    for (const [alias, value] of Object.entries(dependencies.integrations)) {
      try {
        // Validate alias format
        if (!isIntegrationAliasValid(alias)) {
          errors.push(ValidationErrors.invalidIntegrationAlias(alias))
          continue // Skip this integration, alias is invalid
        }

        // Normalize: string shorthand → object with defaults
        const normalized = typeof value === 'string' ? { version: value } : value

        // Parse the integration reference
        const ref = this.parseIntegrationRef(normalized.version)

        // Validate version format
        const versionResult = versionSchema.safeParse(ref.version)
        if (!versionResult.success) {
          errors.push(ValidationErrors.invalidVersionFormat(alias, ref.version))
        }

        integrations.push({
          alias,
          ref,
          enabled: 'enabled' in normalized ? normalized.enabled : undefined,
          configurationType: 'configurationType' in normalized ? normalized.configurationType : undefined,
          config: 'config' in normalized ? normalized.config : undefined,
        })
      } catch (error) {
        errors.push(
          ValidationErrors.invalidDependenciesSyntax(
            `Invalid integration '${alias}': ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    }

    return { integrations, errors }
  }

  /**
   * Check for duplicate integration names with identical configs (different aliases pointing to same integration)
   */
  static checkDuplicates(integrations: ParsedIntegration[]): ValidationError[] {
    const errors: ValidationError[] = []
    const seen = new Map<string, ParsedIntegration[]>()

    for (const integration of integrations) {
      const key = integration.ref.fullName
      const group = seen.get(key) || []
      group.push(integration)
      seen.set(key, group)
    }

    // Report duplicates only if they have the same configuration
    for (const [integrationName, group] of seen.entries()) {
      if (group.length > 1) {
        // Check if any two have identical configs
        const duplicateConfigs: string[] = []
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const configA = JSON.stringify(group[i]!.config ?? {})
            const configB = JSON.stringify(group[j]!.config ?? {})
            if (configA === configB) {
              // Add both aliases if not already in the list
              if (!duplicateConfigs.includes(group[i]!.alias)) {
                duplicateConfigs.push(group[i]!.alias)
              }
              if (!duplicateConfigs.includes(group[j]!.alias)) {
                duplicateConfigs.push(group[j]!.alias)
              }
            }
          }
        }

        if (duplicateConfigs.length > 0) {
          errors.push(
            ValidationErrors.warning(
              `Integration '${integrationName}' has aliases with identical configurations: ${duplicateConfigs.join(', ')}. Consider using different configs or removing duplicates.`,
              'agent.config.ts'
            )
          )
        }
      }
    }

    return errors
  }
}

// Plugin alias validation constants
const PLUGIN_ALIAS_MIN_LENGTH = 2
const PLUGIN_ALIAS_MAX_LENGTH = 100

// Regex for valid plugin alias: lowercase alphanumeric, no workspace prefix
// Matches: "hitl", "my-plugin", "some_plugin"
const PLUGIN_ALIAS_REGEX = /^[a-z][a-z0-9_-]*$/

/**
 * Validates a plugin alias (same rules as integrations, but no workspace prefix allowed)
 */
function isPluginAliasValid(alias: string): boolean {
  return (
    alias.length >= PLUGIN_ALIAS_MIN_LENGTH && alias.length <= PLUGIN_ALIAS_MAX_LENGTH && PLUGIN_ALIAS_REGEX.test(alias)
  )
}

// Plugin reference schema: name@version only, no workspace prefix
const pluginRefSchema = z.string().transform((val, ctx) => {
  // Match pattern: name@version (no workspace prefix allowed)
  const match = val.match(/^([^/@]+)@(.+)$/)

  if (!match) {
    ctx.addIssue({
      code: 'custom',
      message: `Invalid plugin version format: ${val}. Expected format: 'name@version' (no workspace prefix)`,
    })
    return undefined as never
  }

  const [, name, version] = match

  return {
    name: name!,
    version: version!,
    fullName: name!,
  }
})

export class PluginParser {
  /**
   * Parse a plugin version string into its components
   * Examples:
   * - "hitl@1.3.0" -> { name: 'hitl', version: '1.3.0', fullName: 'hitl' }
   * - "myworkspace/hitl@1.0.0" -> error (no workspace prefix)
   */
  static parsePluginRef(versionString: string): PluginRef {
    const result = pluginRefSchema.safeParse(versionString)
    if (!result.success) {
      throw new AdkError({
        code: 'INVALID_VERSION_FORMAT',
        expected: true,
        message: result.error.errors[0]?.message || 'Invalid plugin version format',
      })
    }
    return result.data
  }

  /**
   * Parse plugins from dependencies object
   */
  static parsePlugins(dependencies: Dependencies): {
    plugins: ParsedPlugin[]
    errors: ValidationError[]
  } {
    const plugins: ParsedPlugin[] = []
    const errors: ValidationError[] = []

    if (!dependencies.plugins) {
      return { plugins, errors }
    }

    for (const [alias, value] of Object.entries(dependencies.plugins)) {
      try {
        if (!isPluginAliasValid(alias)) {
          errors.push(ValidationErrors.invalidPluginAlias(alias))
          continue
        }

        const ref = this.parsePluginRef(value.version)

        const versionResult = versionSchema.safeParse(ref.version)
        if (!versionResult.success) {
          errors.push(ValidationErrors.invalidPluginVersionFormat(alias, ref.version))
        }

        plugins.push({
          alias,
          ref,
          config: value.config,
          dependencies: value.dependencies,
        })
      } catch (error) {
        errors.push(
          ValidationErrors.invalidDependenciesSyntax(
            `Invalid plugin '${alias}': ${error instanceof Error ? error.message : String(error)}`
          )
        )
      }
    }

    return { plugins, errors }
  }

  /**
   * Validate that plugin dependency integrationAlias values reference integrations
   * that are actually declared in dependencies.integrations
   */
  static validateDependencyReferences(dependencies: Dependencies): ValidationError[] {
    const errors: ValidationError[] = []

    if (!dependencies.plugins) {
      return errors
    }

    const integrationAliases = Object.keys(dependencies.integrations || {})

    for (const [alias, pluginConfig] of Object.entries(dependencies.plugins)) {
      if (!pluginConfig.dependencies) {
        continue
      }

      for (const [_depAlias, depMapping] of Object.entries(pluginConfig.dependencies)) {
        if (!integrationAliases.includes(depMapping.integrationAlias)) {
          errors.push(ValidationErrors.invalidPluginDependency(alias, depMapping.integrationAlias, integrationAliases))
        }
      }
    }

    return errors
  }

  /**
   * Check for duplicate plugin names (different aliases pointing to same plugin)
   */
  static checkDuplicates(plugins: ParsedPlugin[]): ValidationError[] {
    const errors: ValidationError[] = []
    const seen = new Map<string, ParsedPlugin[]>()

    for (const plugin of plugins) {
      const key = plugin.ref.fullName
      const group = seen.get(key) || []
      group.push(plugin)
      seen.set(key, group)
    }

    for (const [pluginName, group] of seen.entries()) {
      if (group.length > 1) {
        const duplicateConfigs: string[] = []
        for (let i = 0; i < group.length; i++) {
          for (let j = i + 1; j < group.length; j++) {
            const configA = JSON.stringify(group[i]!.config ?? {})
            const configB = JSON.stringify(group[j]!.config ?? {})
            if (configA === configB) {
              if (!duplicateConfigs.includes(group[i]!.alias)) {
                duplicateConfigs.push(group[i]!.alias)
              }
              if (!duplicateConfigs.includes(group[j]!.alias)) {
                duplicateConfigs.push(group[j]!.alias)
              }
            }
          }
        }

        if (duplicateConfigs.length > 0) {
          errors.push(
            ValidationErrors.warning(
              `Plugin '${pluginName}' has aliases with identical configurations: ${duplicateConfigs.join(', ')}. Consider using different configs or removing duplicates.`,
              'agent.config.ts'
            )
          )
        }
      }
    }

    return errors
  }
}
