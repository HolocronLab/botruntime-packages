// export * from './generators/index.js' // Temporarily disabled due to ESM import issues
export {
  auth,
  bpCliImporter,
  CredentialsManager,
  clearProjectClientCache,
  getProjectClient,
  resolveBotCredentials,
  resolveProjectCredentials,
  resolveWorkspaceCredentials,
} from './auth/index.js'
export type {
  AuthAPI,
  LoginOptions,
  Credentials,
  Profile,
  AuthResult,
  ProjectCredentialsContext,
  ResolveProjectCredentialsOptions,
  WorkspaceCredentials,
  BotCredentials,
  ServerConnectionCredentials,
  GetProjectClientOptions,
} from './auth/index.js'

// Commands
export * from './commands/index.js'

// Canonical home is @holocronlab/botruntime-analytics (shared by cli/ui too); re-exported
// here so adk-internal error subclasses and consumers have a local path.
export { AdkError, isAdkError } from '@holocronlab/botruntime-analytics'
export { workspaceCache } from './workspace/index.js'
export { getRelativeTime } from './utils/time.js'
export { type ChatClient, getChatClient } from './utils/require-chat.js'
export {
  stringifyWithOrder,
  orderKeys,
  agentInfoKeyOrder,
  agentLocalInfoKeyOrder,
  dependenciesKeyOrder,
  integrationKeyOrder,
} from './utils/json-ordering.js'

// Agent Project API
export {
  AgentProject,
  ValidationErrors,
  ConfigWriter,
  BP_TSX_SUFFIX,
  BP_CSS_SUFFIX,
  BP_TYPES_SUFFIX,
  BP_BUNDLE_SUFFIXES,
  COMPONENTS_DIR,
  buildIndexUpdate,
  findConflictingExport,
} from './agent-project/index.js'
export type {
  ConfigSchemaFieldUpdate,
  SecretDeclarationUpdate,
  DefaultModelSelection,
  DefaultModelsUpdate,
  PrimitiveReference,
  CustomComponentReference,
  BuildIndexUpdateArgs,
  IndexLlmInput,
} from './agent-project/index.js'

// Configuration Management API
export { ConfigManager, coerceConfigValue, getInnerTypeName } from './config/index.js'
export type { StoredConfig, ConfigFieldDescriptor, SetResult } from './config/index.js'

// Secrets Management API
export { SecretsManager } from './secrets/index.js'
export type { Environment } from './secrets/index.js'
export { validateSecretName } from '@holocronlab/botruntime-runtime/definition'
export { ValidationErrorCode, ValidationSeverity, ProjectState } from './agent-project/index.js'
export type {
  AgentConfig,
  Dependencies,
  AgentInfo,
  AgentLocalInfo,
  ProjectInfo,
  ValidationResult,
  ValidationError,
  BuildOutput,
  BuildEvent,
  BuildEventType,
  FileChangeEvent,
  FileChangeType,
  WatchOptions,
  Integration,
  IntegrationChange,
  IntegrationSyncResult,
  AgentToolDefinition,
  ToolReference,
} from './agent-project/index.js'

// Agent Init API
export { AgentProjectGenerator } from './agent-init/index.js'
export type { TemplateConfig, TemplateRegistry } from './agent-init/index.js'

// Integration Management API
export { IntegrationManager, IntegrationParser, IntegrationCache } from './integrations/index.js'
export type {
  IntegrationRef,
  IntegrationDefinition,
  ParsedIntegration,
  IntegrationValidationResult,
  HubCacheEntry,
  HubCacheData,
} from './integrations/index.js'

// Plugin Management API
export { PluginParser, PluginManager } from './plugins/index.js'

// Interface Management API
export { InterfaceManager, InterfaceParser, EnhancedInterfaceCache } from './interfaces/index.js'
export type { InterfaceManagerOptions } from './interfaces/index.js'

// Assets Management API
export { AssetsManager } from './assets/index.js'
export type {
  AssetFile,
  LocalAssetFile,
  AssetSyncPlan,
  AssetSyncResult,
  AssetSyncItem,
  AssetSyncOperation,
  AssetSyncOptions,
  AssetsIndex,
} from './assets/index.js'

// Deploy Manifest API
export {
  ADK_MANIFEST_BOT_TAGS,
  DEPLOYED_AGENT_MANIFEST_FILE_KEY,
  DEPLOYED_AGENT_MANIFEST_SCHEMA_VERSION,
  DEPLOYED_AGENT_MANIFEST_TAGS,
  deployedAgentManifestPrimitiveSchema,
  deployedAgentManifestSchema,
  createDeployedAgentManifest,
  serializeDeployedAgentManifest,
  tagDeployedAgentManifestBot,
  uploadDeployedAgentManifest,
} from './deploy-manifest/index.js'
export type {
  CreateDeployedAgentManifestOptions,
  DeployedAgentBotTagClient,
  DeployedAgentManifest,
  DeployedAgentManifestPrimitive,
  DeployedAgentManifestProject,
  DeployedAgentManifestUploadClient,
} from './deploy-manifest/index.js'

// Asset Type Generation
export { generateAssetsTypes, generateAssetsRuntime, initAssets } from './generators/assets.js'
export { generateLocalTypes } from './generators/local-types.js'
export { generateIntegrationTypes } from './generators/integration-types.js'
export { generateClientWrapper } from './generators/client-wrapper.js'

// Bot Generator API
export { BotGenerator, generateBotProject, DevIdManager, IntegrationSync } from './bot-generator/index.js'

export type {
  BotGeneratorOptions,
  BotGenerationMode,
  DependencyInstaller,
  ProjectCache,
  IntegrationInfo,
  SyncResult,
} from './bot-generator/index.js'
export type { ServerConfigTarget } from './integrations/config-utils.js'

// Table Management API
export { TableManager } from './tables/index.js'
export type {
  TableManagerOptions,
  TableSyncPlan,
  TableSyncResult,
  TableSyncOptions,
  TableSyncItem,
  TableSyncOperation,
  LocalTable,
  RemoteTable,
} from './tables/index.js'

// Knowledge Base Management API
export { KnowledgeManager, KBSyncOperation, KBSyncFormatter } from './knowledge/index.js'
export type {
  KnowledgeManagerOptions,
  KBSyncPlan,
  KBSyncResult,
  KBSyncOptions,
  KBSyncItem,
  LocalKnowledgeBase,
  SourceSyncStatus,
  FileChanges,
} from './knowledge/index.js'

// File Watcher API
export { FileWatcher } from './file-watcher/index.js'
export type {
  WatchChangeType,
  FileChange,
  FileChangeEvent as FileWatcherChangeEvent,
  FileWatcherOptions,
} from './file-watcher/index.js'

// Preflight API
export {
  PreflightChecker,
  pluralize,
  assertNoBlockingDependencies,
  findIntegrationVersionMismatches,
  summarizeBlockingDependencies,
  isDeployBlocking,
} from './preflight/index.js'
export type {
  BlockingDependencySummary,
  PreflightCheckResult,
  PendingPreflightResult,
  SecretWarning,
  DeployPlan,
  DeployPlanManagers,
  IntegrationVersionMismatch,
  ApplyOptions,
  SyncCallbacks,
  OrphanedKB,
} from './preflight/index.js'

// Script Runner API
export { ScriptRunner, runScript, setupTestRuntime } from './runner/index.js'
export type {
  ScriptRunnerOptions,
  RunScriptOptions,
  TestRuntimeResult,
  SetupTestRuntimeOptions,
} from './runner/index.js'

// Dependency management — canonical surface for install/remove/sync
export * as dependencies from './dependencies/index.js'
