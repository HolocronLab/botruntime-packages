import type { Client, Bot } from '@holocronlab/botruntime-client'
import { AgentProject } from '../agent-project/agent-project.js'
import { getProjectClient, type Credentials, type ServerConnectionCredentials } from '../auth/index.js'
import { SecretsManager, type Environment } from '../secrets/manager.js'
import { generateBotProject } from '../bot-generator/generator.js'
import path from 'path'
import { TableManager } from '../tables/table-manager.js'
import { KnowledgeManager } from '../knowledge/manager.js'
import { AssetsManager } from '../assets/manager.js'
import type { PreflightCheckResult, AgentConfigDiff, SecretWarning, ApplyOptions, DeployPlan } from './types.js'
import { AgentConfigSyncManager } from './agent-config-sync.js'
import { DependencySnapshotStore } from '../dependencies/snapshot-store.js'
import { resolveDependencyStatuses } from '../dependencies/status-resolver.js'
import { findIntegrationVersionMismatches, isDeployBlocking } from './dependency-gate.js'
import {
  assertDevBotMatchesTarget,
  type ResolvedDevTargetIdentity,
  type ServerConfigTarget,
} from '../integrations/config-utils.js'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { readAgentInfo, readAgentLocalInfo } from '../agent-project/agent-resolver.js'

export interface PendingPreflightResult {
  result: PreflightCheckResult
  apply: (options?: ApplyOptions) => Promise<void>
}

export interface PreflightCheckerOptions {
  credentials?: Credentials
}

export class PreflightChecker {
  private projectPath: string
  private client?: Client
  private project?: AgentProject
  private credentials?: Credentials
  private clientTarget?: string
  private projectTarget?: string

  constructor(projectPath: string, options: PreflightCheckerOptions = {}) {
    this.projectPath = projectPath
    this.credentials = options.credentials
  }

  private targetKey(target: ServerConfigTarget): string {
    return JSON.stringify({
      environment: target.environment,
      botId: target.botId,
      runtimeBotId: target.environment === 'dev' ? target.runtimeBotId : undefined,
      apiUrl: target.credentials?.apiUrl,
      workspaceId: target.credentials?.workspaceId,
    })
  }

  private async getProject(target: ServerConfigTarget): Promise<AgentProject> {
    const key = this.targetKey(target)
    if (!this.project || (this.projectTarget !== undefined && this.projectTarget !== key)) {
      this.project = await AgentProject.load(this.projectPath, {
        adkCommand: target.environment === 'prod' ? 'adk-deploy' : 'adk-dev',
        configTarget: target,
      })
      this.projectTarget = key
    }
    return this.project
  }

  private async getClient(target: ServerConfigTarget): Promise<Client> {
    const key = this.targetKey(target)
    if (!this.client || (this.clientTarget !== undefined && this.clientTarget !== key)) {
      const credentials = target.credentials
      if (!credentials) {
        throw new AdkError({
          code: 'INVALID_SERVER_CONFIG_TARGET',
          message: 'Preflight requires explicit token, apiUrl, and workspaceId.',
          expected: true,
        })
      }
      this.client = await getProjectClient({
        credentials,
        apiUrl: credentials.apiUrl,
        workspaceId: credentials.workspaceId,
      })
      this.clientTarget = key
    }
    return this.client
  }

  private getServerConnectionCredentials(): ServerConnectionCredentials | undefined {
    if (!this.credentials?.workspaceId) return undefined
    return {
      token: this.credentials.token,
      apiUrl: this.credentials.apiUrl,
      workspaceId: this.credentials.workspaceId,
    }
  }

  private async getGenerationTarget(botId: string, env: Environment): Promise<ServerConfigTarget> {
    const credentials = this.getServerConnectionCredentials()
    if (!credentials) {
      throw new AdkError({
        code: 'INVALID_SERVER_CONFIG_TARGET',
        message: `${env === 'prod' ? 'Prod' : 'Dev'} preflight regeneration requires explicit token, apiUrl, and workspaceId.`,
        expected: true,
      })
    }
    if (env === 'prod') {
      const info = await readAgentInfo(this.projectPath)
      if (!info?.botId) {
        throw new AdkError({
          code: 'INVALID_SERVER_CONFIG_TARGET',
          message: 'Prod preflight requires a botId in agent.json.',
          expected: true,
        })
      }
      if (info.botId !== botId) {
        throw new AdkError({
          code: 'INVALID_SERVER_CONFIG_TARGET',
          message: `Prod preflight target ${botId} does not match agent.json botId=${info.botId}.`,
          expected: true,
        })
      }
      if (info.workspaceId !== credentials.workspaceId) {
        throw new AdkError({
          code: 'INVALID_SERVER_CONFIG_TARGET',
          message: `agent.json workspaceId=${info.workspaceId} does not match credentials workspaceId=${credentials.workspaceId}.`,
          expected: true,
        })
      }
      if (info.apiUrl?.replace(/\/+$/, '') !== credentials.apiUrl.replace(/\/+$/, '')) {
        throw new AdkError({
          code: 'INVALID_SERVER_CONFIG_TARGET',
          message: `agent.json apiUrl=${info.apiUrl} does not match credentials apiUrl=${credentials.apiUrl}.`,
          expected: true,
        })
      }
      return { environment: 'prod', botId: info.botId, credentials }
    }

    const target = await this.getDevTargetIdentity(botId, credentials)
    return { environment: 'dev', ...target, credentials }
  }

