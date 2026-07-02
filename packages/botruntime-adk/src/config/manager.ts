import type { Client } from '@holocronlab/botruntime-client'
import { AdkError, isAdkError } from '@holocronlab/botruntime-analytics'
import { z } from '@holocronlab/botruntime-sdk'
import { sync as jex } from '@holocronlab/botruntime-jex'
import { getProjectClient, type Credentials, type ProjectCredentialsContext } from '../auth'
import { serializeSchema } from '../utils/schema-serialization'
import { coerceConfigValue, getInnerTypeName } from './coerce-config-value'

export interface StoredConfig {
  [key: string]: unknown
}

export interface ConfigFieldDescriptor {
  key: string
  type: 'string' | 'number' | 'boolean' | 'unknown'
  required: boolean
  description?: string
  defaultValue?: unknown
  currentValue?: unknown
}

export type SetResult =
  | {
      success: false
      error: string
    }
  | {
      success: true
      data: unknown
    }

export interface ConfigManagerOptions {
  project?: ProjectCredentialsContext
  credentials?: Credentials
  apiUrl?: string
  workspaceId?: string
}

export class ConfigManager {
  private botId: string
  private options: ConfigManagerOptions
  private client: Client | undefined

  constructor(botId: string, options: ConfigManagerOptions = {}) {
    this.botId = botId
    this.options = options
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.client = await getProjectClient({
        project: this.options.project,
        credentials: this.options.credentials,
        apiUrl: this.options.apiUrl,
        workspaceId: this.options.workspaceId,
        botId: this.botId,
        headers: {
          'x-multiple-integrations': 'true',
        },
      })
    }
    return this.client
  }

  /**
   * Load stored configuration from bot.configuration.data
   */
  async load(): Promise<StoredConfig> {
    try {
      const client = await this.getClient()
      const { bot } = await client.getBot({ id: this.botId })
      return (bot.configuration?.data as StoredConfig) || {}
    } catch (error) {
      console.warn(`Failed to load configuration from bot ${this.botId}:`, error)
      return {}
    }
  }

  /**
   * Save configuration to bot.configuration
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod requires any for generic ZodObject
  async save(config: StoredConfig, schema?: z.ZodObject<any>): Promise<void> {
    try {
      const client = await this.getClient()
      const { bot } = await client.getBot({ id: this.botId })

      // Update schema if provided and different
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK updateBot expects specific schema type
      const updates: { id: string; configuration: { data: StoredConfig; schema?: any } } = {
        id: this.botId,
        configuration: {
          data: config,
        },
      }

      if (schema) {
        const schemaJson = serializeSchema('Agent configuration', () => schema.toJSONSchema())
        const currentSchema = bot.configuration?.schema || {}

        // Use jex to compare schemas (synchronous comparison)
        if (!jex.jsonSchemaEquals(currentSchema, schemaJson)) {
          updates.configuration.schema = schemaJson
        }
      }

      await client.updateBot(updates)
    } catch (error) {
      // Surface an already-actionable AdkError (e.g. SCHEMA_NOT_SERIALIZABLE) instead of burying it.
      if (isAdkError(error)) throw error
      throw new AdkError({
        code: 'BOT_CONFIG_SAVE_FAILED',
        message: `Failed to save configuration to bot ${this.botId}: ${error}`,
        expected: true,
        cause: error,
      })
    }
  }

  /**
   * Get a configuration value
   */
  async get(key: string): Promise<unknown> {
    const config = await this.load()
    return config[key]
  }

  /**
   * Set a configuration value
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod requires any for generic ZodObject
  async set(key: string, value: unknown, schema?: z.ZodObject<any>): Promise<void> {
    const config = await this.load()
    config[key] = value
    await this.save(config, schema)
  }

  /**
   * Get all configuration values
   */
  async getAll(): Promise<Record<string, unknown>> {
    return await this.load()
  }

  /**
   * Validate configuration against a schema
   * Returns { valid: boolean, errors: string[], missing: string[] }
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod requires any for generic ZodObject
  async validate(schema: z.ZodObject<any>): Promise<{
    valid: boolean
    errors: string[]
    missing: string[]
  }> {
    const config = await this.getAll()
    const result = schema.safeParse(config)

    if (result.success) {
      return { valid: true, errors: [], missing: [] }
    }

    const errors: string[] = []
    const missing: string[] = []

    for (const issue of result.error.issues) {
      const key = issue.path.join('.')
      if (issue.code === 'invalid_type' && issue.received === 'undefined') {
        missing.push(key)
      }
      errors.push(`${key}: ${issue.message}`)
    }

    return { valid: false, errors, missing }
  }

  /**
   * Get missing required configuration keys
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod requires any for generic ZodObject
  async getMissingKeys(schema: z.ZodObject<any>): Promise<string[]> {
    const validation = await this.validate(schema)
    return validation.missing
  }

  /**
   * Check if configuration is valid
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod requires any for generic ZodObject
  async isValid(schema: z.ZodObject<any>): Promise<boolean> {
    const validation = await this.validate(schema)
    return validation.valid
  }

  /**
   * Describe the configuration schema as a serializable list of field descriptors.
   * Merges in current stored values so the UI can render a form without Zod access.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod requires any for generic ZodObject
  async describeSchema(schema: z.ZodObject<any>): Promise<ConfigFieldDescriptor[]> {
    const stored = await this.load()
    const shape = schema.shape as Record<string, z.ZodTypeAny>
    const fields: ConfigFieldDescriptor[] = []

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const innerType = getInnerTypeName(fieldSchema)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod internal _def not exposed in types
      const def = (fieldSchema as any)?._def

      let type: ConfigFieldDescriptor['type'] = 'unknown'
      if (innerType === 'ZodString') type = 'string'
      else if (innerType === 'ZodNumber') type = 'number'
      else if (innerType === 'ZodBoolean') type = 'boolean'

      const typeName: string = def?.typeName ?? ''
      const isOptional = typeName === 'ZodOptional' || typeName === 'ZodNullable'
      const hasDefault = typeName === 'ZodDefault'
      const required = !isOptional && !hasDefault

      let defaultValue: unknown = undefined
      if (hasDefault) {
        defaultValue = def.defaultValue?.()
      }

      const description = fieldSchema.description ?? undefined

      fields.push({
        key,
        type,
        required,
        description,
        defaultValue,
        currentValue: stored[key],
      })
    }

    return fields
  }

  /**
   * Validate and set a single configuration key.
   * Handles coercion from string values (for CLI/UI text inputs).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zod requires any for generic ZodObject
  async setWithValidation(key: string, value: unknown, schema: z.ZodObject<any>): Promise<SetResult> {
    const shape = schema.shape as Record<string, z.ZodTypeAny>
    const fieldSchema = shape[key]

    if (!fieldSchema) {
      return { success: false, error: `Key "${key}" not found in configuration schema` }
    }

    // Coerce string values to the expected type
    const coerced = typeof value === 'string' ? coerceConfigValue(value, fieldSchema) : value

    const result = fieldSchema.safeParse(coerced)
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message)
      return { success: false, error: messages.join('; ') }
    }

    await this.set(key, result.data)
    return { success: true, data: result.data }
  }
}
