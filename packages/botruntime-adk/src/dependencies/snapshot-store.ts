import * as fs from 'fs/promises'
import * as path from 'path'
import type { Client } from '@holocronlab/botruntime-client'
import { generateFriendlyAlias, isFriendlyAlias } from './alias-utils.js'
import { DependencyError } from './errors.js'
import { jsonEqual, sortKeysDeep } from './json-utils.js'
import { integrationRequiresAuthorization } from './status.js'
import { assertDevBotMatchesTarget } from '../integrations/config-utils.js'
import {
  dependencyMigrationCompletionRecordSchema,
  dependencyMigrationMarkerSchema,
  dependencyMigrationPendingSchema,
  dependencySnapshotSchema,
  dependencySnapshotTargetSchema,
  type DependencyMigrationCompletionRecord,
  type DependencyMigrationMarker,
  type DependencyMigrationPending,
  type DependencySnapshotData,
  type DependencySnapshotTarget,
  type DependencyTargetScope,
  type Environment,
  type IntegrationSnapshotEntry,
  type PluginSnapshotEntry,
} from './types.js'

const CANONICAL_PLUGIN_ALIAS_RE = /^[a-z][a-z0-9_-]{1,99}$/
const INTEGRATION_INSTANCE_ALIAS_RE = /^(?:[a-z][a-z0-9_-]*\/)?[a-z][a-z0-9_-]*$/

function isSafeBindingAlias(alias: string): boolean {
  return (
    alias.length > 0 &&
    alias.trim() === alias &&
    !['__proto__', 'prototype', 'constructor'].includes(alias) &&
    !/[\u0000-\u001f\u007f]/.test(alias)
  )
}

function isIntegrationInstanceAlias(alias: string): boolean {
  return alias.length >= 2 && alias.length <= 100 && INTEGRATION_INSTANCE_ALIAS_RE.test(alias)
}

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

