import { BuiltInActions, BuiltInWorkflows, Errors, Primitives, setAdkCommand } from '@holocronlab/botruntime-runtime/internal'
import { Autonomous } from '@holocronlab/botruntime-runtime'
import { AdkError } from '@holocronlab/botruntime-analytics'
import createDebug from 'debug'
import { createRequire } from 'module'

import fs from 'fs/promises'
import path from 'path'

import { AssetsManager, AssetSyncOptions, AssetSyncPlan, AssetSyncResult } from '../assets/index.js'
import { IntegrationManager } from '../integrations/index.js'
import { ParsedIntegration } from '../integrations/types.js'
import { InterfaceManager } from '../interfaces/index.js'
import { ParsedInterface } from '../interfaces/types.js'

import { agentInfoKeyOrder, agentLocalInfoKeyOrder, stringifyWithOrder } from '../utils/json-ordering.js'
import { expandExports } from './expand-exports.js'
import { resolveComponentSources } from './component-source-resolver.js'
import { COMPONENTS_DIR } from './component-files.js'
import { resolveAgent } from './agent-resolver.js'
import {
  AgentConfig,
  AgentInfo,
  AgentLink,
  AgentToolDefinition,
  AgentLocalInfo,
  Dependencies,
  Integration,
  ProjectInfo,
  ProjectState,
  ValidationError,
  ValidationErrorCode,
  ValidationResult,
  ValidationSeverity,
  ToolReference,
  agentInfoSchema,
} from './types.js'
import { ValidationErrors } from './validation-errors.js'
import { findTableColumnViolations } from '../bot-generator/table-validation.js'
import { MAX_TABLE_COLUMNS } from '../constants.js'
import { DependencySnapshotStore } from '../dependencies/snapshot-store.js'
import { dependencyStateToDependencies } from './dependency-state-to-dependencies.js'

export interface AgentProjectOptions {
  noCache?: boolean
  adkCommand?: 'adk-dev' | 'adk-build' | 'adk-deploy'
  offline?: boolean
}

export type AgentProjectLoader = (projectPath: string) => Promise<AgentProject>

const debug = createDebug('adk:agent-project')
type ConversationDefinition = Primitives.Definitions.ConversationDefinition
type KnowledgeDefinition = Primitives.Definitions.KnowledgeDefinition
type TriggerDefinition = Primitives.Definitions.TriggerDefinition
type WorkflowDefinition = Primitives.Definitions.WorkflowDefinition
type ActionDefinition = Primitives.Definitions.ActionDefinition
type TableDefinition = Primitives.Definitions.TableDefinition
type CustomComponentDefinition = Primitives.Definitions.CustomComponentDefinition
type PrimitiveDefinition = Primitives.Definitions.PrimitiveDefinition

export type PrimitiveReference<T extends PrimitiveDefinition = PrimitiveDefinition> = {
  path: string
  export: string
  definition: T
}

export type CustomComponentReference = PrimitiveReference<CustomComponentDefinition> & {
  source: string
  // `BaseCustomComponent` instance, kept as `unknown` to keep ADK free of `@holocronlab/botruntime-runtime`.
  instance: unknown
}

function getToolDefinition(value: unknown): AgentToolDefinition | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined
  }

  const maybeTool = value as Autonomous.Tool
  const isAutonomousToolInstance = value instanceof Autonomous.Tool
  // Structural duck-typing fallback: don't rely on constructor.name which gets
  // minified in compiled binaries, causing instanceof and name checks to fail
  // across module boundaries.
  const looksLikeAutonomousTool =
    typeof maybeTool.name === 'string' &&
    typeof maybeTool.execute === 'function' &&
    typeof maybeTool.toJSON === 'function'

  if (!isAutonomousToolInstance && !looksLikeAutonomousTool) {
    return undefined
  }

  return {
    name: maybeTool.name,
    description: maybeTool.description,
  }
}

export class AgentProject {
  private static _projectCache = new Map<string, AgentProject>()

  private _options: AgentProjectOptions
  private _path: string
  private _config?: AgentConfig
  private _dependencies?: Dependencies
  private _agentInfo?: AgentInfo
  private _state: ProjectState = ProjectState.Unloaded
  private _errors: ValidationError[] = []
  private _warnings: ValidationError[] = []

  private _lastBuildTime?: Date
  private _integrations?: ParsedIntegration[]
  private _interfaces?: ParsedInterface[]
  private _integrationManager: IntegrationManager
  private _interfaceManager: InterfaceManager
  private _assetsManager: AssetsManager
  private _conversations: PrimitiveReference<ConversationDefinition>[] = []
  private _knowledge: PrimitiveReference<KnowledgeDefinition>[] = []
  private _triggers: PrimitiveReference<TriggerDefinition>[] = []
  private _workflows: PrimitiveReference<WorkflowDefinition>[] = []
  private _actions: PrimitiveReference<ActionDefinition>[] = []
  private _tables: PrimitiveReference<TableDefinition>[] = []
  private _customComponents: CustomComponentReference[] = []
  private _tools: ToolReference[] = []