  private async getDevTargetIdentity(
    runtimeBotId: string,
    credentials: ServerConnectionCredentials
  ): Promise<ResolvedDevTargetIdentity> {
    const localInfo = await readAgentLocalInfo(this.projectPath)
    const botId = localInfo?.devTargetBotId
    if (!botId || !localInfo?.devId || !localInfo.devApiUrl || !localInfo.devWorkspaceId) {
      throw new AdkError({
        code: 'INVALID_SERVER_CONFIG_TARGET',
        message: 'Dev preflight requires a complete scoped dev target in agent.local.json.',
        expected: true,
      })
    }
    if (localInfo.devId !== runtimeBotId) {
      throw new AdkError({
        code: 'INVALID_SERVER_CONFIG_TARGET',
        message: `Dev preflight target ${runtimeBotId} does not match agent.local.json devId=${localInfo.devId}.`,
        expected: true,
      })
    }
    if (
      localInfo.devApiUrl.replace(/\/+$/, '') !== credentials.apiUrl.replace(/\/+$/, '') ||
      localInfo.devWorkspaceId !== credentials.workspaceId
    ) {
      throw new AdkError({
        code: 'INVALID_SERVER_CONFIG_TARGET',
        message: 'The cached dev target scope does not match the selected preflight credentials.',
        expected: true,
      })
    }
    return { botId, runtimeBotId }
  }

  private async performCheck(
    botId: string,
    env: Environment,
    resolvedTarget?: ServerConfigTarget
  ): Promise<{
    result: PreflightCheckResult
  }> {
    const target = resolvedTarget ?? (await this.getGenerationTarget(botId, env))
    const client = await this.getClient(target)
    const project = await this.getProject(target)

    const addressBotId = target.environment === 'dev' ? target.runtimeBotId! : target.botId
    const { bot } = await client.getBot({ id: addressBotId })
    if (target.environment === 'dev') {
      assertDevBotMatchesTarget(bot, { botId: target.botId!, runtimeBotId: target.runtimeBotId! })
    }

    const agentConfigDiffs = this.buildAgentConfigDiffs(project, bot)
    const secretWarnings = await this.buildSecretWarnings(project, env)
    const hasChanges = agentConfigDiffs.length > 0

    return {
      result: {
        agentConfig: agentConfigDiffs,
        secretWarnings,
        env,
        hasChanges,
      },
    }
  }

  private buildAgentConfigDiffs(project: AgentProject, bot: Bot): AgentConfigDiff[] {
    if (project.config?.name !== undefined && project.config.name !== bot.name) {
      return [
        {
          field: 'name',
          oldValue: bot.name,
          newValue: project.config.name,
        },
      ]
    }
    return []
  }

  private async buildSecretWarnings(project: AgentProject, env: Environment): Promise<SecretWarning[]> {
    const declaredSecrets = project.config?.secrets as
      | Record<string, { optional?: boolean; description?: string }>
      | undefined
    if (!declaredSecrets || Object.keys(declaredSecrets).length === 0) {
      return []
    }

    const secretsManager = new SecretsManager(this.projectPath)
    const storedSecrets = await secretsManager.getAll(env, declaredSecrets)
    const storedKeys = new Set(Object.keys(storedSecrets))
    const warnings: SecretWarning[] = []

    for (const [name, def] of Object.entries(declaredSecrets)) {
      if (!storedKeys.has(name)) {
        warnings.push({
          name,
          optional: def.optional ?? false,
          description: def.description,
        })
      }
    }

    return warnings
  }

  async checkWithPendingApply(botId: string, env: Environment = 'dev'): Promise<PendingPreflightResult> {
    const { result } = await this.performCheck(botId, env)
    return {
      result,
      apply: (callbacks) => this.apply(botId, result, env, callbacks),
    }
  }

  async checkAndApply(
    botId: string,
    options: {
      env?: Environment
      shouldApply?: (result: PreflightCheckResult) => Promise<boolean>
      callbacks?: ApplyOptions
    } = {}
  ): Promise<{ result: PreflightCheckResult; applied: boolean }> {
    const { result } = await this.performCheck(botId, options.env ?? 'dev')

    if (!result.hasChanges) {
      return { result, applied: false }
    }

    if (options.shouldApply) {
      const approved = await options.shouldApply(result)
      if (!approved) {
        return { result, applied: false }
      }
    }

    await this.apply(botId, result, options.env ?? 'dev', options.callbacks)
    return { result, applied: true }
  }

