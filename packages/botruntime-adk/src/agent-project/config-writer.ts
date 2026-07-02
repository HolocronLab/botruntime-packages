import { Project, SyntaxKind, PropertyAssignment, SourceFile, ObjectLiteralExpression } from 'ts-morph'
import { readFileSync } from 'fs'
import * as path from 'path'
import type { Dependencies } from './types'
import { formatCode } from '../generators/utils'
import { AdkError } from '@holocronlab/botruntime-analytics'

export interface ConfigSchemaFieldUpdate {
  action: 'add' | 'update' | 'remove'
  field: string
  /** Raw TS expression for the field type, e.g. "z.string().default('sk-...')" */
  definition?: string
}

export interface SecretDeclarationUpdate {
  action: 'add' | 'update' | 'remove'
  field: string
  /** Optional: include to set or overwrite the description. */
  description?: string
  /** Optional: include to set or overwrite the optional flag. */
  optional?: boolean
}

export type DefaultModelSelection = string | string[]

export interface DefaultModelsUpdate {
  autonomous?: DefaultModelSelection
  zai?: DefaultModelSelection
}

export interface IntegrationConfigMigrationState {
  deprecatedAliases: string[]
  migratableAliases: string[]
}

/**
 * Minimal ConfigWriter shape used by callers that only need to rewrite
 * dependencies — exposed so tests can inject stubs without constructing a
 * full ConfigWriter.
 */
export interface DependencyConfigWriter {
  updateDependencies(dependencies: Dependencies): Promise<void>
}

export type DependencyConfigWriterFactory = (projectPath: string) => DependencyConfigWriter

/**
 * ConfigWriter handles writing updates to agent.config.ts
 *
 * Note: For reading dependencies, use AgentProject.dependencies instead.
 * This class is only for surgical updates to specific fields.
 */
export class ConfigWriter {
  private configPath: string

  constructor(projectPath: string) {
    this.configPath = path.join(projectPath, 'agent.config.ts')
  }

  private loadConfig(): {
    sourceFile: SourceFile
    configObject: ObjectLiteralExpression
  } {
    const project = new Project()
    const sourceFile = project.createSourceFile(this.configPath, readFileSync(this.configPath, 'utf-8'), {
      overwrite: true,
    })

    const defineConfigCall = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression).find((call) => {
      return call.getExpression().getText() === 'defineConfig'
    })

    if (!defineConfigCall) {
      throw new AdkError({
        code: 'CONFIG_AST_INVALID',
        expected: true,
        message: 'Could not find defineConfig() call in agent.config.ts',
      })
    }

    const configArg = defineConfigCall.getArguments()[0]
    if (!configArg || !configArg.isKind(SyntaxKind.ObjectLiteralExpression)) {
      throw new AdkError({
        code: 'CONFIG_AST_INVALID',
        expected: true,
        message: 'defineConfig() must have an object literal as its first argument',
      })
    }