export function normalizeDependencySnapshotTarget(value: DependencySnapshotTarget): DependencySnapshotTarget {
  if (!value || typeof value !== 'object') {
    throw invalidSnapshotTarget('expected an explicit target object')
  }
  const env = value.env
  const apiUrl = typeof value.apiUrl === 'string' ? value.apiUrl.replace(/\/+$/, '') : ''
  const workspaceId = value.workspaceId
  const botId = value.botId
  if (env !== 'dev' && env !== 'prod') throw invalidSnapshotTarget('env must be dev or prod')
  if (!apiUrl || apiUrl !== apiUrl.trim()) throw invalidSnapshotTarget('apiUrl must be non-empty and canonical')
  if (typeof workspaceId !== 'string' || !workspaceId || workspaceId !== workspaceId.trim()) {
    throw invalidSnapshotTarget('workspaceId must be a non-empty exact string')
  }
  if (typeof botId !== 'string' || !botId || botId !== botId.trim()) {
    throw invalidSnapshotTarget('botId must be a non-empty exact string')
  }
  return { env, apiUrl, workspaceId, botId }
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

  getMigrationPendingPath(env: Environment): string {
    return path.join(this.dirPath, `migration.${env}.pending.json`)
  }

  async exists(target: DependencySnapshotTarget): Promise<boolean> {
    return (await this.read(target)) !== null
  }

  async read(target: DependencySnapshotTarget): Promise<DependencySnapshotData | null> {
    const expected = normalizeDependencySnapshotTarget(target)
    const filePath = this.getSnapshotPath(expected.env)
    let raw: string
    try {
      raw = await fs.readFile(filePath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }

    return parseSnapshotForTarget(raw, expected, filePath)
  }

  async readOrEmpty(
    target: DependencySnapshotTarget,
    options?: { fetchedAt?: Date }
  ): Promise<DependencySnapshotData> {
    const expected = normalizeDependencySnapshotTarget(target)
    const snapshot = await this.read(expected)
    return snapshot ?? emptyDependencySnapshot(expected, options?.fetchedAt)
  }

  async write(target: DependencySnapshotTarget, snapshot: DependencySnapshotData): Promise<void> {
    const expected = normalizeDependencySnapshotTarget(target)
    const validated = dependencySnapshotSchema.parse(snapshot)
    assertSnapshotTarget(validated, expected, this.getSnapshotPath(expected.env))
    const filePath = this.getSnapshotPath(expected.env)
    await this.writeAtomicJson(filePath, validated)
  }

  async delete(target: DependencySnapshotTarget): Promise<void> {
    const expected = normalizeDependencySnapshotTarget(target)
    const filePath = this.getSnapshotPath(expected.env)
    const snapshot = await this.read(expected)
    if (!snapshot) return
    try {
      // Validate the stored scope immediately before unlink. Node exposes no
      // portable compare-and-unlink primitive; callers still fail closed on a
      // foreign/legacy/corrupt file instead of deleting it intentionally.
      await fs.unlink(filePath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async readMigrationPending(target: DependencySnapshotTarget): Promise<DependencyMigrationPending | null> {
    const expected = normalizeDependencySnapshotTarget(target)
    const filePath = this.getMigrationPendingPath(expected.env)
    const raw = await readOptionalFile(filePath)
    if (raw === null) return null
    let pending: DependencyMigrationPending
    try {
      pending = dependencyMigrationPendingSchema.parse(JSON.parse(raw))
    } catch (err) {
      throw invalidMigrationFile(filePath, err)
    }
    assertMigrationTarget(pending.target, expected, filePath)
    return pending
  }

  async createMigrationPending(
    target: DependencySnapshotTarget,
    pending: DependencyMigrationPending
  ): Promise<void> {
    const expected = normalizeDependencySnapshotTarget(target)
    const validated = dependencyMigrationPendingSchema.parse(pending)
    assertMigrationTarget(validated.target, expected, this.getMigrationPendingPath(expected.env))
    await this.writeExclusiveJson(this.getMigrationPendingPath(expected.env), validated)
  }

  async updateMigrationPending(
    target: DependencySnapshotTarget,
    pending: DependencyMigrationPending
  ): Promise<void> {
    const expected = normalizeDependencySnapshotTarget(target)
    const current = await this.readMigrationPending(expected)
    if (!current) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `Migration pending journal is missing at ${this.getMigrationPendingPath(expected.env)}.`,
      })
    }
    const validated = dependencyMigrationPendingSchema.parse(pending)
    assertMigrationTarget(validated.target, expected, this.getMigrationPendingPath(expected.env))
    if (
      !jsonEqual(current.target, validated.target) ||
      !jsonEqual(current.sources, validated.sources) ||
      !jsonEqual(current.plan, validated.plan) ||
      current.createdAt !== validated.createdAt ||
      !isProgressSuperset(validated.completed, current.completed)
    ) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: 'Migration pending update attempted to replace its immutable plan or remove completed aliases.',
      })
    }
    await this.writeAtomicJson(this.getMigrationPendingPath(expected.env), validated)
  }

  async deleteMigrationPending(target: DependencySnapshotTarget, expectedPlanDigest: string): Promise<void> {
    const expected = normalizeDependencySnapshotTarget(target)
    const pending = await this.readMigrationPending(expected)
    if (!pending) return
    if (pending.plan.digest !== expectedPlanDigest) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: 'Migration pending journal changed before deletion; expected plan digest does not match.',
      })
    }
    try {
      await fs.unlink(this.getMigrationPendingPath(expected.env))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async readMigrationMarker(target: DependencySnapshotTarget): Promise<DependencyMigrationMarker | null> {
    const expected = normalizeDependencySnapshotTarget(target)
    const raw = await readOptionalFile(this.getMigrationMarkerPath())
    if (raw === null) return null
    let json: unknown
    try {
      json = JSON.parse(raw)
    } catch {
      return null
    }
    const parsed = dependencyMigrationMarkerSchema.safeParse(json)
    if (!parsed.success) return null
    const record = parsed.data.records[expected.env]
    if (record && !migrationTargetsEqual(record.target, expected)) return null
    return parsed.data
  }

  async hasMigrationMarker(target: DependencySnapshotTarget): Promise<boolean> {
    const expected = normalizeDependencySnapshotTarget(target)
    const marker = await this.readMigrationMarker(expected)
    return Boolean(marker?.records[expected.env])
  }

  async commitMigrationCompletion(record: DependencyMigrationCompletionRecord): Promise<DependencyMigrationMarker> {
    const validated = dependencyMigrationCompletionRecordSchema.parse(record)
    const target = normalizeDependencySnapshotTarget(validated.target)
    const raw = await readOptionalFile(this.getMigrationMarkerPath())
    let records: DependencyMigrationMarker['records'] = {}
    if (raw !== null) {
      try {
        const existing = dependencyMigrationMarkerSchema.parse(JSON.parse(raw))
        records = { ...existing.records }
      } catch {
        // v1/corrupt marker bytes are replaced only here, after the caller has
        // completed the exact Cloud fetch and snapshot commit.
      }
    }
    const marker = dependencyMigrationMarkerSchema.parse({
      version: 2,
      records: { ...records, [target.env]: validated },
    })
    await this.writeAtomicJson(this.getMigrationMarkerPath(), marker)
    return marker
  }

  private async writeAtomicJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(this.dirPath, { recursive: true })
    const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined
    try {
      handle = await fs.open(tmp, 'wx', 0o600)
      await handle.writeFile(JSON.stringify(sortKeysDeep(value), null, 2) + '\n', 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      await fs.rename(tmp, filePath)
      await syncDirectoryBestEffort(this.dirPath)
    } catch (err) {
      await handle?.close().catch(() => {})
      await fs.unlink(tmp).catch(() => {})
      throw err
    }
  }

  private async writeExclusiveJson(filePath: string, value: unknown): Promise<void> {
    await fs.mkdir(this.dirPath, { recursive: true })
    const tmp = `${filePath}.create-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    let handle: Awaited<ReturnType<typeof fs.open>> | undefined
    try {
      handle = await fs.open(tmp, 'wx', 0o600)
      await handle.writeFile(JSON.stringify(sortKeysDeep(value), null, 2) + '\n', 'utf8')
      await handle.sync()
      await handle.close()
      handle = undefined
      await fs.link(tmp, filePath)
      await fs.unlink(tmp)
      await syncDirectoryBestEffort(this.dirPath)
    } catch (err) {
      await handle?.close().catch(() => {})
      await fs.unlink(tmp).catch(() => {})
      if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new DependencyError({
          code: 'INVALID_CONFIG',
          message: `Migration pending journal already exists at ${filePath}; resume it instead of replacing it.`,
        })
      }
      throw err
    }
  }

  async refreshFromCloud(opts: {
    client: Client
    target: DependencySnapshotTarget
    runtimeBotId?: string
    fetchedAt?: Date
    requireAuthoritative?: boolean
    integrationRegistry?: IntegrationAuthorizationSpecSource
    onWarning?: (warning: DependencySnapshotWarning) => void
  }): Promise<DependencySnapshotData> {
    const target = normalizeDependencySnapshotTarget(opts.target)
    let addressBotId: string
    if (target.env === 'dev') {
      if (
        typeof opts.runtimeBotId !== 'string' ||
        opts.runtimeBotId.length === 0 ||
        opts.runtimeBotId !== opts.runtimeBotId.trim()
      ) {
        throw invalidSnapshotTarget('dev refresh requires a non-empty exact runtimeBotId')
      }
      addressBotId = opts.runtimeBotId
    } else {
      if (opts.runtimeBotId !== undefined) {
        throw invalidSnapshotTarget('prod refresh must address target.botId directly and cannot use runtimeBotId')
      }
      addressBotId = target.botId
    }
    const previous = await this.readForRefresh(target, opts.onWarning)
    const { bot } = await opts.client.getBot({ id: addressBotId })
    if (target.env === 'dev') {
      assertDevBotMatchesTarget(bot, { botId: target.botId, runtimeBotId: addressBotId })
    } else if (bot.id !== target.botId) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `Prod dependency refresh returned bot ${bot.id}; expected exact target bot ${target.botId}.`,
      })
    }
    if (opts.requireAuthoritative) {
      const authorities = parseSnapshotReadinessAuthorities(bot)
      if (authorities.integrations.authority !== 'authoritative') {
        throw snapshotReadinessError(`integration authority is unknown: ${authorities.integrations.reason}`)
      }
      if (authorities.plugins.authority !== 'authoritative') {
        throw snapshotReadinessError(`plugin authority is unknown: ${authorities.plugins.reason}`)
      }
    }
    const snapshot = dependencySnapshotFromBot({
      bot,
      target,
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
    await this.write(target, snapshot)
    return snapshot
  }

  private async readForRefresh(
    target: DependencySnapshotTarget,
    onWarning?: (warning: DependencySnapshotWarning) => void
  ): Promise<DependencySnapshotData | null> {
    try {
      return await this.read(target)
    } catch (err) {
      if (!(err instanceof DependencyError) || err.code !== 'INVALID_CONFIG') throw err
      const filePath = this.getSnapshotPath(target.env)
      onWarning?.({
        code: 'SNAPSHOT_CORRUPT',
        message: `Ignoring non-authoritative dependency snapshot at ${filePath}; it will be replaced only after a successful Cloud refresh.`,
        env: target.env,
        path: filePath,
      })
      return null
    }
  }
}

export function emptyDependencySnapshot(
  target: DependencySnapshotTarget,
  fetchedAt: Date = new Date(0)
): DependencySnapshotData {
  const expected = normalizeDependencySnapshotTarget(target)
  return {
    version: 2,
    env: expected.env,
    target: targetScope(expected),
    fetchedAt: fetchedAt.toISOString(),
    integrations: {},
    plugins: {},
  }
}

function cloudSnapshotUnchanged(previous: DependencySnapshotData, next: DependencySnapshotData): boolean {
  if (previous.env !== next.env || !jsonEqual(previous.target, next.target)) return false
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
  target: DependencySnapshotTarget
  fetchedAt: Date
  previous?: DependencySnapshotData | null
}): DependencySnapshotData {
  const target = normalizeDependencySnapshotTarget(opts.target)
  const authorities = parseSnapshotReadinessAuthorities(opts.bot)
  const previous = opts.previous ? dependencySnapshotSchema.parse(opts.previous) : null
  if (previous) assertSnapshotTarget(previous, target, 'previous dependency snapshot')
  if (authorities.integrations.authority === 'unknown' && !previous) {
    throw snapshotReadinessError(`integration authority is unknown: ${authorities.integrations.reason}`)
  }
  if (authorities.plugins.authority === 'unknown' && !previous) {
    throw snapshotReadinessError(`plugin authority is unknown: ${authorities.plugins.reason}`)
  }

  const integrations =
    authorities.integrations.authority === 'authoritative'
      ? snapshotIntegrationsFromAuthoritativeBot(opts.bot, previous)
      : cloneSnapshotMap(previous!.integrations)
  const plugins =
    authorities.plugins.authority === 'authoritative'
      ? snapshotPluginsFromAuthoritativeBot(opts.bot, previous)
      : cloneSnapshotMap(previous!.plugins)

  return {
    version: 2,
    env: target.env,
    target: targetScope(target),
    fetchedAt: opts.fetchedAt.toISOString(),
    ...(typeof opts.bot.updatedAt === 'string' ? { botUpdatedAt: opts.bot.updatedAt } : {}),
    integrations,
    plugins,
  }
}

type SnapshotReadinessAuthority =
  | { authority: 'authoritative'; source: string }
  | { authority: 'unknown'; reason: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function targetScope(target: DependencySnapshotTarget): DependencyTargetScope {
  return { apiUrl: target.apiUrl, workspaceId: target.workspaceId, botId: target.botId }
}

function assertSnapshotTarget(
  snapshot: DependencySnapshotData,
  expected: DependencySnapshotTarget,
  filePath: string
): void {
  if (snapshot.env !== expected.env || !jsonEqual(snapshot.target, targetScope(expected))) {
    throw new DependencyError({
      code: 'INVALID_CONFIG',
      message:
        `Dependency snapshot at ${filePath} belongs to another target; expected ` +
        `${expected.env} ${expected.apiUrl} workspace=${expected.workspaceId} bot=${expected.botId}. Refresh it for the selected target.`,
    })
  }
}

function parseSnapshotForTarget(
  raw: string,
  expected: DependencySnapshotTarget,
  filePath: string
): DependencySnapshotData {
  try {
    const snapshot = dependencySnapshotSchema.parse(JSON.parse(raw))
    assertSnapshotTarget(snapshot, expected, filePath)
    return snapshot
  } catch (err) {
    if (err instanceof DependencyError) throw err
    throw new DependencyError({
      code: 'INVALID_CONFIG',
      message: `Dependency snapshot at ${filePath} is legacy, corrupt, or non-canonical; refresh it for the selected target`,
      details: { issues: (err as { issues?: unknown }).issues ?? String(err) },
    })
  }
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw err
  }
}

async function syncDirectoryBestEffort(dirPath: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(dirPath, 'r')
    await handle.sync()
  } catch {
    // Some platforms/filesystems do not support fsync on directories. The
    // data file itself has already been fsynced before the atomic rename.
  } finally {
    await handle?.close().catch(() => {})
  }
}

function migrationTargetsEqual(a: DependencySnapshotTarget, b: DependencySnapshotTarget): boolean {
  const left = normalizeDependencySnapshotTarget(dependencySnapshotTargetSchema.parse(a))
  const right = normalizeDependencySnapshotTarget(dependencySnapshotTargetSchema.parse(b))
  return jsonEqual(left, right)
}

function assertMigrationTarget(
  actual: DependencySnapshotTarget,
  expected: DependencySnapshotTarget,
  filePath: string
): void {
  if (!migrationTargetsEqual(actual, expected)) {
    throw new DependencyError({
      code: 'INVALID_CONFIG',
      message: `Migration state at ${filePath} belongs to another target and cannot be resumed or deleted.`,
    })
  }
}

function invalidMigrationFile(filePath: string, error: unknown): DependencyError {
  return new DependencyError({
    code: 'INVALID_CONFIG',
    message: `Migration state at ${filePath} is legacy or corrupt and cannot be resumed.`,
    details: { issues: (error as { issues?: unknown }).issues ?? String(error) },
  })
}

function isProgressSuperset(
  candidate: DependencyMigrationPending['completed'],
  current: DependencyMigrationPending['completed']
): boolean {
  return (
    current.integrations.every((alias) => candidate.integrations.includes(alias)) &&
    current.plugins.every((alias) => candidate.plugins.includes(alias))
  )
}

function invalidSnapshotTarget(message: string): DependencyError {
  return new DependencyError({
    code: 'INVALID_CONFIG',
    message: `Dependency snapshot target is invalid: ${message}`,
  })
}

function snapshotReadinessError(message: string): DependencyError {
  return new DependencyError({
    code: 'SNAPSHOT_DRIFT',
    message: `Cloud dependency readiness response is invalid: ${message}`,
  })
}

function parseSnapshotAuthority(
  value: unknown,
  label: string,
  expectedSource: string
): SnapshotReadinessAuthority {
  if (value === undefined) return { authority: 'unknown', reason: `${label}_authority_omitted` }
  if (!isRecord(value)) throw snapshotReadinessError(`${label} authority metadata must be an object`)
  if (value.authority === 'authoritative') {
    if (value.source !== expectedSource) {
      throw snapshotReadinessError(`${label} authority source must be ${expectedSource}`)
    }
    return { authority: 'authoritative', source: expectedSource }
  }
  if (value.authority === 'unknown') {
    if (typeof value.reason !== 'string' || value.reason === '') {
      throw snapshotReadinessError(`${label} unknown authority requires a reason`)
    }
    return { authority: 'unknown', reason: value.reason }
  }
  throw snapshotReadinessError(`${label} authority must be authoritative or unknown`)
}

function parseSnapshotReadinessAuthorities(
  bot: Awaited<ReturnType<Client['getBot']>>['bot']
): { integrations: SnapshotReadinessAuthority; plugins: SnapshotReadinessAuthority } {
  const readiness = (bot as unknown as { devReadiness?: unknown }).devReadiness
  if (readiness === undefined) {
    return {
      integrations: { authority: 'unknown', reason: 'integration_authority_omitted' },
      plugins: { authority: 'unknown', reason: 'plugin_authority_omitted' },
    }
  }
  if (!isRecord(readiness) || readiness.schemaVersion !== 1) {
    throw snapshotReadinessError('devReadiness.schemaVersion must equal 1')
  }
  const lastDeployment = readiness.lastDevDeployment
  if (!isRecord(lastDeployment)) {
    throw snapshotReadinessError('lastDevDeployment authority metadata must be an object')
  }
  if (lastDeployment.authority === 'unknown') {
    if (typeof lastDeployment.reason !== 'string' || lastDeployment.reason === '') {
      throw snapshotReadinessError('lastDevDeployment unknown authority requires a reason')
    }
  } else if (lastDeployment.authority === 'authoritative') {
    if (typeof lastDeployment.revision !== 'string' || lastDeployment.revision === '') {
      throw snapshotReadinessError('lastDevDeployment authoritative metadata requires a revision')
    }
  } else {
    throw snapshotReadinessError('lastDevDeployment authority must be authoritative or unknown')
  }
  return {
    integrations: parseSnapshotAuthority(
      readiness.integrations,
      'integration',
      'integration_installation'
    ),
    plugins: parseSnapshotAuthority(readiness.plugins, 'plugin', 'bot_definition_plugins'),
  }
}

function cloneSnapshotMap<T>(value: Record<string, T>): Record<string, T> {
  return JSON.parse(JSON.stringify(value)) as Record<string, T>
}

function authoritativeIntegrationRows(
  bot: Awaited<ReturnType<Client['getBot']>>['bot']
): Record<string, Record<string, unknown>> {
  const raw = (bot as unknown as { integrations?: unknown }).integrations
  if (!isRecord(raw)) throw snapshotReadinessError('bot.integrations must be an object')
  const rows: Record<string, Record<string, unknown>> = {}
  for (const alias of Object.keys(raw).sort()) {
    if (!alias) throw snapshotReadinessError('integration alias must be non-empty')
    const row = raw[alias]
    if (!isRecord(row)) throw snapshotReadinessError(`integration ${alias} must be an object`)
    for (const field of ['id', 'installationId', 'name', 'version', 'configurationType', 'configurationRevision', 'status'] as const) {
      if (typeof row[field] !== 'string' || row[field] === '') {
        throw snapshotReadinessError(`integration ${alias} ${field} must be a non-empty string`)
      }
    }
    if (typeof row.enabled !== 'boolean') {
      throw snapshotReadinessError(`integration ${alias} enabled must be a boolean`)
    }
    if (typeof row.statusReason !== 'string') {
      throw snapshotReadinessError(`integration ${alias} statusReason must be a string`)
    }
    if (row.configurationType !== 'manual') {
      throw snapshotReadinessError(`integration ${alias} configurationType must be manual`)
    }
    if (!/^sha256:[0-9a-f]{64}$/.test(String(row.configurationRevision))) {
      throw snapshotReadinessError(`integration ${alias} configurationRevision is invalid`)
    }
    if (!['pending', 'registered', 'failed'].includes(String(row.status))) {
      throw snapshotReadinessError(`integration ${alias} status is invalid`)
    }
    rows[alias] = row
  }
  return rows
}

function snapshotIntegrationsFromAuthoritativeBot(
  bot: Awaited<ReturnType<Client['getBot']>>['bot'],
  previous: DependencySnapshotData | null
): Record<string, IntegrationSnapshotEntry> {
  const integrations: Record<string, IntegrationSnapshotEntry> = {}
  const usedIntegrationAliases = new Set<string>()
  for (const [cloudAlias, cloud] of Object.entries(authoritativeIntegrationRows(bot))) {
    const cloudName = cloud.name as string
    const version = cloud.version as string
    const configurationType = cloud.configurationType as string
    const configurationRevision = cloud.configurationRevision as string
    const cloudId = cloud.id as string
    const alias = chooseCloudAlias({
      cloudAlias,
      cloudName,
      previous: previous?.integrations ?? {},
      used: usedIntegrationAliases,
      matches: (entry) =>
        entry.cloudAlias === cloudAlias ||
        (entry.cloudId === cloudId &&
          entry.version === version &&
          entry.configurationType === configurationType &&
          entry.configurationRevision === configurationRevision),
    })
    usedIntegrationAliases.add(alias)

    const previousEntry = previous?.integrations[alias]
    const config = previousEntry?.config ?? (isRecord(cloud.configuration) ? cloud.configuration : {})
    const previousMissingFields =
      previousEntry?.missingFields?.length &&
      !cloud.enabled &&
      previousEntry.version === version &&
      previousEntry.configurationType === configurationType &&
      previousEntry.configurationRevision === configurationRevision
        ? previousEntry.missingFields
        : undefined

    integrations[alias] = {
      name: cloudName,
      version,
      enabled: cloud.enabled as boolean,
      config,
      configurationType,
      configurationRevision,
      ...(previousMissingFields ? { missingFields: previousMissingFields } : {}),
      ...(!cloud.identifier && previousEntry?.authorizationPending ? { authorizationPending: true } : {}),
      cloudId,
      cloudAlias,
      ...(typeof cloud.updatedAt === 'string' ? { updatedAt: cloud.updatedAt } : {}),
    }
  }
  return integrations
}

function snapshotPluginsFromAuthoritativeBot(
  bot: Awaited<ReturnType<Client['getBot']>>['bot'],
  previous: DependencySnapshotData | null
): Record<string, PluginSnapshotEntry> {
  const plugins: Record<string, PluginSnapshotEntry> = {}
  const rawPlugins = (bot as unknown as { plugins?: unknown }).plugins
  if (!isRecord(rawPlugins)) throw snapshotReadinessError('bot.plugins must be an object')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cloud bot plugins shape is wider than the client type in older versions
  for (const [cloudAlias, cloud] of Object.entries(rawPlugins as Record<string, any>)) {
    if (!CANONICAL_PLUGIN_ALIAS_RE.test(cloudAlias) || ['prototype', 'constructor'].includes(cloudAlias)) {
      throw snapshotReadinessError('plugin alias is invalid')
    }
    if (!isRecord(cloud)) throw snapshotReadinessError(`plugin ${cloudAlias} must be an object`)
    const fields = Object.keys(cloud).sort()
    const canonicalFields = ['configuration', 'enabled', 'id', 'integrations', 'interfaces', 'name', 'version']
    if (!jsonEqual(fields, canonicalFields)) {
      throw snapshotReadinessError(
        `plugin ${cloudAlias} must contain exactly ${canonicalFields.join(', ')}; received ${fields.join(', ')}`
      )
    }
    for (const field of ['id', 'name', 'version'] as const) {
      if (typeof cloud[field] !== 'string' || cloud[field] === '') {
        throw snapshotReadinessError(`plugin ${cloudAlias} ${field} must be a non-empty string`)
      }
    }
    if (!/^[1-9][0-9]*$/.test(cloud.id as string)) {
      throw snapshotReadinessError(`plugin ${cloudAlias} id must be a canonical positive integer string`)
    }
    if (typeof cloud.enabled !== 'boolean') {
      throw snapshotReadinessError(`plugin ${cloudAlias} enabled must be a boolean`)
    }
    if (!isRecord(cloud.configuration)) {
      throw snapshotReadinessError(`plugin ${cloudAlias} configuration must be an object`)
    }
    if (!isRecord(cloud.interfaces)) {
      throw snapshotReadinessError(`plugin ${cloudAlias} interfaces must be an object`)
    }
    if (!isRecord(cloud.integrations)) {
      throw snapshotReadinessError(`plugin ${cloudAlias} integrations must be an object`)
    }
    const cloudName = cloud.name as string
    const config = cloud.configuration
    const version = cloud.version as string
    const enabled = cloud.enabled as boolean
    const dependencies: Record<string, { integrationAlias: string }> = {}
    for (const [ifaceAlias, dep] of Object.entries(cloud.interfaces as Record<string, unknown>)) {
      if (!isSafeBindingAlias(ifaceAlias)) {
        throw snapshotReadinessError(`plugin ${cloudAlias} interface alias is invalid`)
      }
      if (!isRecord(dep)) {
        throw snapshotReadinessError(`plugin ${cloudAlias} interface mapping ${ifaceAlias} must be an object`)
      }
      if (!jsonEqual(Object.keys(dep).sort(), ['integrationAlias', 'integrationId', 'integrationInterfaceAlias'])) {
        throw snapshotReadinessError(`plugin ${cloudAlias} interface mapping ${ifaceAlias} is noncanonical`)
      }
      if (typeof dep.integrationAlias !== 'string' || !isIntegrationInstanceAlias(dep.integrationAlias)) {
        throw snapshotReadinessError(
          `plugin ${cloudAlias} interface mapping ${ifaceAlias} integrationAlias is invalid`
        )
      }
      for (const field of ['integrationId', 'integrationInterfaceAlias'] as const) {
        if (typeof dep[field] !== 'string' || dep[field] === '') {
          throw snapshotReadinessError(`plugin ${cloudAlias} interface mapping ${ifaceAlias} ${field} must be a non-empty string`)
        }
      }
      if (!isSafeBindingAlias(dep.integrationInterfaceAlias as string)) {
        throw snapshotReadinessError(`plugin ${cloudAlias} interface mapping ${ifaceAlias} integrationInterfaceAlias is invalid`)
      }
      dependencies[ifaceAlias] = { integrationAlias: dep.integrationAlias }
    }
    for (const [integrationAlias, dep] of Object.entries(cloud.integrations as Record<string, unknown>)) {
      if (!isSafeBindingAlias(integrationAlias)) {
        throw snapshotReadinessError(`plugin ${cloudAlias} integration alias is invalid`)
      }
      if (dependencies[integrationAlias]) {
        throw snapshotReadinessError(
          `plugin ${cloudAlias} dependency ${integrationAlias} is duplicated across interfaces and integrations`
        )
      }
      if (!isRecord(dep)) {
        throw snapshotReadinessError(`plugin ${cloudAlias} integration mapping ${integrationAlias} must be an object`)
      }
      if (!jsonEqual(Object.keys(dep).sort(), ['integrationAlias', 'integrationId'])) {
        throw snapshotReadinessError(`plugin ${cloudAlias} integration mapping ${integrationAlias} is noncanonical`)
      }
      if (
        typeof dep.integrationId !== 'string' || dep.integrationId === '' ||
        typeof dep.integrationAlias !== 'string' || !isIntegrationInstanceAlias(dep.integrationAlias)
      ) {
        throw snapshotReadinessError(`plugin ${cloudAlias} integration mapping ${integrationAlias} is invalid`)
      }
      dependencies[integrationAlias] = { integrationAlias: dep.integrationAlias }
    }

    const previousEntry = previous?.plugins[cloudAlias]
    const previousMissingFields =
      previousEntry?.missingFields?.length &&
      !enabled &&
      previousEntry.version === version &&
      jsonEqual(previousEntry.config, config)
        ? previousEntry.missingFields
        : undefined

    plugins[cloudAlias] = {
      name: cloudName,
      version,
      enabled,
      config,
      dependencies,
      ...(previousMissingFields ? { missingFields: previousMissingFields } : {}),
      cloudId: cloud.id as string,
      cloudAlias,
      ...(typeof cloud.updatedAt === 'string' ? { updatedAt: cloud.updatedAt } : {}),
    }
  }
  return plugins
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
