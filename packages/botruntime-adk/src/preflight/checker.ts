import type { Client, Bot } from '@holocronlab/botruntime-client'
import { AgentProject } from '../agent-project/agent-project.js'
import { getProjectClient, type Credentials } from '../auth/index.js'
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

  constructor(projectPath: string, options: PreflightCheckerOptions = {}) {
    this.projectPath = projectPath
    this.credentials = options.credentials
  }

  private async getProject(): Promise<AgentProject> {
    if (!this.project) {
      this.project = await AgentProject.load(this.projectPath)
    }
    return this.project
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      const project = await this.getProject()

      this.client = await getProjectClient({
        project,
        credentials: this.credentials,
      })
    }
    return this.client
  }

  private async performCheck(
    botId: string,
    env: Environment
  ): Promise<{
    result: PreflightCheckResult
  }> {
    const client = await this.getClient()
    const project = await this.getProject()

    const { bot } = await client.getBot({ id: botId })

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
    const project = await this.getProject()

    const tableManager =
      project.tables.length > 0 ? new TableManager({ project, botId, credentials: this.credentials }) : null
    const kbManager =
      project.knowledge.length > 0 ? new KnowledgeManager({ project, botId, credentials: this.credentials }) : null
    const assetsManager = (await project.hasAssetsDirectory())
      ? new AssetsManager({ projectPath: this.projectPath, botId, credentials: this.credentials })
      : null

    const [preflight, tablePlan, kbResult, assetPlan] = await Promise.all([
      this.checkWithPendingApply(botId, env),
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
    const snapshot = await snapshotStore.readOrEmpty(env, {
      tolerant: true,
    })
    const dependencyStatuses = await resolveDependencyStatuses({ snapshot })
    const blockingDependencies = dependencyStatuses.filter(isDeployBlocking)
    const integrationVersionMismatches =
      env === 'prod'
        ? findIntegrationVersionMismatches(await snapshotStore.readOrEmpty('dev', { tolerant: true }), snapshot)
        : []

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
    const client = await this.getClient()

    if (result.agentConfig.length > 0) {
      const configSyncer = new AgentConfigSyncManager(client)
      await configSyncer.syncFromChanges(botId, result.agentConfig, options)
    }

    if (!options?.skipBotRegeneration) {
      options?.onProgress?.('Regenerating bot project...')
      await generateBotProject({
        projectPath: this.projectPath,
        outputPath: path.join(this.projectPath, '.adk', 'bot'),
        // Regenerate against the env we planned for: a prod deploy must resolve cloud config
        // and the register-time capability verdict against the PROD bot (matching the
        // `adk-deploy` build step), not the dev bot. Dev keeps the prior behavior (no
        // adkCommand) to avoid changing its asset/codegen target.
        ...(env === 'prod' ? { adkCommand: 'adk-deploy' as const } : {}),
        callbacks: options,
      })
      options?.onSuccess?.('Bot project regenerated')
    }
  }
}