  constructor(projectPath: string, options: AgentProjectOptions = {}) {
    this._options = options
    this._path = path.resolve(projectPath)
    this._integrationManager = new IntegrationManager({
      noCache: options.noCache,
    })
    this._interfaceManager = new InterfaceManager({
      noCache: options.noCache,
    })
    this._assetsManager = new AssetsManager({
      projectPath: this._path,
    })
  }

  // Static factory methods
  static async load(projectPath: string, options: AgentProjectOptions = {}): Promise<AgentProject> {
    const resolvedPath = path.resolve(projectPath)
    const cacheKey = AgentProject._getCacheKey(resolvedPath, options)

    // Check cache unless explicitly disabled
    if (!options.noCache) {
      const cached = AgentProject._projectCache.get(cacheKey)
      if (cached) {
        return cached
      }
    }

    // Create and load new project
    const project = new AgentProject(resolvedPath, options)
    await project.reload()

    // Cache the project unless caching is disabled
    if (!options.noCache) {
      AgentProject._projectCache.set(cacheKey, project)
    }

    return project
  }

  private static _getCacheKey(resolvedPath: string, options: AgentProjectOptions): string {
    const adkCommand = options.adkCommand ?? 'default'
    const offline = options.offline ? 'offline' : 'online'
    return `${resolvedPath}\0${adkCommand}\0${offline}`
  }

  // Static method to clear the cache
  static clearCache(): void {
    AgentProject._projectCache.clear()
  }

  // Static method to remove a specific project from cache
  static clearCacheForPath(projectPath: string): void {
    const resolvedPath = path.resolve(projectPath)
    const prefix = `${resolvedPath}\0`
    for (const key of AgentProject._projectCache.keys()) {
      if (key.startsWith(prefix)) {
        AgentProject._projectCache.delete(key)
      }
    }
  }

  // Public properties
  get path(): string {
    return this._path
  }

  get conversations(): PrimitiveReference<ConversationDefinition>[] {
    return this._conversations
  }

  get knowledge(): PrimitiveReference<KnowledgeDefinition>[] {
    return this._knowledge
  }

  get triggers(): PrimitiveReference<TriggerDefinition>[] {
    return this._triggers
  }

  get workflows(): PrimitiveReference<WorkflowDefinition>[] {
    return this._workflows
  }

  get actions(): PrimitiveReference<ActionDefinition>[] {
    return this._actions
  }

  get tables(): PrimitiveReference<TableDefinition>[] {
    return this._tables
  }

  get customComponents(): CustomComponentReference[] {
    return this._customComponents
  }

  get tools(): ToolReference[] {
    return this._tools
  }

  get config(): AgentConfig | undefined {
    return this._config
  }

  get dependencies(): Dependencies | undefined {
    return this._dependencies
  }

  get agentInfo(): AgentInfo | undefined {
    return this._agentInfo
  }

  get state(): ProjectState {
    return this._state
  }

  get info(): ProjectInfo {
    return {
      path: this._path,
      config: this._config!,
      dependencies: this._dependencies || {
        integrations: {},
      },
      agentInfo: this._agentInfo,
      state: this._state,
      lastBuildTime: this._lastBuildTime,
      errors: [...this._errors],
      warnings: [...this._warnings],
      errorCount: this._errors.filter((e) => e.severity === ValidationSeverity.ERROR).length,
      warningCount: this._warnings.filter((e) => e.severity === ValidationSeverity.WARNING).length,
      infoCount: [...this._errors, ...this._warnings].filter((e) => e.severity === ValidationSeverity.INFO).length,
    }
  }

  // Core methods
  async reload(): Promise<void> {
    this._state = ProjectState.Loading

    try {
      // Clear previous state
      this._conversations = []
      this._knowledge = []
      this._triggers = []
      this._workflows = []
      this._actions = []
      this._tables = []
      this._tools = []
      this._errors = []
      this._warnings = []
      this._customComponents = []

      // Validate project structure
      const validation = await this.validate()
      this._errors = validation.errors
      this._warnings = validation.warnings

      if (!validation.valid) {
        this._state = ProjectState.Error

        throw new AdkError({
          code: 'PROJECT_VALIDATION_FAILED',
          expected: true,
          message: `Project validation failed: ${validation.errors[0]?.message}`,
          details: { errors: validation.errors },
        })
      }

      // Load agent info FIRST so we have the workspaceId
      await this.loadAgentInfo()

      // Create managers with the correct workspaceId from agent.json
      this._integrationManager = new IntegrationManager({
        noCache: this._options.noCache,
        project: this,
      })

      this._interfaceManager = new InterfaceManager({
        noCache: this._options.noCache,
        project: this,
      })

      this._assetsManager = new AssetsManager({
        projectPath: this._path,
        botId: this._agentInfo?.botId,
      })

      // Load configuration (which will use the managers with correct workspaceId)
      await this.loadConfig()

      await this.loadBuiltInWorkflows()
      await this.loadBuiltInActions()
      await this.loadAgentPrimitives()

      if (this._errors.length > 0) {
        this._state = ProjectState.Error
      } else {
        this._state = ProjectState.Ready
      }
    } catch (error) {
      this._state = ProjectState.Error

      throw error
    }
  }

