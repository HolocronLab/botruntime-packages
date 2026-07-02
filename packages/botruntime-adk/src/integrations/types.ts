import { Integration } from '@holocronlab/botruntime-client'

export interface IntegrationRef {
  workspace?: string
  name: string
  version: string
  fullName: string
}

export type IntegrationDefinition = Integration

export interface CachedIntegration {
  definition: IntegrationDefinition
  cachedAt: string
  expiresAt?: string
}

export interface IntegrationValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  missingChannels?: boolean
}

export interface ParsedIntegration {
  alias: string
  ref: IntegrationRef
  enabled?: boolean
  configurationType?: string
  config?: Record<string, unknown>
  definition?: IntegrationDefinition
  validationResult?: IntegrationValidationResult
}
