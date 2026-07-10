import { z } from '@holocronlab/botruntime-sdk'
import { defineConfig } from '@holocronlab/botruntime-runtime'
import { ValidationErrors } from './validation-errors'

export type AgentConfig = ReturnType<typeof defineConfig>

// Plugin dependency mapping schema (matches SDK's PluginConfigInstance.dependencies)
const pluginDependencyMappingSchema = z.object({
  integrationAlias: z.string(),
  integrationInterfaceAlias: z.string().optional(), // present for interface deps, absent for integration deps
})

// Dependencies schema
export const dependenciesSchema = z.object({
  integrations: z
    .record(
      z.union([
        z.string(), // Shorthand: "chat@1.0.0" — server-managed enabled state, disabled on first install
        z.object({
          version: z.string(),
          enabled: z.boolean(), // Whether the integration is enabled
          configurationType: z.string().optional(), // Type of configuration (e.g., "refreshToken", "apiKey")
          config: z.record(z.any()).optional(), // Local config overrides (non-secret)
        }),
      ])
    )
    .optional(),
  plugins: z
    .record(
      z.object({
        version: z.string(),
        config: z.record(z.any()).optional(),
        dependencies: z.record(pluginDependencyMappingSchema).optional(),
        // Internal snapshot metadata; not meant for authoring in agent.config.ts.
        missingFields: z.array(z.string()).optional(),
      })
    )
    .optional(),
})

export type Dependencies = z.infer<typeof dependenciesSchema>

// Shared project link schema (agent.json). This is the production target only.
export const agentInfoSchema = z.object({
  botId: z.string().trim().min(1).describe('The bot ID from Botpress deployment'),
  workspaceId: z.string().trim().min(1).describe('The workspace ID where the bot is deployed'),
  apiUrl: z.string().trim().min(1).optional().describe('The Botpress API URL (e.g., https://api.botpress.cloud)'),
})

export type AgentLink = z.infer<typeof agentInfoSchema>
export type AgentInfo = AgentLink & {
  devId?: string
  devTargetBotId?: string
  devApiUrl?: string
  devWorkspaceId?: string
}

// Agent local info schema (for agent.local.json — gitignored, per-developer overrides)
export const agentLocalInfoSchema = z.object({
  botId: z.string().trim().min(1).optional().describe('The bot ID (overrides agent.json for local development)'),
  workspaceId: z.string().trim().min(1).optional().describe('The workspace ID (overrides agent.json for local development)'),
  apiUrl: z.string().trim().min(1).optional().describe('The Botpress API URL (overrides agent.json for local development)'),
  devId: z.string().trim().min(1).optional().describe('The development bot ID used during local development'),
  devTargetBotId: z.string().trim().min(1).optional().describe('The numeric development control-plane bot ID'),
  devApiUrl: z.string().trim().min(1).optional().describe('The canonical API URL that scopes the cached dev target'),
  devWorkspaceId: z.string().trim().min(1).optional().describe('The workspace ID that scopes the cached dev target'),
})
export type AgentLocalInfo = z.infer<typeof agentLocalInfoSchema>

// File change event types
export enum FileChangeType {
  Added = 'added',
  Modified = 'modified',
  Deleted = 'deleted',
}

export interface FileChangeEvent {
  type: FileChangeType
  path: string
  relativePath: string
}

// Build event types
export enum BuildEventType {
  Started = 'started',
  Progress = 'progress',
  Success = 'success',
  Error = 'error',
  Warning = 'warning',
}

export interface BuildEvent {
  type: BuildEventType
  message?: string
  error?: Error
  warnings?: string[]
}

// Validation error codes
export enum ValidationErrorCode {
  // Project structure errors
  DIRECTORY_NOT_FOUND = 'DIRECTORY_NOT_FOUND',
  DIRECTORY_ACCESS_ERROR = 'DIRECTORY_ACCESS_ERROR',
  REQUIRED_FILE_MISSING = 'REQUIRED_FILE_MISSING',
  INVALID_STRUCTURE = 'INVALID_STRUCTURE',

  // Configuration errors
  INVALID_CONFIG_SYNTAX = 'INVALID_CONFIG_SYNTAX',
  INVALID_CONFIG_SCHEMA = 'INVALID_CONFIG_SCHEMA',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  AGENT_NOT_LINKED = 'AGENT_NOT_LINKED',