  async validate(): Promise<ValidationResult> {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []
    const info: ValidationError[] = []

    try {
      // Check if directory exists
      await fs.access(this._path)

      // Check for required files
      const requiredFiles = ['agent.config.ts']
      for (const file of requiredFiles) {
        try {
          await fs.access(path.join(this._path, file))
        } catch {
          errors.push(ValidationErrors.requiredFileMissing(file))
        }
      }

      // Check for agent.json (optional, but warn if missing for deployed projects)
      try {
        await fs.access(path.join(this._path, 'agent.json'))
      } catch {
        // agent.json is optional, but we add an informational message
        info.push({
          $type: 'ValidationError',
          code: ValidationErrorCode.MISSING_REQUIRED_FIELD,
          severity: ValidationSeverity.INFO,
          message: 'agent.json not found - this file will be required for deployment and remote operations',
          file: 'agent.json',
          hint: 'Create agent.json with botId and workspaceId after deploying your agent',
        })
      }

      // Check directory structure
      const expectedDirs = ['actions', 'workflows', 'conversations', 'assets']
      for (const dir of expectedDirs) {
        try {
          const stats = await fs.stat(path.join(this._path, dir))
          if (!stats.isDirectory()) {
            warnings.push(ValidationErrors.invalidStructure(dir, 'directory'))
          }
        } catch {
          // Directory doesn't exist, which is okay - they're optional
        }
      }
    } catch (error) {
      errors.push(ValidationErrors.directoryAccessError(this._path, String(error)))
    }

    for (const violation of findTableColumnViolations(this._tables)) {
      errors.push(
        ValidationErrors.tableTooManyColumns(violation.name, violation.path, violation.columnCount, MAX_TABLE_COLUMNS)
      )
    }

    // Filter by severity
    const errorsBySeverity = {
      errors: errors.filter((e) => e.severity === ValidationSeverity.ERROR),
      warnings: [...warnings, ...errors.filter((e) => e.severity === ValidationSeverity.WARNING)],
      info: [...info, ...errors.filter((e) => e.severity === ValidationSeverity.INFO)],
    }

    return {
      valid: errorsBySeverity.errors.length === 0,
      errors: errorsBySeverity.errors,
      warnings: errorsBySeverity.warnings,
      info: errorsBySeverity.info,
      errorCount: errorsBySeverity.errors.length,
      warningCount: errorsBySeverity.warnings.length,
      infoCount: errorsBySeverity.info.length,
    }
  }

  get integrations(): ParsedIntegration[] {
    if (!this._integrations) {
      throw new AdkError({ code: 'PROJECT_NOT_LOADED', expected: false, message: 'Integrations not loaded' })
    }

    return this._integrations!
  }

  get interfaces(): ParsedInterface[] {
    if (!this._interfaces) {
      throw new AdkError({ code: 'PROJECT_NOT_LOADED', expected: false, message: 'Interfaces not loaded' })
    }
    return this._interfaces!
  }

  // Integration management methods
  async getIntegrations(): Promise<Integration[]> {
    if (!this._dependencies || !this._integrations) {
      throw new AdkError({ code: 'PROJECT_NOT_LOADED', expected: false, message: 'Project not loaded' })
    }

    // Convert ParsedIntegration to Integration format
    return this._integrations.map((parsed) => ({
      name: parsed.alias,
      version: parsed.ref.version,
      workspace: parsed.ref.workspace,
      config: parsed.config,
      installed: false, // This would be determined by checking workspace
      installedVersion: undefined,
      hasChannels: parsed.definition?.channels && Object.keys(parsed.definition.channels).length > 0,
    }))
  }

  // Asset management methods
  async createAssetSyncPlan(): Promise<AssetSyncPlan> {
    if (this._state !== ProjectState.Ready) {
      throw new AdkError({
        code: 'PROJECT_NOT_READY',
        expected: false,
        message: 'Project must be in Ready state to create asset sync plan',
      })
    }

    this.requiresAgentInfo('create asset sync plan')
    return await this._assetsManager.createSyncPlan()
  }

  async syncAssets(options?: AssetSyncOptions): Promise<AssetSyncResult> {
    if (this._state !== ProjectState.Ready) {
      throw new AdkError({
        code: 'PROJECT_NOT_READY',
        expected: false,
        message: 'Project must be in Ready state to sync assets',
      })
    }

    this.requiresAgentInfo('sync assets')
    const plan = await this._assetsManager.createSyncPlan()
    return await this._assetsManager.executeSync(plan, options)
  }

  async hasAssetsDirectory(): Promise<boolean> {
    return await this._assetsManager.hasAssetsDirectory()
  }

  get assetsManager(): AssetsManager {
    return this._assetsManager
  }

