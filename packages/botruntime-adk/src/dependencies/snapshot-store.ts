import * as fs from 'fs/promises'
import * as path from 'path'
import type { Client } from '@holocronlab/botruntime-client'
import { generateFriendlyAlias, isFriendlyAlias } from './alias-utils.js'
import { DependencyError } from './errors.js'
import { jsonEqual, sortKeysDeep } from './json-utils.js'
import { integrationRequiresAuthorization } from './status.js'
import {
  dependencyMigrationMarkerSchema,
  dependencySnapshotSchema,
  type DependencyMigrationMarker,
  type DependencySnapshotData,
  type Environment,
  type IntegrationSnapshotEntry,
  type PluginSnapshotEntry,
} from './types.js'

export interface DependencySnapshotStoreOptions {
  projectPath: string
}

export interface DependencySnapshotWarning {
  code: 'SNAPSHOT_CORRUPT'
  message: string
  env: Environment
  path: string
}

export interface IntegrationAuthorizationSpecSource {
  getSpec(name: string, version?: string): Promise<unknown>
}

export class DependencySnapshotStore {
  private readonly projectPath: string
  private readonly dirPath: string

  constructor(opts: DependencySnapshotStoreOptions) {
    this.projectPath = opts.projectPath
    this.dirPath = path.join(opts.projectPath, '.adk', 'dependencies')
  }

  getSnapshotPath(env: Environment): string {
    return path.join(this.dirPath, `${env}.json`)
  }

  getMigrationMarkerPath(): string {
    return path.join(this.dirPath, 'migration.json')
  }

  async exists(env: Environment): Promise<boolean> {
    try {
      await fs.access(this.getSnapshotPath(env))
      return true
    } catch {
      return false
    }
  }

  async read(env: Environment, options?: { tolerant?: boolean }): Promise<DependencySnapshotData | null> {
    const filePath = this.getSnapshotPath(env)
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }

    try {
      return dependencySnapshotSchema.parse(JSON.parse(raw))
    } catch (err) {
      if (options?.tolerant) return null
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `Dependency snapshot at ${filePath} failed schema validation`,
        details: { issues: (err as { issues?: unknown }).issues ?? String(err) },
      })
    }
  }

  async readOrEmpty(
    env: Environment,
    options?: { tolerant?: boolean; botId?: string; fetchedAt?: Date }
  ): Promise<DependencySnapshotData> {
    const snapshot = await this.read(env, options)
    return snapshot ?? emptyDependencySnapshot(env, options?.botId, options?.fetchedAt)
  }

  async write(snapshot: DependencySnapshotData): Promise<void> {
    const validated = dependencySnapshotSchema.parse(snapshot)
    await fs.mkdir(this.dirPath, { recursive: true })
    const filePath = this.getSnapshotPath(validated.env)
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
    await fs.writeFile(tmp, JSON.stringify(sortKeysDeep(validated), null, 2) + '\n', 'utf8')
    await fs.rename(tmp, filePath)
  }

  async delete(env: Environment): Promise<void> {
    try {
      await fs.unlink(this.getSnapshotPath(env))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  /**
   * The migration marker is an existence-only tombstone: present ⟹ the one-way
   * legacy→Cloud migration already ran. Its JSON contents (version, migratedAt,
   * sources) are informational — never parsed for gating, so a corrupt marker
   * still counts as migrated. The CLI patcher applies the same existence
   * semantics to the same file.
   */
  async hasMigrationMarker(): Promise<boolean> {
    try {
      await fs.access(this.getMigrationMarkerPath())
      return true
    } catch {
      return false
    }
  }

  async writeMigrationMarker(marker: DependencyMigrationMarker): Promise<void> {
    const validated = dependencyMigrationMarkerSchema.parse(marker)
    await fs.mkdir(this.dirPath, { recursive: true })
    const filePath = this.getMigrationMarkerPath()
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`
    await fs.writeFile(tmp, JSON.stringify(sortKeysDeep(validated), null, 2) + '\n', 'utf8')
    await fs.rename(tmp, filePath)
  }

  async refreshFromCloud(opts: {
    client: Client
    botId: string
    env: Environment
    fetchedAt?: Date
    integrationRegistry?: IntegrationAuthorizationSpecSource
    onWarning?: (warning: DependencySnapshotWarning) => void
  }): Promise<DependencySnapshotData> {
    const previous = await this.readForRefresh(opts.env, opts.onWarning)
    const { bot } = await opts.client.getBot({ id: opts.botId })
    const snapshot = dependencySnapshotFromBot({
      bot,
      botId: opts.botId,
      env: opts.env,
      fetchedAt: opts.fetchedAt ?? new Date(),
      previous,
    })
    await annotateAuthorizationPending({
      snapshot,
      bot,
      integrationRegistry: opts.integrationRegistry,
    })
    if (previous && cloudSnapshotUnchanged(previous, snapshot)) {
      return previous
    }
    await this.write(snapshot)
    return snapshot
  }

  private async readForRefresh(
    env: Environment,
    onWarning?: (warning: DependencySnapshotWarning) => void
  ): Promise<DependencySnapshotData | null> {
    try {
      return await this.read(env)
    } catch (err) {
      if (!(err instanceof DependencyError) || err.code !== 'INVALID_CONFIG') throw err
      const filePath = this.getSnapshotPath(env)
      await this.delete(env)
      onWarning?.({
        code: 'SNAPSHOT_CORRUPT',
        message: `Removed corrupt dependency snapshot at ${filePath}; refreshing from Cloud.`,
        env,
        path: filePath,
      })
      return null
    }
  }
}

export function emptyDependencySnapshot(
  env: Environment,
  botId = 'local',
  fetchedAt: Date = new Date(0)
): DependencySnapshotData {
  return {
    version: 1,
    env,
    botId,
    fetchedAt: fetchedAt.toISOString(),
    integrations: {},
    plugins: {},
  }
}

function cloudSnapshotUnchanged(previous: DependencySnapshotData, next: DependencySnapshotData): boolean {
  if (previous.botId !== next.botId || previous.env !== next.env) return false
  if (previous.botUpdatedAt !== next.botUpdatedAt) return false
  return jsonEqual(
    { integrations: previous.integrations, plugins: previous.plugins },
    { integrations: next.integrations, plugins: next.plugins }
  )
}

async function annotateAuthorizationPending(opts: {
  snapshot: DependencySnapshotData
  bot: Awaited<ReturnType<Client['getBot']>>['bot']
  integrationRegistry?: IntegrationAuthorizationSpecSource
}): Promise<void> {
  const registry = opts.integrationRegistry
  if (!registry) return

  const cloudIntegrations = (opts.bot.integrations ?? {}) as Record<string, unknown>
  const specCache = new Map<string, Promise<unknown | null>>()

  const getSpec = (name: string, version: string): Promise<unknown | null> => {
    const key = `${name}@${version}`
    const cached = specCache.get(key)
    if (cached) return cached
    const promise = registry.getSpec(name, version).catch(() => null)
    specCache.set(key, promise)
    return promise
  }

  await Promise.all(
    Object.entries(opts.snapshot.integrations).map(async ([alias, entry]) => {
      const cloudAlias = entry.cloudAlias ?? alias
      const cloud = cloudIntegrations[cloudAlias] as { identifier?: unknown } | undefined
      if (!cloud) return
      if (cloud.identifier) {
        delete entry.authorizationPending
        return
      }

      const spec = await getSpec(entry.name, entry.version)
      if (!spec) return

      const requiresAuthorization = integrationRequiresAuthorization(
        spec as Parameters<typeof integrationRequiresAuthorization>[0],
        entry.configurationType
      )
      if (requiresAuthorization) {
        entry.authorizationPending = true
      } else {
        delete entry.authorizationPending
      }
    })
  )
}

export function dependencySnapshotFromBot(opts: {
  bot: Awaited<ReturnType<Client['getBot']>>['bot']
  botId: string
  env: Environment
  fetchedAt: Date
  previous?: DependencySnapshotData | null
}): DependencySnapshotData {
  const integrations: Record<string, IntegrationSnapshotEntry> = {}
  const usedIntegrationAliases = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cloud bot integrations shape is wider than the client type in older versions
  for (const [cloudAlias, cloud] of Object.entries((opts.bot.integrations ?? {}) as Record<string, any>)) {
    const cloudName = typeof cloud.name === 'string' ? cloud.name : undefined
    const config = cloud.configuration ?? {}
    const version = cloud.version ?? '0.0.0'
    const configurationType =
      typeof cloud.configurationType === 'string' && cloud.configurationType && cloud.configurationType !== 'default'
        ? cloud.configurationType
        : undefined
    const alias = chooseCloudAlias({
      cloudAlias,
      cloudName,
      previous: opts.previous?.integrations ?? {},
      used: usedIntegrationAliases,
      matches: (entry) =>
        entry.version === version && entry.configurationType === configurationType && jsonEqual(entry.config, config),
    })
    usedIntegrationAliases.add(alias)

    const previousEntry = opts.previous?.integrations[alias]
    const previousMissingFields =
      previousEntry?.missingFields?.length &&
      !cloud.enabled &&
      previousEntry.version === version &&
      previousEntry.configurationType === configurationType &&
      jsonEqual(previousEntry.config, config)
        ? previousEntry.missingFields
        : undefined

    integrations[alias] = {
      name: cloud.name ?? '',
      version,
      enabled: Boolean(cloud.enabled),
      config,
      ...(configurationType ? { configurationType } : {}),
      ...(previousMissingFields ? { missingFields: previousMissingFields } : {}),
      ...(!cloud.identifier && previousEntry?.authorizationPending ? { authorizationPending: true } : {}),
      ...(typeof cloud.id === 'string' ? { cloudId: cloud.id } : {}),
      cloudAlias,
      ...(typeof cloud.updatedAt === 'string' ? { updatedAt: cloud.updatedAt } : {}),
    }
  }

  const plugins: Record<string, PluginSnapshotEntry> = {}
  const usedPluginAliases = new Set<string>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cloud bot plugins shape is wider than the client type in older versions
  for (const [cloudAlias, cloud] of Object.entries((opts.bot.plugins ?? {}) as Record<string, any>)) {
    const cloudName = typeof cloud.name === 'string' ? cloud.name : undefined
    const config = cloud.configuration ?? {}
    const version = cloud.version ?? '0.0.0'
    const dependencies: Record<string, { integrationAlias: string }> = {}
    for (const [ifaceAlias, dep] of Object.entries((cloud.interfaces ?? {}) as Record<string, any>)) {
      if (typeof dep.integrationAlias === 'string') {
        dependencies[ifaceAlias] = { integrationAlias: dep.integrationAlias }
      }
    }

    const alias = chooseCloudAlias({
      cloudAlias,
      cloudName,
      previous: opts.previous?.plugins ?? {},
      used: usedPluginAliases,
      matches: (entry) => entry.version === version && jsonEqual(entry.config, config),
    })
    usedPluginAliases.add(alias)

    const previousEntry = opts.previous?.plugins[alias]
    const previousMissingFields =
      previousEntry?.missingFields?.length &&
      !(cloud.enabled ?? true) &&
      previousEntry.version === version &&
      jsonEqual(previousEntry.config, config)
        ? previousEntry.missingFields
        : undefined

    plugins[alias] = {
      name: cloud.name ?? '',
      version,
      enabled: cloud.enabled ?? true,
      config,
      dependencies,
      ...(previousMissingFields ? { missingFields: previousMissingFields } : {}),
      ...(typeof cloud.id === 'string' ? { cloudId: cloud.id } : {}),
      cloudAlias,
      ...(typeof cloud.updatedAt === 'string' ? { updatedAt: cloud.updatedAt } : {}),
    }
  }

  return {
    version: 1,
    env: opts.env,
    botId: opts.botId,
    fetchedAt: opts.fetchedAt.toISOString(),
    ...(typeof opts.bot.updatedAt === 'string' ? { botUpdatedAt: opts.bot.updatedAt } : {}),
    integrations,
    plugins,
  }
}

function chooseCloudAlias<T extends { name: string }>(opts: {
  cloudAlias: string
  cloudName: string | undefined
  previous: Record<string, T>
  used: Set<string>
  matches?: (entry: T) => boolean
}): string {
  if (isFriendlyAlias(opts.cloudAlias) && opts.previous[opts.cloudAlias] && !opts.used.has(opts.cloudAlias)) {
    return opts.cloudAlias
  }

  if (opts.cloudName) {
    if (opts.matches) {
      const exactMatch = Object.entries(opts.previous).find(
        ([alias, entry]) => !opts.used.has(alias) && entry.name === opts.cloudName && opts.matches!(entry)
      )
      if (exactMatch) return exactMatch[0]
    }

    const match = Object.entries(opts.previous).find(
      ([alias, entry]) => !opts.used.has(alias) && entry.name === opts.cloudName
    )
    if (match) return match[0]
  }

  return generateFriendlyAlias(opts.cloudName, opts.cloudAlias, opts.used)
}
