import { z } from '@holocronlab/botruntime-sdk'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { AGENT0_CONFIG_SCHEMA_VERSION, type Agent0Config, type Agent0ConfigPreferences } from '../types.js'

export const agent0ProviderAuthSchema = z
  .object({
    type: z.literal('api_key'),
    apiKey: z.string().trim().min(1),
    baseURL: z.string().trim().url().optional(),
  })
  .strict()

export const agent0ProviderConnectionSchema = z
  .object({
    providerId: z.string().min(1),
    enabled: z.boolean(),
    auth: agent0ProviderAuthSchema.optional(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const agent0ConfigPreferencesSchema = z
  .object({
    defaultModel: z.string().min(1).optional(),
    showThinking: z.boolean(),
    showUsage: z.boolean(),
  })
  .strict()

export const agent0ConfigSchema = z
  .object({
    schemaVersion: z.literal(AGENT0_CONFIG_SCHEMA_VERSION),
    enabled: z.boolean(),
    providers: z.record(agent0ProviderConnectionSchema),
    preferences: agent0ConfigPreferencesSchema,
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })
  .strict()

export const DEFAULT_AGENT0_PREFERENCES: Agent0ConfigPreferences = {
  showThinking: true,
  showUsage: false,
}

export function createDefaultAgent0Config(now = new Date()): Agent0Config {
  const timestamp = now.toISOString()
  return {
    schemaVersion: AGENT0_CONFIG_SCHEMA_VERSION,
    enabled: true,
    providers: {},
    preferences: { ...DEFAULT_AGENT0_PREFERENCES },
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function parseAgent0Config(value: unknown): Agent0Config {
  const config = agent0ConfigSchema.parse(value)

  for (const [key, connection] of Object.entries(config.providers)) {
    if (key !== connection.providerId) {
      throw new AdkError({
        code: 'AGENT0_CONFIG_KEY_MISMATCH',
        message: `Provider connection key "${key}" does not match providerId "${connection.providerId}"`,
        expected: false,
      })
    }
  }

  return config
}