  // Agent info management methods
  async createAgentInfo(info: AgentLink): Promise<void> {
    const agentJsonData: AgentLink = {
      botId: info.botId,
      workspaceId: info.workspaceId,
      apiUrl: info.apiUrl,
    }
    const agentPath = path.join(this._path, 'agent.json')
    const agentContent = stringifyWithOrder(agentJsonData, agentInfoKeyOrder)
    await fs.writeFile(agentPath, agentContent)
    this._agentInfo = agentJsonData
  }

  async updateAgentInfo(updates: Partial<AgentLink>): Promise<void> {
    if (!this._agentInfo) {
      throw new AdkError({
        code: 'AGENT_INFO_MISSING',
        expected: false,
        message: 'No agent.json found. Use createAgentInfo() first.',
      })
    }

    const updatedInfo: AgentInfo = {
      botId: updates.botId ?? this._agentInfo.botId,
      workspaceId: updates.workspaceId ?? this._agentInfo.workspaceId,
      apiUrl: 'apiUrl' in updates ? updates.apiUrl : this._agentInfo.apiUrl,
      ...(this._agentInfo.devId ? { devId: this._agentInfo.devId } : {}),
    }
    const agentJsonData: AgentLink = {
      botId: updatedInfo.botId,
      workspaceId: updatedInfo.workspaceId,
      apiUrl: updatedInfo.apiUrl,
    }
    const agentPath = path.join(this._path, 'agent.json')
    const agentContent = stringifyWithOrder(agentJsonData, agentInfoKeyOrder)
    await fs.writeFile(agentPath, agentContent)
    this._agentInfo = updatedInfo
  }

  async createAgentLocalInfo(info: AgentLocalInfo): Promise<void> {
    const localPath = path.join(this._path, 'agent.local.json')
    let existing: AgentLocalInfo = {}
    try {
      const content = await fs.readFile(localPath, 'utf-8')
      existing = JSON.parse(content)
    } catch {
      // File doesn't exist yet
    }
    const merged = { ...existing, ...info }
    const content = stringifyWithOrder(merged, agentLocalInfoKeyOrder)
    await fs.writeFile(localPath, content)
    // Update in-memory merged view
    if (this._agentInfo) {
      if (merged.botId) this._agentInfo.botId = merged.botId
      if (merged.workspaceId) this._agentInfo.workspaceId = merged.workspaceId
      if (merged.apiUrl) this._agentInfo.apiUrl = merged.apiUrl
      if (merged.devId) this._agentInfo.devId = merged.devId
    } else if (merged.botId && merged.workspaceId) {
      this._agentInfo = {
        botId: merged.botId,
        workspaceId: merged.workspaceId,
        apiUrl: merged.apiUrl,
        devId: merged.devId,
      }
    }
  }

  async updateAgentLocalInfo(updates: Partial<AgentLocalInfo>): Promise<void> {
    const localPath = path.join(this._path, 'agent.local.json')
    let existing: AgentLocalInfo = {}
    try {
      const content = await fs.readFile(localPath, 'utf-8')
      existing = JSON.parse(content)
    } catch {
      // File doesn't exist yet
    }
    const updated: Record<string, unknown> = { ...existing, ...updates }
    // Remove undefined keys
    for (const key of Object.keys(updated)) {
      if (updated[key] === undefined) {
        delete updated[key]
      }
    }

    if (Object.keys(updated).length === 0) {
      // No local overrides remain — delete the file so adk dev starts fresh
      try {
        await fs.unlink(localPath)
      } catch {
        // File already gone — no-op
      }
    } else {
      const content = stringifyWithOrder(updated as AgentLocalInfo, agentLocalInfoKeyOrder)
      await fs.writeFile(localPath, content)
    }

    // Recompute in-memory agentInfo from agent.json base + surviving local overrides
    // so cleared fields (e.g. devId) are no longer visible in memory.
    if (this._agentInfo) {
      // Re-read the shared project link; legacy agent.json devId is ignored.
      const agentJsonPath = path.join(this._path, 'agent.json')
      let base: AgentLink = {
        botId: this._agentInfo.botId,
        workspaceId: this._agentInfo.workspaceId,
        apiUrl: this._agentInfo.apiUrl,
      }
      try {
        const agentJsonContent = await fs.readFile(agentJsonPath, 'utf-8')
        const parsed = agentInfoSchema.parse(JSON.parse(agentJsonContent))
        base = {
          botId: parsed.botId,
          workspaceId: parsed.workspaceId,
          apiUrl: parsed.apiUrl,
        }
      } catch {
        // agent.json may not exist (local-only project) — keep existing base
      }
      const local = updated as AgentLocalInfo
      this._agentInfo = {
        botId: local.botId ?? base.botId,
        workspaceId: local.workspaceId ?? base.workspaceId,
        apiUrl: local.apiUrl ?? base.apiUrl,
        devId: local.devId,
      }
    }
  }

  requiresAgentInfo(operation: string): void {
    if (!this._agentInfo?.botId) {
      throw new AdkError({
        code: 'BOT_ID_REQUIRED',
        expected: true,
        message:
          `Operation "${operation}" requires a bot ID. ` +
          'Please create agent.json with botId and workspaceId after deploying your agent.',
        suggestion: 'Create agent.json with botId and workspaceId after deploying your agent.',
      })
    }
  }