  // Dependencies errors
  INVALID_DEPENDENCIES_SYNTAX = 'INVALID_DEPENDENCIES_SYNTAX',
  INVALID_DEPENDENCIES_SCHEMA = 'INVALID_DEPENDENCIES_SCHEMA',
  INVALID_VERSION_FORMAT = 'INVALID_VERSION_FORMAT',
  INVALID_INTEGRATION_ALIAS = 'INVALID_INTEGRATION_ALIAS',
  INVALID_PLUGIN_ALIAS = 'INVALID_PLUGIN_ALIAS',
  UNKNOWN_INTEGRATION = 'UNKNOWN_INTEGRATION',
  UNKNOWN_PLUGIN = 'UNKNOWN_PLUGIN',
  INVALID_PLUGIN_DEPENDENCY = 'INVALID_PLUGIN_DEPENDENCY',
  INCOMPATIBLE_VERSION = 'INCOMPATIBLE_VERSION',
  CIRCULAR_DEPENDENCY = 'CIRCULAR_DEPENDENCY',

  // File errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE = 'INVALID_FILE_TYPE',
  INVALID_FILE_NAME = 'INVALID_FILE_NAME',
  DUPLICATE_FILE_NAME = 'DUPLICATE_FILE_NAME',
  DUPLICATE_PRIMITIVE = 'DUPLICATE_PRIMITIVE',
  INVALID_PRIMITIVE_DEFINITION = 'INVALID_PRIMITIVE_DEFINITION',
  TABLE_TOO_MANY_COLUMNS = 'TABLE_TOO_MANY_COLUMNS',

  // Runtime errors
  BUILD_FAILED = 'BUILD_FAILED',
  SYNTAX_ERROR = 'SYNTAX_ERROR',
  TYPE_ERROR = 'TYPE_ERROR',
  IMPORT_ERROR = 'IMPORT_ERROR',
}

// Validation severity levels
export enum ValidationSeverity {
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

// Enhanced validation error interface
export interface ValidationError {
  $type: typeof ValidationErrors.$type
  code: ValidationErrorCode
  severity: ValidationSeverity
  message: string
  file?: string
  line?: number
  column?: number
  hint?: string
  documentation?: string
  context?: Record<string, unknown>
}

// Validation result with categorized errors
export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
  info: ValidationError[]
  errorCount: number
  warningCount: number
  infoCount: number
}

// Agent project state
export enum ProjectState {
  Unloaded = 'unloaded',
  Loading = 'loading',
  Ready = 'ready',
  Building = 'building',
  Error = 'error',
}

// Build output types
export interface BuildOutput {
  files: Map<string, Buffer | string>
  metadata: {
    buildTime: Date
    version?: string
    checksum?: string
  }
}

// Watch options
export interface WatchOptions {
  ignore?: string[]
  debounce?: number
  autoBuild?: boolean
}

// Integration types
export interface Integration {
  name: string
  version: string
  workspace?: string // Optional workspace name
  config?: Record<string, unknown>
  installed?: boolean
  installedVersion?: string
  hasChannels?: boolean
}

export interface IntegrationChange {
  type: 'install' | 'update' | 'uninstall'
  integration: Integration
  from?: string // For updates: from version
  to?: string // For updates: to version
}

export interface IntegrationSyncResult {
  changes: IntegrationChange[]
  applied: boolean
  errors?: Error[]
}

export interface AgentToolDefinition {
  name: string
  description?: string
}

export interface ToolReference {
  path: string
  export: string
  definition: AgentToolDefinition
}

// Project info
export interface ProjectInfo {
  path: string
  config: AgentConfig
  dependencies: Dependencies
  agentInfo?: AgentInfo // Optional deployment information
  state: ProjectState
  lastBuildTime?: Date
  errors: ValidationError[]
  warnings: ValidationError[]
  errorCount: number
  warningCount: number
  infoCount: number
  integrations?: Integration[] // Parsed integrations from dependencies
}

export type IntegrationDependency = {
  type: 'integration'
  integration: {
    name: string
    version: string
    enabled: boolean
  }
}

export type InterfaceDependency = {
  type: 'interface'
  interface: {
    name: string
    version: string
  }
}

export type PluginDependency = {
  type: 'plugin'
  plugin: {
    name: string
    version: string
  }
}

export type Dependency = IntegrationDependency | InterfaceDependency | PluginDependency
