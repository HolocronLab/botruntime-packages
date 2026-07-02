import * as fs from 'fs/promises'
import * as path from 'path'
import { Project, SyntaxKind, type Expression, type ObjectLiteralExpression } from 'ts-morph'
import type { Client } from '@holocronlab/botruntime-client'
import { LegacyDependencyLockFile } from './legacy-lock-file.js'
import { ConfigWriter } from '../agent-project/config-writer.js'
import type { DependencyStateData, Environment, MigrationResult } from './types.js'
import { AgentProject } from '../agent-project/agent-project.js'
import { DependencySnapshotStore, dependencySnapshotFromBot } from './snapshot-store.js'
import { IntegrationRegistry } from './registry/integration-registry.js'
import { PluginRegistry } from './registry/plugin-registry.js'
import { IntegrationResolver } from './resolvers/integration-resolver.js'
import { PluginResolver } from './resolvers/plugin-resolver.js'

export interface MigrateOptions {
  projectPath: string
  client: Client
  integrationResolver?: Pick<IntegrationResolver, 'applyToCloud'>
  pluginResolver?: Pick<PluginResolver, 'applyToCloud'>
}

type LegacySource = 'lock' | 'agentConfig'

export class DependencyMigrationManager {
  private readonly projectPath: string
  private readonly client: Client
  private readonly snapshotStore: DependencySnapshotStore
  private readonly integrationRegistry: IntegrationRegistry
  private readonly pluginRegistry: PluginRegistry
  private readonly integrationResolver: Pick<IntegrationResolver, 'applyToCloud'>
  private readonly pluginResolver: Pick<PluginResolver, 'applyToCloud'>

  constructor(opts: MigrateOptions) {
    this.projectPath = opts.projectPath
    this.client = opts.client
    this.snapshotStore = new DependencySnapshotStore({ projectPath: opts.projectPath })
    this.integrationRegistry = new IntegrationRegistry()
    this.pluginRegistry = new PluginRegistry()
    this.integrationResolver =
      opts.integrationResolver ?? new IntegrationResolver({ registry: this.integrationRegistry, client: this.client })
    this.pluginResolver =
      opts.pluginResolver ??
      new PluginResolver({
        registry: this.pluginRegistry,
        integrationRegistry: this.integrationRegistry,
        client: this.client,
      })
  }

  async run(): Promise<MigrationResult> {
    const result: MigrationResult = {
      migrated: [],
      warnings: [],
      skipped: [],
      legacySources: [],
      snapshotWrites: [],
      cloudWrites: [],
    }

    if (await this.snapshotStore.hasMigrationMarker()) {
      for (const env of ['dev', 'prod'] as const) {
        await this.deleteLegacyLock(env, result)
        result.skipped.push({ env, reason: 'migration already completed' })
      }
      return result
    }

    const project = await AgentProject.load(this.projectPath, { noCache: true })
    const info = project.agentInfo
    const agentConfigDependencies = await readDependenciesFromConfig(this.projectPath)
    const hasAgentConfigDependencies = hasDependencies(agentConfigDependencies)

    if (hasAgentConfigDependencies) {
      result.legacySources?.push('agentConfig')
    }

    if (!info) {
      result.warnings.push({
        code: 'CLOUD_FETCH_PARTIAL',
        message: 'No agent.json found; cannot migrate dependencies to Cloud-backed snapshots.',
      })
      for (const env of ['dev', 'prod'] as const) {
        result.skipped.push({ env, reason: 'no agent.json' })
      }
      return result
    }

    const markerSources = new Set<'lock' | 'agentConfig' | 'cloud'>()

    for (const env of ['dev', 'prod'] as const) {
      const botId = env === 'dev' ? (info.devId ?? info.botId) : info.botId
      if (!botId) {
        result.warnings.push({
          code: 'NO_PROD_BOT',
          message: 'No prod bot configured in agent.json. Prod dependency snapshot was not written.',
        })
        result.skipped.push({ env, reason: 'no prod bot configured' })
        continue
      }

      const legacy = await this.readLegacyState(env, agentConfigDependencies)
      if (legacy?.source === 'lock' && !result.legacySources?.includes('lock')) {
        result.legacySources?.push('lock')
      }

      let bot = await this.fetchBot(botId, env, result)
      if (!bot) continue

      if (!cloudHasDependencies(bot) && legacy) {
        await this.importLegacyToCloud({ botId, legacy: legacy.data })
        result.cloudWrites?.push(env)
        markerSources.add(legacy.source)
        bot = await this.fetchBot(botId, env, result)
        if (!bot) continue
      } else {
        markerSources.add('cloud')
      }

      await this.snapshotStore.write(
        dependencySnapshotFromBot({
          bot,
          botId,
          env,
          fetchedAt: new Date(),
          previous: await this.snapshotStore.read(env, { tolerant: true }),
        })
      )
      result.snapshotWrites?.push(env)
      result.migrated.push(env)
      await this.deleteLegacyLock(env, result)
    }

    if (hasAgentConfigDependencies && result.migrated.length > 0) {
      const writer = new ConfigWriter(this.projectPath)
      await writer.removeDependenciesField()
    }

    if (result.migrated.length > 0) {
      await this.snapshotStore.writeMigrationMarker({
        version: 1,
        migratedAt: new Date().toISOString(),
        sources: [...markerSources],
      })
      result.warnings.push({
        code: 'MIGRATED_DEPENDENCIES',
        message: `Migrated dependencies to .adk snapshots for ${result.migrated.join(', ')}. Cloud is now the source of truth.`,
      })
    }

    return result
  }