  // Private helper methods
  private async loadConfig(): Promise<void> {
    // Default to empty collections so any early-return or thrown-error path below
    // still leaves the project in a state readable by `adk status` and the other
    // consumers of the integrations/interfaces getters. Successful paths overwrite.
    this._dependencies = { integrations: {} }
    this._integrations = []
    this._interfaces = []

    try {
      // Bust module cache to ensure fresh config on reload
      const configPath = path.join(this._path, 'agent.config.ts')
      debug('loading agent.config.ts from %s', configPath)

      // Create a require function that resolves from the user's project directory
      // This is critical for compiled binaries which otherwise resolve modules from the binary's location
      const projectRequire = createRequire(path.join(this._path, 'package.json'))
      debug('created projectRequire from %s', path.join(this._path, 'package.json'))

      // Clear the module from cache if it exists
      try {
        const resolvedPath = projectRequire.resolve(configPath)
        debug('resolved config path: %s', resolvedPath)
        if (projectRequire.cache[resolvedPath]) {
          debug('clearing require.cache for %s', resolvedPath)
          delete projectRequire.cache[resolvedPath]
        }
      } catch {
        // Module not in cache yet, that's fine
        debug('config not in require.cache (first load)')
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic import returns unknown module shape
      let configModule: any
      try {
        // Use ?t= query string for cache busting to ensure fresh imports on reload
        const configUrl = `${configPath}?t=${Date.now()}`
        debug('importing from: %s', configUrl)
        configModule = await import(configUrl)
        debug('successfully loaded agent.config.ts')
      } catch (importError) {
        debug('failed to load agent.config.ts: %O', importError)
        throw importError
      }
      if (!configModule || !configModule.default) {
        this._errors.push({
          $type: 'ValidationError',
          code: ValidationErrorCode.INVALID_CONFIG_SCHEMA,
          severity: ValidationSeverity.ERROR,
          message: 'agent.config.ts does not export a default configuration object',
          file: 'agent.config.ts',
        })
        return
      }

      // Check if the config was created with defineConfig
      const { isAgentConfig } = await import('@holocronlab/botruntime-runtime/internal')
      if (!isAgentConfig(configModule.default)) {
        this._errors.push({
          $type: 'ValidationError',
          code: ValidationErrorCode.INVALID_CONFIG_SCHEMA,
          severity: ValidationSeverity.ERROR,
          message:
            'agent.config.ts must export the result of defineConfig(). ' +
            "Example: export default defineConfig({ name: 'my-agent', ... })",
          file: 'agent.config.ts',
          hint: 'Wrap your config object with defineConfig() from @holocronlab/botruntime-runtime',
        })
        return
      }

      this._config = configModule.default as AgentConfig

      const dependencyEnv = this._options.adkCommand === 'adk-deploy' ? 'prod' : 'dev'
      const snapshotStore = new DependencySnapshotStore({ projectPath: this._path })
      let snapshotBasedDependencies: Dependencies | undefined
      let dependencySnapshotReadFailed = false
      try {
        const snapshot = await snapshotStore.read(dependencyEnv)
        const state = snapshot ?? { version: 1 as const, env: dependencyEnv, integrations: {}, plugins: {} }
        const hasDependencies = Object.keys(state.integrations).length > 0 || Object.keys(state.plugins).length > 0
        if (hasDependencies) {
          snapshotBasedDependencies = dependencyStateToDependencies(state)
        }
      } catch (err) {
        this._warnings.push({
          $type: 'ValidationError',
          code: ValidationErrorCode.INVALID_DEPENDENCIES_SCHEMA,
          severity: ValidationSeverity.WARNING,
          message: `Could not read .adk/dependencies/${dependencyEnv}.json: ${(err as Error).message}. Refresh dependencies from Cloud; agent.config.ts dependencies is not used when a snapshot exists but is invalid.`,
          file: `.adk/dependencies/${dependencyEnv}.json`,
        })
        dependencySnapshotReadFailed = true
      }

      if (snapshotBasedDependencies) {
        this._dependencies = snapshotBasedDependencies

        // Validate and load integrations and interfaces
        if (!this._options.offline) {
          const [intRes, ifRes] = await Promise.all([
            this._integrationManager.loadIntegrations(this._dependencies),
            this._interfaceManager.loadInterfaces(this._dependencies),
          ])
          this._integrations = intRes.integrations
          this._interfaces = ifRes.interfaces

          // Add errors and warnings
          this._errors.push(...intRes.errors, ...ifRes.errors)
          this._warnings.push(...intRes.warnings, ...ifRes.warnings)
        } else {
          // In offline mode, skip API-dependent integration/interface loading
          this._integrations = []
          this._interfaces = []
        }
      } else {
        // No dependency snapshot data available — migration is responsible for importing legacy config deps.
        this._dependencies = { integrations: {} }
        this._integrations = []
        this._interfaces = []
      }
    } catch (error) {
      const err = error as Error
      debug('loadConfig error: %O', err)

      // Build a detailed error message with stack trace for debugging
      let detailedMessage = `Failed to load agent.config.ts: ${err.message}`
      if (err.stack) {
        // Include the stack trace in debug output
        debug('stack trace:\n%s', err.stack)
      }

      // Check for common issues and provide helpful hints
      let hint: string | undefined
      if (err.message.includes('Cannot find module')) {
        const moduleMatch = err.message.match(/Cannot find module '([^']+)'/)
        const moduleName = moduleMatch?.[1] || 'unknown'
        hint = `Module "${moduleName}" is not installed. Run "bun install" to install dependencies.`
        detailedMessage += `\n\n  Stack trace:\n${err.stack?.split('\n').slice(0, 5).join('\n')}`
      }

      this._errors.push({
        $type: 'ValidationError',
        code: ValidationErrorCode.INVALID_CONFIG_SYNTAX,
        severity: ValidationSeverity.ERROR,
        message: detailedMessage,
        file: 'agent.config.ts',
        hint,
      })
    }
  }