    return { sourceFile, configObject: configArg as ObjectLiteralExpression }
  }

  private async saveConfig(sourceFile: SourceFile): Promise<void> {
    sourceFile.formatText()
    const content = sourceFile.getFullText()
    const formatted = await formatCode(content, this.configPath)
    sourceFile.replaceWithText(formatted)
    await sourceFile.save()
  }

  private serializeDefaultModelSelection(value: DefaultModelSelection): string {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => `'${entry.replace(/'/g, "\\'")}'`).join(', ')}]`
    }

    return `'${value.replace(/'/g, "\\'")}'`
  }

  private getIntegrationConfigMigrationCandidates(): {
    sourceFile: SourceFile
    candidates: Array<{
      alias: string
      assignment: PropertyAssignment
      hasConfigProperty: boolean
      versionInitializerText?: string
    }>
  } {
    const { sourceFile, configObject } = this.loadConfig()

    const dependenciesProp = configObject.getProperty('dependencies') as PropertyAssignment | undefined
    if (!dependenciesProp) {
      return { sourceFile, candidates: [] }
    }

    const depsInit = dependenciesProp.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
    if (!depsInit) {
      return { sourceFile, candidates: [] }
    }

    const integrationsProp = depsInit.getProperty('integrations') as PropertyAssignment | undefined
    if (!integrationsProp) {
      return { sourceFile, candidates: [] }
    }

    const integrationsInit = integrationsProp.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
    if (!integrationsInit) {
      return { sourceFile, candidates: [] }
    }

    const candidates = integrationsInit.getProperties().flatMap((prop) => {
      if (!prop.isKind(SyntaxKind.PropertyAssignment)) {
        return []
      }

      const assignment = prop as PropertyAssignment
      const initializer = assignment.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
      if (!initializer) {
        return []
      }

      const hasConfigProperty = initializer.getProperty('config') !== undefined

      const versionProp = initializer.getProperty('version') as PropertyAssignment | undefined
      const versionInitializer = versionProp?.getInitializer()
      const versionInitializerText =
        versionInitializer &&
        (versionInitializer.isKind(SyntaxKind.StringLiteral) ||
          versionInitializer.isKind(SyntaxKind.NoSubstitutionTemplateLiteral))
          ? versionInitializer.getText()
          : undefined

      return [{ alias: assignment.getName(), assignment, hasConfigProperty, versionInitializerText }]
    })

    return { sourceFile, candidates }
  }

  /**
   * Updates the dependencies field in agent.config.ts
   * Uses ts-morph to surgically update only the dependencies property
   * while preserving all other config fields (name, models, state, etc.)
   */
  async updateDependencies(dependencies: Dependencies): Promise<void> {
    const { sourceFile, configObject } = this.loadConfig()

    // Find or create the dependencies property
    let dependenciesProperty = configObject.getProperty('dependencies') as PropertyAssignment | undefined

    if (dependenciesProperty) {
      // Update existing property
      dependenciesProperty.setInitializer(JSON.stringify(dependencies, null, 2))
    } else {
      // Add new property at the end
      dependenciesProperty = configObject.addPropertyAssignment({
        name: 'dependencies',
        initializer: JSON.stringify(dependencies),
      })
    }

    await this.saveConfig(sourceFile)
  }

  /**
   * Updates the name field in agent.config.ts
   */
  async updateName(name: string): Promise<void> {
    const { sourceFile, configObject } = this.loadConfig()

    const nameProperty = configObject.getProperty('name') as PropertyAssignment | undefined
    if (nameProperty) {
      nameProperty.setInitializer(`'${name.replace(/'/g, "\\'")}'`)
    }

    await this.saveConfig(sourceFile)
  }

  /**
   * Updates the defaultModels field in agent.config.ts.
   * Creates the object when it does not exist and only mutates the requested keys.
   */
  async updateDefaultModels(updates: DefaultModelsUpdate): Promise<void> {
    const requestedEntries = Object.entries(updates).filter(([, value]) => value !== undefined) as Array<
      [keyof DefaultModelsUpdate, DefaultModelSelection]
    >

    if (requestedEntries.length === 0) {
      return
    }

    const { sourceFile, configObject } = this.loadConfig()

    let defaultModelsProperty = configObject.getProperty('defaultModels') as PropertyAssignment | undefined

    if (!defaultModelsProperty) {
      defaultModelsProperty = configObject.addPropertyAssignment({
        name: 'defaultModels',
        initializer: '{}',
      })
    }

    const defaultModelsObject = defaultModelsProperty.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
    if (!defaultModelsObject) {
      throw new AdkError({
        code: 'CONFIG_AST_INVALID',
        expected: true,
        message: 'defaultModels must be an object literal in agent.config.ts',
      })
    }

    for (const [key, value] of requestedEntries) {
      const existingProperty = defaultModelsObject.getProperty(key) as PropertyAssignment | undefined
      const initializer = this.serializeDefaultModelSelection(value)

      if (existingProperty) {
        existingProperty.setInitializer(initializer)
      } else {
        defaultModelsObject.addPropertyAssignment({
          name: key,
          initializer,
        })
      }
    }

    await this.saveConfig(sourceFile)
  }

  /**
   * Migrates object-format integrations to the string shorthand format.
   * e.g. `chat: { version: "chat@0.7.6", enabled: true }` → `chat: "chat@0.7.6"`
   *
   * Returns the list of alias names that were migrated.
   */
  async migrateIntegrationsToStringFormat(): Promise<string[]> {
    const { sourceFile, candidates } = this.getIntegrationConfigMigrationCandidates()
    const migrated: string[] = []

    for (const candidate of candidates) {
      if (!candidate.versionInitializerText || candidate.hasConfigProperty) {
        continue
      }

      candidate.assignment.setInitializer(candidate.versionInitializerText)
      migrated.push(candidate.alias)
    }

    if (migrated.length > 0) {
      await this.saveConfig(sourceFile)
    }

    return migrated
  }

  /**
   * Checks which integrations still use the deprecated object format and which
   * of those entries can be safely rewritten to string shorthand.
   */
  getIntegrationConfigMigrationState(): IntegrationConfigMigrationState {
    try {
      const { candidates } = this.getIntegrationConfigMigrationCandidates()
      const deprecatedAliases = candidates.map((candidate) => candidate.alias)
      const migratableAliases = candidates
        .filter((candidate) => candidate.versionInitializerText && !candidate.hasConfigProperty)
        .map((candidate) => candidate.alias)

      return { deprecatedAliases, migratableAliases }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(
        `Configuration update failed with error: ${message} — please verify that there are no syntax errors in your agent.config.ts`
      )
      return { deprecatedAliases: [], migratableAliases: [] }
    }
  }

  /**
   * Checks if any integrations use the deprecated object format.
   * Returns alias names of integrations using the deprecated format.
   */
  getObjectFormatIntegrations(): string[] {
    return this.getIntegrationConfigMigrationState().deprecatedAliases
  }

  /**
   * Serializes a string literal using single quotes, escaping any embedded single quotes.
   */
  private serializeStringLiteral(value: string): string {
    return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
  }

  /**
   * Builds the initializer for a new secret declaration:
   *   { description: '…', optional: true }
   * Only emits fields that are provided.
   */
  private buildSecretInitializer(update: { description?: string; optional?: boolean }): string {
    const parts: string[] = []
    if (update.description !== undefined) {
      parts.push(`description: ${this.serializeStringLiteral(update.description)}`)
    }
    if (update.optional !== undefined) {
      parts.push(`optional: ${update.optional ? 'true' : 'false'}`)
    }
    return `{ ${parts.join(', ')} }`
  }

  /**
   * Adds, updates, or removes entries inside the top-level `secrets` object.
   *
   * Shape:
   *   secrets: {
   *     MY_SECRET: { description: '...', optional: true },
   *   }
   *
   * For `update`, only the fields provided (`description` / `optional`) are modified;
   * other keys on the existing secret declaration are preserved.
   */
  async updateSecrets(updates: SecretDeclarationUpdate[]): Promise<void> {
    const { sourceFile, configObject } = this.loadConfig()

    const hasAdds = updates.some((u) => u.action === 'add')

    let secretsProp = configObject.getProperty('secrets') as PropertyAssignment | undefined
    if (!secretsProp) {
      if (!hasAdds) return
      secretsProp = configObject.addPropertyAssignment({
        name: 'secrets',
        initializer: '{}',
      })
    }

    const secretsObject = secretsProp.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
    if (!secretsObject) return

    for (const update of updates) {
      const existing = secretsObject.getProperty(update.field) as PropertyAssignment | undefined

      switch (update.action) {
        case 'add':
          if (!existing) {
            secretsObject.addPropertyAssignment({
              name: update.field,
              initializer: this.buildSecretInitializer(update),
            })
          }
          break
        case 'update': {
          if (!existing) break
          const existingInit = existing.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
          if (!existingInit) {
            // Replace malformed initializer with a fresh object literal
            existing.setInitializer(this.buildSecretInitializer(update))
            break
          }

          if (update.description !== undefined) {
            const descProp = existingInit.getProperty('description') as PropertyAssignment | undefined
            const initializer = this.serializeStringLiteral(update.description)
            if (descProp) {
              descProp.setInitializer(initializer)
            } else {
              existingInit.addPropertyAssignment({ name: 'description', initializer })
            }
          }

          if (update.optional !== undefined) {
            const optionalProp = existingInit.getProperty('optional') as PropertyAssignment | undefined
            const initializer = update.optional ? 'true' : 'false'
            if (optionalProp) {
              optionalProp.setInitializer(initializer)
            } else {
              existingInit.addPropertyAssignment({ name: 'optional', initializer })
            }
          }
          break
        }
        case 'remove':
          if (existing) {
            existing.remove()
          }
          break
      }
    }

    await this.saveConfig(sourceFile)
  }

  /**
   * Adds, updates, or removes fields inside configuration.schema (the z.object({...}))
   */
  async updateConfiguration(updates: ConfigSchemaFieldUpdate[]): Promise<void> {
    const { sourceFile, configObject } = this.loadConfig()

    const hasAdds = updates.some((u) => u.action === 'add')

    // Find or create configuration property
    let configProp = configObject.getProperty('configuration') as PropertyAssignment | undefined
    if (!configProp) {
      if (!hasAdds) return
      configProp = configObject.addPropertyAssignment({
        name: 'configuration',
        initializer: '{ schema: z.object({}) }',
      })
    }

    const configInit = configProp.getInitializerIfKind(SyntaxKind.ObjectLiteralExpression)
    if (!configInit) return

    // Find or create schema property
    let schemaProp = configInit.getProperty('schema') as PropertyAssignment | undefined
    if (!schemaProp) {
      if (!hasAdds) return
      schemaProp = configInit.addPropertyAssignment({
        name: 'schema',
        initializer: 'z.object({})',
      })
    }

    const schemaCall = schemaProp.getInitializerIfKind(SyntaxKind.CallExpression)
    if (!schemaCall) return

    const schemaArg = schemaCall.getArguments()[0]
    if (!schemaArg || !schemaArg.isKind(SyntaxKind.ObjectLiteralExpression)) return

    const schemaObject = schemaArg as ObjectLiteralExpression

    for (const update of updates) {
      const existing = schemaObject.getProperty(update.field) as PropertyAssignment | undefined

      switch (update.action) {
        case 'add':
          if (!existing && update.definition) {
            schemaObject.addPropertyAssignment({
              name: update.field,
              initializer: update.definition,
            })
          }
          break
        case 'update':
          if (existing && update.definition) {
            existing.setInitializer(update.definition)
          }
          break
        case 'remove':
          if (existing) {
            existing.remove()
          }
          break
      }
    }

    await this.saveConfig(sourceFile)
  }

  /**
   * Removes the top-level `dependencies` field from agent.config.ts.
   * Used during migration to move dependencies to Cloud-backed .adk snapshots.
   */
  async removeDependenciesField(): Promise<void> {
    const { sourceFile, configObject } = this.loadConfig()

    const dependenciesProp = configObject.getProperty('dependencies') as PropertyAssignment | undefined
    if (dependenciesProp) {
      dependenciesProp.remove()
      await this.saveConfig(sourceFile)
    }
  }
}