  private async deleteLegacyLock(env: Environment, result: MigrationResult): Promise<void> {
    try {
      await new LegacyDependencyLockFile({ projectPath: this.projectPath, env }).delete()
    } catch (err) {
      result.warnings.push({
        code: 'LEGACY_LOCK_DELETE_FAILED',
        message: `Migrated ${env} dependencies, but could not delete dependencies.${env}.lock.json: ${
          (err as Error).message
        }`,
      })
    }
  }

  private async readLegacyState(
    env: Environment,
    agentConfigDependencies: DependencyStateData
  ): Promise<{ source: LegacySource; data: DependencyStateData } | null> {
    const legacyLock = new LegacyDependencyLockFile({ projectPath: this.projectPath, env })
    if (await legacyLock.exists()) {
      return { source: 'lock', data: await legacyLock.read() }
    }

    if (hasDependencies(agentConfigDependencies)) {
      return { source: 'agentConfig', data: { ...agentConfigDependencies, env } }
    }

    return null
  }

  private async fetchBot(
    botId: string,
    env: Environment,
    result: MigrationResult
  ): Promise<Awaited<ReturnType<Client['getBot']>>['bot'] | null> {
    try {
      const { bot } = await this.client.getBot({ id: botId })
      return bot
    } catch (err) {
      result.warnings.push({
        code: 'CLOUD_FETCH_PARTIAL',
        message: `Could not fetch cloud state for ${env}: ${(err as Error).message}`,
      })
      result.skipped.push({ env, reason: 'cloud fetch failed' })
      return null
    }
  }

  private async importLegacyToCloud(opts: { botId: string; legacy: DependencyStateData }): Promise<void> {
    for (const [alias, entry] of Object.entries(opts.legacy.integrations)) {
      await this.integrationResolver.applyToCloud({ botId: opts.botId, alias, entry })
    }
    for (const [alias, entry] of Object.entries(opts.legacy.plugins)) {
      await this.pluginResolver.applyToCloud({ botId: opts.botId, alias, entry, state: opts.legacy })
    }
  }
}

export async function migrateFromConfig(opts: MigrateOptions): Promise<MigrationResult> {
  return new DependencyMigrationManager(opts).run()
}

async function readDependenciesFromConfig(projectPath: string): Promise<DependencyStateData> {
  const configPath = path.join(projectPath, 'agent.config.ts')
  const empty: DependencyStateData = { version: 1, env: 'dev', integrations: {}, plugins: {} }
  try {
    await fs.access(configPath)
  } catch {
    return empty
  }

  try {
    const project = new Project({ useInMemoryFileSystem: false })
    const sourceFile = project.addSourceFileAtPath(configPath)
    const callExpr = sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .find((c) => c.getExpression().getText() === 'defineConfig')
    const obj = callExpr?.getArguments()[0]?.asKind(SyntaxKind.ObjectLiteralExpression)
    if (!obj) return empty

    const depsProp = obj.getProperty('dependencies')
    if (!depsProp?.isKind(SyntaxKind.PropertyAssignment)) return empty
    const depsObj = depsProp.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression)
    if (!depsObj) return empty

    readDependencyField(depsObj, 'integrations', empty)
    readDependencyField(depsObj, 'plugins', empty)
  } catch {
    return empty
  }

  return empty
}

function readDependencyField(
  depsObj: ObjectLiteralExpression,
  field: 'integrations' | 'plugins',
  data: DependencyStateData
): void {
  const innerProp = depsObj.getProperty(field)
  if (!innerProp?.isKind(SyntaxKind.PropertyAssignment)) return
  const inner = innerProp.getInitializer()?.asKind(SyntaxKind.ObjectLiteralExpression)
  if (!inner) return

  for (const aliasProp of inner.getProperties()) {
    if (!aliasProp.isKind(SyntaxKind.PropertyAssignment)) continue
    const alias = aliasProp.getName().replace(/['"]/g, '')
    const version = readVersionLiteral(aliasProp.getInitializer())
    if (!version) continue

    const at = version.indexOf('@')
    if (at < 0) continue
    const name = version.slice(0, at)
    const semver = version.slice(at + 1)

    if (field === 'integrations') {
      data.integrations[alias] = { name, version: semver, enabled: true, config: {} }
    } else {
      data.plugins[alias] = { name, version: semver, enabled: true, config: {}, dependencies: {} }
    }
  }
}

function readVersionLiteral(node: Expression | undefined): string | null {
  if (node?.isKind(SyntaxKind.StringLiteral)) {
    return node.getLiteralText()
  }
  if (node?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    const versionProp = node.getProperty('version')
    if (versionProp?.isKind(SyntaxKind.PropertyAssignment)) {
      const value = versionProp.getInitializer()
      if (value?.isKind(SyntaxKind.StringLiteral)) return value.getLiteralText()
    }
  }
  return null
}

function hasDependencies(data: DependencyStateData): boolean {
  return Object.keys(data.integrations).length > 0 || Object.keys(data.plugins).length > 0
}

function cloudHasDependencies(bot: Awaited<ReturnType<Client['getBot']>>['bot']): boolean {
  return Object.keys(bot.integrations ?? {}).length > 0 || Object.keys(bot.plugins ?? {}).length > 0
}