  private async loadAgentInfo(): Promise<void> {
    try {
      // Use the agent resolver to load agent.json (not required for basic project loading)
      const agentInfo = await resolveAgent(this._path, { required: false })
      this._agentInfo = agentInfo ?? undefined
    } catch (error) {
      // Handle validation errors from resolver
      if (ValidationErrors.isValidationError(error)) {
        this._errors.push(error)
      } else if (error instanceof Error) {
        // Unexpected error - wrap it
        this._errors.push(ValidationErrors.warning(`Failed to load agent.json: ${error.message}`, 'agent.json'))
      }

      this._agentInfo = undefined
    }
  }

  private async loadBuiltInWorkflows(): Promise<void> {
    for (const wf of Object.values(BuiltInWorkflows)) {
      const definition = Primitives.Definitions.getDefinition(wf)
      if (Primitives.Definitions.isWorkflowDefinition(definition)) {
        this._workflows.push({
          definition,
          export: 'default',
          path: '<adk:builtin>',
        })
      }
    }
  }

  private async loadBuiltInActions(): Promise<void> {
    for (const action of Object.values(BuiltInActions)) {
      const definition = Primitives.Definitions.getDefinition(action)
      if (Primitives.Definitions.isActionDefinition(definition)) {
        this._actions.push({
          definition,
          export: 'default',
          path: '<adk:builtin>',
        })
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- knowledge base has dynamic structure
  private async registerDataSourceWorkflows(knowledgeBase: any, kbPath: string, kbExport: string): Promise<void> {
    try {
      // Each knowledge base has data sources with sync workflows
      if (!knowledgeBase.sources || !Array.isArray(knowledgeBase.sources)) {
        return
      }

      for (const source of knowledgeBase.sources) {
        if (!source.syncWorkflow) {
          continue
        }

        const workflowDefinition = source.syncWorkflow.getDefinition()

        // Check if workflow already exists
        const existing = this._workflows.find((p) => p.definition.name === workflowDefinition.name)

        if (existing) {
          // Skip if already registered
          continue
        }

        // Register the data source's sync workflow
        this._workflows.push({
          definition: workflowDefinition,
          export: `${kbExport}.sources[${knowledgeBase.sources.indexOf(source)}].syncWorkflow`,
          path: kbPath,
        })
      }
    } catch (error) {
      console.warn(`Failed to register data source workflows for ${kbPath}:`, error)
    }
  }

  /**
   * Get list of channels from a channel specification (single, array, or glob)
   * For glob '*', we need to check against all integration channels - but for validation
   * we treat it as a special marker
   */
  /**
   * Checks if a duplicate primitive is just a re-export from a barrel file (index.ts/index.js).
   * If so, prefers the non-barrel file path for the reference and returns true to signal
   * that the duplicate should be silently skipped.
   */
  private isBarrelReexport(
    existing: PrimitiveReference,
    newPath: string,
    newExport: string,
    newDefinition: PrimitiveDefinition
  ): boolean {
    const isNewBarrel = /^index\.[tj]s$/i.test(path.basename(newPath))
    const isExistingBarrel = /^index\.[tj]s$/i.test(path.basename(existing.path))

    if (!isNewBarrel && !isExistingBarrel) {
      return false
    }

    // Prefer the non-barrel file as the canonical source
    if (isExistingBarrel && !isNewBarrel) {
      existing.path = newPath
      existing.export = newExport
      existing.definition = newDefinition
    }

    return true
  }

  private isToolBarrelReexport(existingPath: string, newPath: string): boolean {
    const isNewBarrel = /^index\.[tj]s$/i.test(path.basename(newPath))
    const isExistingBarrel = /^index\.[tj]s$/i.test(path.basename(existingPath))

    if (!isNewBarrel && !isExistingBarrel) {
      return false
    }

    return true
  }

  private shouldPreferToolDefinition(existingPath: string, newPath: string): boolean {
    const isNewBarrel = /^index\.[tj]s$/i.test(path.basename(newPath))
    const isExistingBarrel = /^index\.[tj]s$/i.test(path.basename(existingPath))

    return isExistingBarrel && !isNewBarrel
  }

  private getChannelsList(channelSpec: string | string[]): string[] {
    if (channelSpec === '*') {
      return ['*'] // Glob marker - matches everything
    } else if (Array.isArray(channelSpec)) {
      return channelSpec
    } else {
      return [channelSpec]
    }
  }

  private async loadAgentPrimitives(): Promise<void> {
    // Set the ADK command in the runtime environment
    if (this._options.adkCommand) {
      setAdkCommand(this._options.adkCommand)
    }

    const src = path.join(this._path, 'src')

    if (!(await fs.stat(src).catch(() => false))) {
      this._errors.push({
        $type: 'ValidationError',
        code: ValidationErrorCode.INVALID_STRUCTURE,
        severity: ValidationSeverity.ERROR,
        message: `\`src\` directory not found at expected path: ${src}`,
      })
      return
    }

    const allFiles = await fs.readdir(src, {
      withFileTypes: true,
      recursive: true,
    })

    for (const file of allFiles.filter((x) => x.isFile())) {
      const filename = file.name
      const absolutePath = path.join(file.parentPath, file.name)
      const relPath = path.relative(this.path, absolutePath)

      if (filename.toLowerCase().endsWith('.d.ts')) {
        // Skip TypeScript declaration files
        continue
      }

      if (filename.toLowerCase().endsWith('.test.ts') || filename.toLowerCase().endsWith('.test.js')) {
        // Skip test files
        continue
      }

      if (!filename.toLowerCase().endsWith('.js') && !filename.toLowerCase().endsWith('.ts')) {
        continue // Only process .js or .ts files
      }

      if (file.isSymbolicLink()) {
        this._errors.push({
          $type: 'ValidationError',
          code: ValidationErrorCode.INVALID_FILE_TYPE,
          severity: ValidationSeverity.WARNING,
          message: `Skipping symbolic link in conversations directory: ${relPath}`,
          file: relPath,
        })
        continue
      }

      try {
        const expandedExports = await expandExports({
          absolutePath,
          relPath,
          filename,
          onWarning: (warning) => this._warnings.push(warning),
        })

        // Resolved lazily on first custom-component encounter for this file.
        let componentSources: Map<string, string> | undefined

        for (const key of Object.keys(expandedExports)) {
          let definition
          try {
            definition = Primitives.Definitions.getDefinition(expandedExports[key])
          } catch (error) {
            // This might catch errors from getDefinition itself
            if (Errors.isAdkError(error)) {
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
                severity: ValidationSeverity.WARNING,
                message: error.message,
                file: relPath,
                hint: `Check the primitive definition in ${filename} -> ${key}`,
              })
              continue
            }
            // Re-throw if it's not an ADK error
            throw error
          }

          if (Primitives.Definitions.isConversationDefinition(definition)) {
            // Check for overlapping channel definitions
            const overlapping = this._conversations.find((p) => {
              const existingChannels = this.getChannelsList(p.definition.channel)
              const newChannels = this.getChannelsList(definition.channel)

              // Check if any channel overlaps
              return existingChannels.some((ch) => newChannels.includes(ch))
            })

            if (overlapping) {
              if (this.isBarrelReexport(overlapping, relPath, key, definition)) {
                continue
              }
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Overlapping conversation channels found: ${filename} -> ${key} overlaps with ${overlapping.path} -> ${overlapping.export}`,
                file: relPath,
              })
              continue
            }
            this._conversations.push({
              definition,
              export: key,
              path: relPath,
            })
          } else if (Primitives.Definitions.isKnowledgeDefinition(definition)) {
            const existing = this._knowledge.find((p) => p.definition.name === definition.name)

            if (existing) {
              if (this.isBarrelReexport(existing, relPath, key, definition)) {
                continue
              }
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Duplicate knowledge definition found: ${filename} -> ${key} (already defined in ${existing.path} -> ${existing.export})`,
                file: relPath,
              })
              continue
            }

            this._knowledge.push({
              definition,
              export: key,
              path: relPath,
            })

            // Register data source sync workflows
            await this.registerDataSourceWorkflows(expandedExports[key], relPath, key)
          } else if (Primitives.Definitions.isTriggerDefinition(definition)) {
            const existing = this._triggers.find((p) => p.definition.name === definition.name)
            if (existing) {
              if (this.isBarrelReexport(existing, relPath, key, definition)) {
                continue
              }
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Duplicate trigger definition found: ${filename} -> ${key} (already defined in ${existing.path} -> ${existing.export})`,
                file: relPath,
              })
              continue
            }
            this._triggers.push({
              definition,
              export: key,
              path: relPath,
            })
          } else if (Primitives.Definitions.isWorkflowDefinition(definition)) {
            const existing = this._workflows.find((p) => p.definition.name === definition.name)
            if (existing) {
              if (this.isBarrelReexport(existing, relPath, key, definition)) {
                continue
              }
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Duplicate workflow definition found: ${filename} -> ${key} (already defined in ${existing.path} -> ${existing.export})`,
                file: relPath,
              })
              continue
            }
            this._workflows.push({
              definition,
              export: key,
              path: relPath,
            })
          } else if (Primitives.Definitions.isActionDefinition(definition)) {
            const existing = this._actions.find((p) => p.definition.name === definition.name)
            if (existing) {
              if (this.isBarrelReexport(existing, relPath, key, definition)) {
                continue
              }
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Duplicate action definition found: ${filename} -> ${key} (already defined in ${existing.path} -> ${existing.export})`,
                file: relPath,
              })
              continue
            }
            this._actions.push({
              definition,
              export: key,
              path: relPath,
            })
          } else if (Primitives.Definitions.isCustomComponentDefinition(definition)) {
            const posixRelPath = relPath.split(/[\\/]+/).join('/')
            if (!posixRelPath.startsWith(`${COMPONENTS_DIR}/`)) {
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
                severity: ValidationSeverity.WARNING,
                message: `Custom components must be defined under \`${COMPONENTS_DIR}/\`. Found "${definition.name}" in ${relPath}.`,
                file: relPath,
              })
              continue
            }
            if (componentSources === undefined) {
              try {
                componentSources = resolveComponentSources(absolutePath)
              } catch (error) {
                componentSources = new Map()
                this._warnings.push({
                  $type: 'ValidationError',
                  code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
                  severity: ValidationSeverity.WARNING,
                  message: `Failed to parse component sources from ${relPath}: ${error instanceof Error ? error.message : String(error)}`,
                  file: relPath,
                })
              }
            }
            const source = componentSources.get(key)