  async computeDeployPlan(botId: string, env: Environment = 'prod'): Promise<DeployPlan> {
    const target = await this.getGenerationTarget(botId, env)
    const project = await this.getProject(target)
    const { result } = await this.performCheck(botId, env, target)
    const preflight: PendingPreflightResult = {
      result,
      apply: (callbacks) => this.apply(botId, result, env, callbacks),
    }
    if (!target.botId || !target.credentials) {
      throw new AdkError({
        code: 'INVALID_SERVER_CONFIG_TARGET',
        message: 'Preflight control managers require a resolved botId and explicit credentials.',
        expected: true,
      })
    }
    const controlBotId = target.botId
    const targetCredentials = target.credentials
    const targetProject = Object.create(project) as AgentProject
    Object.defineProperty(targetProject, 'agentInfo', {
      value: {
        botId: controlBotId,
        workspaceId: targetCredentials.workspaceId,
        apiUrl: targetCredentials.apiUrl,
        ...(target.environment === 'dev'
          ? {
              devId: target.runtimeBotId,
              devTargetBotId: controlBotId,
              devApiUrl: targetCredentials.apiUrl.replace(/\/+$/, ''),
              devWorkspaceId: targetCredentials.workspaceId,
            }
          : {}),
      },
      enumerable: true,
    })

    const tableManager =
      project.tables.length > 0
        ? new TableManager({ project: targetProject, botId: controlBotId, credentials: targetCredentials })
        : null
    const kbManager =
      project.knowledge.length > 0
        ? new KnowledgeManager({ project: targetProject, botId: controlBotId, credentials: targetCredentials })
        : null
    const assetsManager = (await project.hasAssetsDirectory())
      ? new AssetsManager({
          projectPath: this.projectPath,
          botId: controlBotId,
          credentials: targetCredentials,
          cacheScope: {
            environment: target.environment,
            botId: controlBotId,
            apiUrl: targetCredentials.apiUrl,
            workspaceId: targetCredentials.workspaceId,
          },
          failOnRemoteFetchError: target.environment === 'prod',
        })
      : null

    const [tablePlan, kbResult, assetPlan] = await Promise.all([
      tableManager ? tableManager.createSyncPlan() : Promise.resolve(null),
      kbManager
        ? Promise.all([kbManager.createSyncPlan(), kbManager.getOrphanedKBs()]).then(([kbPlan, orphanedKBs]) => ({
            kbPlan,
            orphanedKBs,
          }))
        : Promise.resolve({ kbPlan: null as DeployPlan['kbPlan'], orphanedKBs: [] as DeployPlan['orphanedKBs'] }),
      assetsManager ? assetsManager.createSyncPlan() : Promise.resolve(null),
    ])

    const { kbPlan, orphanedKBs } = kbResult

    // Dependency capability gate (WS5). The gate must judge the dependency set that
    // actually ships: deploy codegen builds from the prod dependency snapshot,
    // while dev/build codegen reads dev. Snapshot-only (offline-safe, no auth):
    // Cloud's persisted WS0 verdict + the enabled flag drive it.
    const snapshotStore = new DependencySnapshotStore({ projectPath: this.projectPath })
    const snapshot = await snapshotStore.readOrEmpty({
      env,
      apiUrl: targetCredentials.apiUrl,
      workspaceId: targetCredentials.workspaceId,
      botId: controlBotId,
    })
    const dependencyStatuses = await resolveDependencyStatuses({ snapshot })
    const blockingDependencies = dependencyStatuses.filter(isDeployBlocking)
    // Prod preflight must not read agent.local.json. A dev-vs-prod comparison
    // needs an explicit dev authority/client boundary; without one, treating a
    // local link as comparable would let foreign dev state influence prod.
    const integrationVersionMismatches: DeployPlan['dependencyPlan']['integrationVersionMismatches'] = []

    const hasDestructiveStorageChanges =
      (tablePlan?.totalDelete ?? 0) > 0 ||
      orphanedKBs.length > 0 ||
      (kbPlan?.orphanedSourcesToDelete ?? 0) > 0 ||
      (assetPlan?.totalDelete ?? 0) > 0

    return {
      preflight,
      tablePlan,
      kbPlan,
      orphanedKBs,
      assetPlan,
      hasDestructiveStorageChanges,
      managers: { table: tableManager, kb: kbManager, assets: assetsManager },
      dependencyPlan: { blocking: blockingDependencies, integrationVersionMismatches },
    }
  }

  private async apply(
    botId: string,
    result: PreflightCheckResult,
    env: Environment,
    options?: ApplyOptions
  ): Promise<void> {
    const target = await this.getGenerationTarget(botId, env)
    const client = await this.getClient(target)

    if (result.agentConfig.length > 0) {
      const configSyncer = new AgentConfigSyncManager(client)
      await configSyncer.syncFromChanges(botId, result.agentConfig, options)
    }

    if (!options?.skipBotRegeneration) {
      options?.onProgress?.('Regenerating bot project...')
      await generateBotProject({
        projectPath: this.projectPath,
        outputPath: path.join(this.projectPath, '.adk', 'bot'),
        adkCommand: env === 'prod' ? 'adk-deploy' : 'adk-dev',
        configTarget: target,
        callbacks: options,
      })
      options?.onSuccess?.('Bot project regenerated')
    }
  }
}