            const existing = this._customComponents.find((p) => p.definition.name === definition.name)
            if (existing) {
              if (this.isBarrelReexport(existing, relPath, key, definition)) {
                // If the swap promoted this file to the canonical, refresh source.
                if (existing.path === relPath && source) {
                  existing.source = source
                }
                existing.instance = expandedExports[key]
                continue
              }
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Duplicate custom component definition found: ${filename} -> ${key} (already defined in ${existing.path} -> ${existing.export})`,
                file: relPath,
              })
              continue
            }
            this._customComponents.push({
              definition,
              export: key,
              path: relPath,
              source: source ?? '',
              instance: expandedExports[key],
            })
          } else if (Primitives.Definitions.isTableDefinition(definition)) {
            const existing = this._tables.find((p) => p.definition.name === definition.name)
            if (existing) {
              if (this.isBarrelReexport(existing, relPath, key, definition)) {
                continue
              }
              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Duplicate table definition found: ${filename} -> ${key} (already defined in ${existing.path} -> ${existing.export})`,
                file: relPath,
              })
              continue
            }
            this._tables.push({
              definition,
              export: key,
              path: relPath,
            })
          } else {
            const toolDefinition = getToolDefinition(expandedExports[key])

            if (!toolDefinition) {
              continue
            }

            const existing = this._tools.find((tool) => tool.definition.name === toolDefinition.name)
            if (existing) {
              if (this.isToolBarrelReexport(existing.path, relPath)) {
                if (this.shouldPreferToolDefinition(existing.path, relPath)) {
                  existing.path = relPath
                  existing.export = key
                  existing.definition = toolDefinition
                }

                continue
              }

              this._warnings.push({
                $type: 'ValidationError',
                code: ValidationErrorCode.DUPLICATE_PRIMITIVE,
                severity: ValidationSeverity.WARNING,
                message: `Duplicate tool definition found: ${filename} -> ${key} (already defined in ${existing.path} -> ${existing.export})`,
                file: relPath,
              })
              continue
            }

            this._tools.push({
              definition: toolDefinition,
              export: key,
              path: relPath,
            })
          }
        }
      } catch (error) {
        // Check if it's an ADK error from expandExports
        if (Errors.isAdkError(error)) {
          // Error is already handled by expandExports, skip this file
          continue
        }

        // Log other import errors with context
        this._warnings.push({
          $type: 'ValidationError',
          code: ValidationErrorCode.IMPORT_ERROR,
          severity: ValidationSeverity.WARNING,
          message: `Failed to import primitive from ${relPath}: ${error instanceof Error ? error.message : String(error)}`,
          file: relPath,
          hint: 'Ensure the file exports valid primitives and has no syntax errors',
        })
      }
    }

    // Custom components must trace back to a `.bp.tsx` import. Drop and report
    // any whose source we couldn't resolve from the AST after all files were processed.
    const unresolved = this._customComponents.filter((c) => !c.source)
    if (unresolved.length > 0) {
      this._customComponents = this._customComponents.filter((c) => c.source)
      for (const comp of unresolved) {
        this._errors.push({
          $type: 'ValidationError',
          code: ValidationErrorCode.INVALID_PRIMITIVE_DEFINITION,
          severity: ValidationSeverity.ERROR,
          message: `Cannot resolve .bp.tsx source for custom component "${comp.definition.name}" exported from ${comp.path} as "${comp.export}".`,
          file: comp.path,
          hint:
            'Each CustomComponent must be constructed from a default-imported .bp.tsx component, e.g. ' +
            "`import Foo from './Foo.bp.tsx'; export const FooComponent = new CustomComponent(Foo, ...)`.",
        })
      }
    }
  }
}
