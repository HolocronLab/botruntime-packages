import * as fs from 'fs/promises'
import * as path from 'path'
import crypto from 'crypto'
import {
  Project,
  Node,
  SyntaxKind,
  type Expression,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
} from 'ts-morph'
import type { Client } from '@holocronlab/botruntime-client'
import {
  dependencyStateSchema,
  type DependencyMigrationCompletionRecord,
  type DependencyMigrationMarker,
  type DependencyMigrationPending,
  type DependencyMigrationProgress,
  type DependencyMigrationSource,
  type DependencySnapshotData,
  type DependencySnapshotTarget,
  type DependencyStateData,
  type IntegrationDependencyEntry,
  type MigrationResult,
  type PluginDependencyEntry,
} from './types.js'
import {
  DependencySnapshotStore,
  dependencySnapshotFromBot,
  normalizeDependencySnapshotTarget,
} from './snapshot-store.js'
import { IntegrationRegistry } from './registry/integration-registry.js'
import { PluginRegistry } from './registry/plugin-registry.js'
import {
  IntegrationResolver,
  type IntegrationApplyOptions,
} from './resolvers/integration-resolver.js'
import { PluginResolver, type PluginApplyOptions } from './resolvers/plugin-resolver.js'
import {
  freezePreparedPayload,
  type PreparedCloudApply,
} from './resolvers/prepared-apply.js'
import { assertDevBotMatchesTarget } from '../integrations/config-utils.js'
import { readAgentInfo, readAgentLocalInfo } from '../agent-project/agent-resolver.js'
import { DependencyError } from './errors.js'
import { jsonEqual, sortKeysDeep } from './json-utils.js'
import { withDependencyMigrationLock } from './migration-mutex.js'

type MigrationIntegrationResolver = Pick<IntegrationResolver, 'applyToCloud'> &
  Partial<Pick<IntegrationResolver, 'prepareApplyToCloud'>>
type MigrationPluginResolver = Pick<PluginResolver, 'applyToCloud'> &
  Partial<Pick<PluginResolver, 'prepareApplyToCloud'>>

export interface DependencyMigrationResolvers {
  integration?: MigrationIntegrationResolver
  plugin?: MigrationPluginResolver
}

export type DependencyMigrationAuthority =
  | { source: 'agent' }
  | { source: 'agentLocalBot' }
  | {
      source: 'agentLocalDev'
      coordinates:
        | { source: 'link' }
        | { source: 'attested'; apiUrl: string; workspaceId: string }
    }
  | { source: 'explicit'; botId: string }

export interface MigrateOptions {
  projectPath: string
  client: Client
  target: DependencySnapshotTarget
  runtimeBotId?: string
  authority?: DependencyMigrationAuthority
  resolvers?: DependencyMigrationResolvers
  integrationResolver?: MigrationIntegrationResolver
  pluginResolver?: MigrationPluginResolver
}

type CloudBot = Awaited<ReturnType<Client['getBot']>>['bot']
type SourceKind = DependencyMigrationSource['kind']
type DependencyKind = 'integration' | 'plugin'

interface SourceFileState {
  kind: SourceKind
  path: string
  raw: string
  digest: string
}

interface EntryConstraints {
  name: string
  version: string
  enabled?: boolean
  config?: Record<string, unknown>
  configurationType?: string
  dependencies?: Record<string, { integrationAlias: string }>
}

interface ParsedDependencies {
  state: DependencyStateData
  integrationConstraints: Record<string, EntryConstraints>
  pluginConstraints: Record<string, EntryConstraints>
}

interface AgentConfigSource extends SourceFileState {
  kind: 'agentConfig'
  parsed: ParsedDependencies
}

interface LockSource extends SourceFileState {
  kind: 'lock'
  parsed: ParsedDependencies
}

interface MigrationPlan extends ParsedDependencies {
  sources: Array<AgentConfigSource | LockSource>
  sourceRecords: DependencyMigrationSource[]
  progress: DependencyMigrationProgress
  digest: string
}

interface PreparedMigrationOperation {
  kind: 'integrations' | 'plugins'
  alias: string
  apply: PreparedCloudApply
}

type MigrationTargetAuthorityProof = 'exact' | 'legacyDevRuntimeHint'

export class DependencyMigrationManager {
  private readonly projectPath: string
  private readonly client: Client
  private readonly target: DependencySnapshotTarget
  private readonly runtimeBotId?: string
  private readonly authority: DependencyMigrationAuthority
  private readonly snapshotStore: DependencySnapshotStore
  private readonly integrationResolver: MigrationIntegrationResolver
  private readonly pluginResolver: MigrationPluginResolver

  constructor(opts: MigrateOptions) {
    this.projectPath = opts.projectPath
    this.client = opts.client
    this.target = normalizeDependencySnapshotTarget(opts.target)
    this.runtimeBotId = normalizeRuntimeBotId(this.target, opts.runtimeBotId)
    this.authority = normalizeMigrationAuthority(this.target, opts.authority)
    this.snapshotStore = new DependencySnapshotStore({ projectPath: opts.projectPath })

    const integrationRegistry = new IntegrationRegistry()
    const pluginRegistry = new PluginRegistry()
    this.integrationResolver =
      opts.resolvers?.integration ??
      opts.integrationResolver ??
      new IntegrationResolver({ registry: integrationRegistry, client: this.client })
    this.pluginResolver =
      opts.resolvers?.plugin ??
      opts.pluginResolver ??
      new PluginResolver({
        registry: pluginRegistry,
        integrationRegistry,
        client: this.client,
      })
  }

  async run(): Promise<MigrationResult> {
    return withDependencyMigrationLock(this.projectPath, () => this.runLocked())
  }

  private async runLocked(): Promise<MigrationResult> {
    const result = emptyMigrationResult()
    await assertMigrationTargetAuthority(
      this.projectPath,
      this.target,
      this.runtimeBotId,
      this.authority
    )

    // Pending is intentionally parsed before any Cloud access. A foreign,
    // legacy, or corrupt journal is evidence of an interrupted transaction and
    // must remain byte-for-byte untouched for explicit recovery.
    const pending = await this.snapshotStore.readMigrationPending(this.target)
    const marker = await this.snapshotStore.readMigrationMarker(this.target)
    const completion = marker?.records[this.target.env]

    if (completion) {
      // Completion records suppress only the one-time legacy import. Cloud is
      // still the mandatory live authority for every stateful invocation: an
      // integration/plugin may have changed after bootstrap. Refreshing through
      // the snapshot store preserves the previous bytes until the exact target,
      // identity and readiness contract have all been verified, then commits by
      // atomic rename under the same migration lock.
      await this.snapshotStore.refreshFromCloud({
        client: this.client,
        target: this.target,
        ...(this.target.env === 'dev' ? { runtimeBotId: this.runtimeBotId } : {}),
        requireAuthoritative: true,
      })
      result.snapshotWrites?.push(this.target.env)
      await this.finishCommittedCleanup({ marker, completion, pending })
      result.skipped.push({ env: this.target.env, reason: 'migration already completed' })
      return result
    }

    const plan = await buildMigrationPlan(this.projectPath, this.target)
    recordLegacySources(result, plan)
    if (pending) assertPendingMatchesPlan(pending, plan, this.target)

    const initialBot = await this.fetchExactBot()
    assertDependencyReadinessAuthority(initialBot)

    let activePending = pending
    let finalBot = initialBot
    if (activePending) {
      assertCompletedPendingAliases(initialBot, plan, activePending)
      const prepared = await this.preparePendingImport(activePending, plan)
      finalBot = await this.resumePendingImport(activePending, plan, prepared, result)
    } else {
      const reconciliation = reconcileNoJournalCloud(initialBot, plan)
      if (reconciliation === 'empty-import') {
        activePending = makePending(this.target, plan)
        const prepared = await this.preparePendingImport(activePending, plan)
        await this.snapshotStore.createMigrationPending(this.target, activePending)
        finalBot = await this.resumePendingImport(activePending, plan, prepared, result)
      }
    }

    const previous = migrationPreviousSnapshot(plan, this.target, finalBot)
    const snapshot = dependencySnapshotFromBot({
      bot: finalBot,
      target: this.target,
      fetchedAt: new Date(),
      previous,
    })
    await this.snapshotStore.write(this.target, snapshot)
    result.snapshotWrites?.push(this.target.env)

    const completionRecord = makeCompletionRecord(this.target, plan, this.runtimeBotId)
    const committedMarker = await this.snapshotStore.commitMigrationCompletion(completionRecord)
    if (activePending) {
      await this.snapshotStore.deleteMigrationPending(this.target, plan.digest)
    }

    await cleanupCommittedSources(this.projectPath, committedMarker, completionRecord, this.authority)

    result.migrated.push(this.target.env)
    result.warnings.push({
      code: 'MIGRATED_DEPENDENCIES',
      message: `Migrated ${this.target.env} dependencies to an authority-scoped Cloud snapshot.`,
    })
    return result
  }

  private async resumePendingImport(
    initialPending: DependencyMigrationPending,
    plan: MigrationPlan,
    operations: PreparedMigrationOperation[],
    result: MigrationResult
  ): Promise<CloudBot> {
    let pending = initialPending
    let wrote = false

    for (const operation of operations) {
      await operation.apply()
      wrote = true
      pending = checkpointPending(pending, operation.kind, operation.alias)
      await this.snapshotStore.updateMigrationPending(this.target, pending)
    }

    if (wrote && !result.cloudWrites?.includes(this.target.env)) {
      result.cloudWrites?.push(this.target.env)
    }

    const bot = await this.fetchExactBot()
    assertDependencyReadinessAuthority(bot)
    assertCloudContainsImportedPlan(bot, plan)
    return bot
  }

  private async preparePendingImport(
    pending: DependencyMigrationPending,
    plan: MigrationPlan
  ): Promise<PreparedMigrationOperation[]> {
    const operations: PreparedMigrationOperation[] = []

    for (const alias of plan.progress.integrations) {
      if (pending.completed.integrations.includes(alias)) continue
      const args = freezePreparedPayload<IntegrationApplyOptions>({
        botId: this.target.botId,
        alias,
        entry: plan.state.integrations[alias]!,
      })
      const apply = this.integrationResolver.prepareApplyToCloud
        ? await this.integrationResolver.prepareApplyToCloud(args)
        : async () => this.integrationResolver.applyToCloud(args)
      operations.push({ kind: 'integrations', alias, apply })
    }

    for (const alias of plan.progress.plugins) {
      if (pending.completed.plugins.includes(alias)) continue
      const args = freezePreparedPayload<PluginApplyOptions>({
        botId: this.target.botId,
        alias,
        entry: plan.state.plugins[alias]!,
        state: plan.state,
      })
      const apply = this.pluginResolver.prepareApplyToCloud
        ? await this.pluginResolver.prepareApplyToCloud(args)
        : async () => this.pluginResolver.applyToCloud(args)
      operations.push({ kind: 'plugins', alias, apply })
    }

    return operations
  }

  private async fetchExactBot(): Promise<CloudBot> {
    const addressBotId = this.target.env === 'dev' ? this.runtimeBotId! : this.target.botId
    const { bot } = await this.client.getBot({ id: addressBotId })
    if (this.target.env === 'dev') {
      assertDevBotMatchesTarget(bot, { botId: this.target.botId, runtimeBotId: addressBotId })
    } else if (bot.id !== this.target.botId) {
      throw migrationError(
        `Prod dependency migration returned bot ${bot.id}; expected exact target ${this.target.botId}.`
      )
    }
    return bot
  }

  private async finishCommittedCleanup(opts: {
    marker: DependencyMigrationMarker
    completion: DependencyMigrationCompletionRecord
    pending: DependencyMigrationPending | null
  }): Promise<void> {
    if (opts.pending) {
      const provenance = opts.completion.provenance
      if (provenance.kind !== 'legacy' || provenance.planDigest !== opts.pending.plan.digest) {
        throw migrationError('Committed migration marker does not match the leftover pending journal plan.')
      }
      await this.snapshotStore.deleteMigrationPending(this.target, opts.pending.plan.digest)
    }
    await cleanupCommittedSources(this.projectPath, opts.marker, opts.completion, this.authority)
  }
}

export async function migrateFromConfig(opts: MigrateOptions): Promise<MigrationResult> {
  return new DependencyMigrationManager(opts).run()
}

function emptyMigrationResult(): MigrationResult {
  return {
    migrated: [],
    warnings: [],
    skipped: [],
    legacySources: [],
    snapshotWrites: [],
    cloudWrites: [],
  }
}

function normalizeRuntimeBotId(target: DependencySnapshotTarget, value: string | undefined): string | undefined {
  if (target.env === 'prod') {
    if (value !== undefined) throw migrationError('Prod dependency migration cannot use a dev runtime bot ID.')
    return undefined
  }
  if (typeof value !== 'string' || !value || value !== value.trim()) {
    throw migrationError('Dev dependency migration requires an exact non-empty runtime bot ID.')
  }
  return value
}

function normalizeMigrationAuthority(
  target: DependencySnapshotTarget,
  value: DependencyMigrationAuthority | undefined
): DependencyMigrationAuthority {
  const authority: unknown =
    value ??
    (target.env === 'prod'
      ? { source: 'agent' }
      : { source: 'agentLocalDev', coordinates: { source: 'link' } })
  if (!isRecord(authority) || typeof authority.source !== 'string') {
    throw migrationError('Dependency migration authority must be a supported explicit policy.')
  }

  if (authority.source === 'agent' || authority.source === 'agentLocalBot') {
    assertExactKeys(authority, ['source'], 'dependency migration authority')
    if (target.env !== 'prod') {
      throw migrationError(`${authority.source} authority is valid only for a prod snapshot target.`)
    }
    return { source: authority.source }
  }

  if (authority.source === 'explicit') {
    assertExactKeys(authority, ['source', 'botId'], 'explicit dependency migration authority')
    if (target.env !== 'prod') throw migrationError('Explicit authority is valid only for a prod snapshot target.')
    if (
      typeof authority.botId !== 'string' ||
      !authority.botId ||
      authority.botId !== authority.botId.trim() ||
      authority.botId !== target.botId
    ) {
      throw migrationError('Explicit dependency migration authority must exactly match target.botId.')
    }
    return { source: 'explicit', botId: authority.botId }
  }

  if (authority.source === 'agentLocalDev') {
    assertExactKeys(authority, ['source', 'coordinates'], 'dev dependency migration authority')
    if (target.env !== 'dev') throw migrationError('agentLocalDev authority is valid only for a dev snapshot target.')
    if (!isRecord(authority.coordinates) || typeof authority.coordinates.source !== 'string') {
      throw migrationError('Dev dependency migration coordinate authority is invalid.')
    }
    if (authority.coordinates.source === 'link') {
      assertExactKeys(authority.coordinates, ['source'], 'dev link coordinate authority')
      return { source: 'agentLocalDev', coordinates: { source: 'link' } }
    }
    if (authority.coordinates.source === 'attested') {
      assertExactKeys(
        authority.coordinates,
        ['source', 'apiUrl', 'workspaceId'],
        'attested dev coordinate authority'
      )
      if (
        authority.coordinates.apiUrl !== target.apiUrl ||
        authority.coordinates.workspaceId !== target.workspaceId
      ) {
        throw migrationError(
          'Attested dev apiUrl/workspaceId authority does not match the exact selected migration target.'
        )
      }
      return {
        source: 'agentLocalDev',
        coordinates: {
          source: 'attested',
          apiUrl: target.apiUrl,
          workspaceId: target.workspaceId,
        },
      }
    }
    throw migrationError('Dev dependency migration coordinate authority is unsupported.')
  }

  throw migrationError(`Unsupported dependency migration authority source '${authority.source}'.`)
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  const actual = Object.keys(value).sort()
  const exact = [...expected].sort()
  if (!jsonEqual(actual, exact)) {
    throw migrationError(`${label} must contain exactly ${exact.join(', ')}.`)
  }
}

async function assertMigrationTargetAuthority(
  projectPath: string,
  target: DependencySnapshotTarget,
  runtimeBotId: string | undefined,
  authority: DependencyMigrationAuthority
): Promise<MigrationTargetAuthorityProof> {
  if (authority.source === 'explicit') return 'exact'

  const link =
    authority.source === 'agent'
      ? await readAgentInfo(projectPath)
      : await readAgentLocalInfo(projectPath)
  if (!link) {
    throw migrationError(
      `The ${authority.source} project link is missing; cannot prove the selected migration target.`
    )
  }

  if (authority.source === 'agentLocalDev') {
    if (link.devId !== runtimeBotId || !link.devId) {
      throw migrationError('Dev project link does not match the exact runtime bot ID selected for migration.')
    }

    const hasDevApiUrl = link.devApiUrl !== undefined
    const hasDevWorkspaceId = link.devWorkspaceId !== undefined
    if (hasDevApiUrl !== hasDevWorkspaceId) {
      throw migrationError('Dev project link has partial scoped apiUrl/workspaceId authority.')
    }

    if (!hasDevApiUrl) {
      // Legacy agent.local files did not bind the numeric dev target to a
      // stack. The opaque devId is safe only as a GET address on the already
      // selected stack; devTargetBotId is deliberately ignored until Cloud
      // returns an authoritative dev target tag.
      return 'legacyDevRuntimeHint'
    }

    if (
      normalizeApiUrl(link.devApiUrl) !== target.apiUrl ||
      link.devWorkspaceId !== target.workspaceId ||
      link.devTargetBotId !== target.botId
    ) {
      throw migrationError('Dev project link does not match the exact scoped migration target.')
    }
    return 'exact'
  }

  if (link.botId !== target.botId) {
    throw migrationError(
      `${authority.source} project link does not match the exact botId migration target.`
    )
  }

  if (
    normalizeApiUrl(link.apiUrl) !== target.apiUrl ||
    link.workspaceId !== target.workspaceId
  ) {
    throw migrationError(
      `${authority.source} project link does not match the exact apiUrl/workspaceId migration target.`
    )
  }
  return 'exact'
}

function normalizeApiUrl(value: string | undefined): string {
  return typeof value === 'string' ? value.replace(/\/+$/, '') : ''
}

async function buildMigrationPlan(
  projectPath: string,
  target: DependencySnapshotTarget
): Promise<MigrationPlan> {
  const sources: Array<AgentConfigSource | LockSource> = []
  const config = await readAgentConfigSource(projectPath, target.env)
  if (config) sources.push(config)
  const lock = await readLockSource(projectPath, target.env)
  if (lock) sources.push(lock)
  sources.sort((left, right) => left.kind.localeCompare(right.kind))

  const merged = emptyParsedDependencies(target.env)
  for (const source of sources) mergeParsedDependencies(merged, source.parsed, source.kind)
  merged.state = dependencyStateSchema.parse(sortKeysDeep(merged.state))

  const sourceRecords = sources.map(({ kind, digest }) => ({ kind, digest }))
  const progress: DependencyMigrationProgress = {
    integrations: Object.keys(merged.state.integrations).sort(),
    plugins: Object.keys(merged.state.plugins).sort(),
  }
  const digest = sha256Canonical({
    target,
    sources: sourceRecords,
    state: merged.state,
    integrationConstraints: merged.integrationConstraints,
    pluginConstraints: merged.pluginConstraints,
  })
  return { ...merged, sources, sourceRecords, progress, digest }
}

async function readLockSource(projectPath: string, env: DependencySnapshotTarget['env']): Promise<LockSource | null> {
  const filePath = path.join(projectPath, `dependencies.${env}.lock.json`)
  const raw = await readOptional(filePath)
  if (raw === null) return null

  let state: DependencyStateData
  try {
    state = parseLosslessLegacyLock(raw, filePath, env)
  } catch (error) {
    throw migrationError(`Legacy dependency lock at ${filePath} is invalid: ${String(error)}`)
  }
  if (state.env !== env) {
    throw migrationError(`Legacy dependency lock at ${filePath} belongs to ${state.env}, expected ${env}.`)
  }

  const parsed = parsedFromState(state, true)
  return { kind: 'lock', path: filePath, raw, digest: sha256Raw(raw), parsed }
}

function parseLosslessLegacyLock(
  raw: string,
  filePath: string,
  env: DependencySnapshotTarget['env']
): DependencyStateData {
  const value = JSON.parse(raw) as unknown
  assertNoPrototypeKeysDeep(value, `legacy lock ${filePath}`)
  assertKnownObjectFields(
    value,
    ['$schema', 'version', 'env', 'integrations', 'plugins'],
    `legacy lock ${filePath}`
  )
  const root = value as Record<string, unknown>
  assertLegacyEntryMap(root.integrations, 'integration', filePath)
  assertLegacyEntryMap(root.plugins, 'plugin', filePath)
  const state = dependencyStateSchema.parse(value)
  if (state.env !== env) {
    throw migrationError(`Legacy dependency lock at ${filePath} belongs to ${state.env}, expected ${env}.`)
  }
  return state
}

function assertLegacyEntryMap(value: unknown, kind: DependencyKind, filePath: string): void {
  if (value === undefined) return
  if (!isRecord(value)) {
    throw migrationError(`Legacy dependency lock at ${filePath} ${kind}s must be an object.`)
  }
  const allowed =
    kind === 'integration'
      ? ['name', 'version', 'enabled', 'config', 'configurationType', 'missingFields', 'authorizationPending']
      : ['name', 'version', 'enabled', 'config', 'dependencies', 'missingFields']
  for (const [alias, entry] of Object.entries(value)) {
    assertKnownObjectFields(entry, allowed, `legacy lock ${filePath} ${kind} '${alias}'`)
    if (kind !== 'plugin' || !isRecord(entry)) continue
    const dependencies = entry.dependencies
    if (dependencies === undefined) continue
    if (!isRecord(dependencies)) {
      throw migrationError(`Legacy dependency lock at ${filePath} plugin '${alias}' dependencies must be an object.`)
    }
    for (const [interfaceAlias, mapping] of Object.entries(dependencies)) {
      assertKnownObjectFields(
        mapping,
        ['integrationAlias'],
        `legacy lock ${filePath} plugin '${alias}' dependency '${interfaceAlias}'`
      )
    }
  }
}

function assertKnownObjectFields(value: unknown, allowed: string[], label: string): void {
  if (!isRecord(value)) throw migrationError(`${label} must be an object for lossless migration.`)
  const unknown = Object.keys(value).filter((field) => !allowed.includes(field))
  if (unknown.length > 0) {
    throw migrationError(`${label} contains unknown field(s) ${unknown.join(', ')}; refusing a lossy migration.`)
  }
}

async function readAgentConfigSource(
  projectPath: string,
  env: DependencySnapshotTarget['env']
): Promise<AgentConfigSource | null> {
  const filePath = path.join(projectPath, 'agent.config.ts')
  const raw = await readOptional(filePath)
  if (raw === null) return null
  const parsed = parseAgentConfigDependencies(raw, filePath, env)
  if (!parsed) return null
  return { kind: 'agentConfig', path: filePath, raw, digest: sha256Raw(raw), parsed }
}

function parseAgentConfigDependencies(
  raw: string,
  filePath: string,
  env: DependencySnapshotTarget['env']
): ParsedDependencies | null {
  let sourceFile: SourceFile
  try {
    const project = new Project({ useInMemoryFileSystem: true })
    sourceFile = project.createSourceFile('agent.config.ts', raw, { overwrite: true })
  } catch (error) {
    throw configLiteralError(filePath, `could not parse TypeScript: ${String(error)}`)
  }
  const syntaxDiagnostics = sourceFile
    .getPreEmitDiagnostics()
    .filter((diagnostic) => diagnostic.getCode() >= 1_000 && diagnostic.getCode() < 2_000)
  if (syntaxDiagnostics.length > 0) {
    throw configLiteralError(
      filePath,
      `TypeScript syntax diagnostics: ${syntaxDiagnostics.map((diagnostic) => diagnostic.getCode()).join(', ')}`
    )
  }

  const root = canonicalDefaultDefineConfigObject(sourceFile, filePath)
  if (!root) return null

  const rootFields = staticProperties(root, 'defineConfig object')
  const dependencies = rootFields.get('dependencies')
  if (!dependencies) return null
  const dependencyNode = dependencies.getInitializer()
  if (!dependencyNode?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    throw configLiteralError(filePath, 'dependencies must be a static object literal')
  }

  const parsed = emptyParsedDependencies(env)
  const dependencyFields = staticProperties(dependencyNode, 'dependencies')
  for (const field of dependencyFields.keys()) {
    if (field !== 'integrations' && field !== 'plugins') {
      throw configLiteralError(filePath, `dependencies.${field} is unsupported`)
    }
  }
  parseConfigDependencyKind(dependencyFields.get('integrations'), 'integration', parsed, filePath)
  parseConfigDependencyKind(dependencyFields.get('plugins'), 'plugin', parsed, filePath)
  return parsed
}

function canonicalDefaultDefineConfigObject(
  sourceFile: SourceFile,
  filePath: string
): ObjectLiteralExpression | null {
  const defaultExports = sourceFile.getExportAssignments().filter((assignment) => !assignment.isExportEquals())
  if (defaultExports.length === 0) return null
  if (defaultExports.length !== 1) {
    throw configLiteralError(filePath, 'the default export is ambiguous')
  }
  const expression = defaultExports[0]!.getExpression()
  if (
    !expression.isKind(SyntaxKind.CallExpression) ||
    expression.getArguments().length !== 1
  ) {
    throw configLiteralError(filePath, 'the default export must be exactly defineConfig({...})')
  }
  const callee = expression.getExpression()
  if (!callee.isKind(SyntaxKind.Identifier)) {
    throw configLiteralError(filePath, 'the default-export defineConfig callee must be an imported identifier')
  }
  const declarations = callee.getSymbol()?.getDeclarations() ?? []
  if (declarations.length !== 1 || !declarations[0]!.isKind(SyntaxKind.ImportSpecifier)) {
    throw configLiteralError(filePath, 'the default-export defineConfig binding is shadowed or is not an import')
  }
  const importSpecifier = declarations[0]
  const moduleName = importSpecifier.getImportDeclaration().getModuleSpecifierValue()
  if (
    importSpecifier.getNameNode().getText() !== 'defineConfig' ||
    moduleName !== '@holocronlab/botruntime-runtime' &&
      moduleName !== '@botpress/runtime'
  ) {
    throw configLiteralError(filePath, 'defineConfig must be a named import from an approved runtime module')
  }
  const root = expression.getArguments()[0]
  if (!root?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    throw configLiteralError(filePath, 'the default-export defineConfig argument must be a static object literal')
  }
  return root
}

function parseConfigDependencyKind(
  field: PropertyAssignment | undefined,
  kind: DependencyKind,
  parsed: ParsedDependencies,
  filePath: string
): void {
  if (!field) return
  const initializer = field.getInitializer()
  if (!initializer?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    throw configLiteralError(filePath, `dependencies.${kind}s must be a static object literal`)
  }
  const aliases = staticProperties(initializer, `dependencies.${kind}s`)
  for (const [alias, property] of [...aliases.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    if (!alias) throw configLiteralError(filePath, `${kind} alias must be non-empty`)
    const value = property.getInitializer()
    if (!value) throw configLiteralError(filePath, `${kind} '${alias}' has no value`)
    if (kind === 'integration') {
      const result = parseConfigIntegration(value, filePath, alias)
      parsed.state.integrations[alias] = result.entry
      parsed.integrationConstraints[alias] = result.constraints
    } else {
      const result = parseConfigPlugin(value, filePath, alias)
      parsed.state.plugins[alias] = result.entry
      parsed.pluginConstraints[alias] = result.constraints
    }
  }
}

function parseConfigIntegration(
  value: Expression,
  filePath: string,
  alias: string
): { entry: IntegrationDependencyEntry; constraints: EntryConstraints } {
  if (value.isKind(SyntaxKind.StringLiteral) || value.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    const { name, version } = splitDependencyRef(value.getLiteralText(), filePath, alias)
    return {
      entry: { name, version, enabled: false, config: {} },
      constraints: { name, version },
    }
  }
  if (!value.isKind(SyntaxKind.ObjectLiteralExpression)) {
    throw configLiteralError(filePath, `dependencies integration '${alias}' must use literal values`)
  }
  const fields = staticProperties(value, `integration '${alias}'`)
  assertAllowedFields(fields, ['version', 'enabled', 'config', 'configurationType'], filePath, alias)
  const ref = requiredStringField(fields, 'version', filePath, alias)
  const { name, version } = splitDependencyRef(ref, filePath, alias)
  const enabled = optionalBooleanField(fields, 'enabled', filePath, alias)
  const config = optionalObjectField(fields, 'config', filePath, alias)
  const configurationType = optionalStringField(fields, 'configurationType', filePath, alias)
  const entry: IntegrationDependencyEntry = {
    name,
    version,
    enabled: enabled ?? false,
    config: config ?? {},
    ...(configurationType !== undefined ? { configurationType } : {}),
  }
  return {
    entry,
    constraints: {
      name,
      version,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(config !== undefined ? { config } : {}),
      ...(configurationType !== undefined ? { configurationType } : {}),
    },
  }
}

function parseConfigPlugin(
  value: Expression,
  filePath: string,
  alias: string
): { entry: PluginDependencyEntry; constraints: EntryConstraints } {
  if (!value.isKind(SyntaxKind.ObjectLiteralExpression)) {
    throw configLiteralError(filePath, `dependencies plugin '${alias}' must be a static object literal`)
  }
  const fields = staticProperties(value, `plugin '${alias}'`)
  assertAllowedFields(fields, ['version', 'enabled', 'config', 'dependencies'], filePath, alias)
  const ref = requiredStringField(fields, 'version', filePath, alias)
  const { name, version } = splitDependencyRef(ref, filePath, alias)
  const enabled = optionalBooleanField(fields, 'enabled', filePath, alias)
  const config = optionalObjectField(fields, 'config', filePath, alias)
  const dependencies = optionalPluginDependencies(fields, filePath, alias)
  const entry: PluginDependencyEntry = {
    name,
    version,
    enabled: enabled ?? true,
    config: config ?? {},
    dependencies: dependencies ?? {},
  }
  return {
    entry,
    constraints: {
      name,
      version,
      ...(enabled !== undefined ? { enabled } : {}),
      ...(config !== undefined ? { config } : {}),
      ...(dependencies !== undefined ? { dependencies } : {}),
    },
  }
}

function staticProperties(node: ObjectLiteralExpression, label: string): Map<string, PropertyAssignment> {
  const result = new Map<string, PropertyAssignment>()
  for (const property of node.getProperties()) {
    if (!property.isKind(SyntaxKind.PropertyAssignment)) {
      throw migrationError(`${label} must contain only static property assignments; spreads and computed values are unsupported.`)
    }
    const name = staticPropertyName(property.getNameNode(), label)
    if (result.has(name)) throw migrationError(`${label} contains duplicate property '${name}'.`)
    result.set(name, property)
  }
  return result
}

function staticPropertyName(node: Node, label: string): string {
  let name: string
  if (node.isKind(SyntaxKind.Identifier)) name = node.getText()
  else if (node.isKind(SyntaxKind.StringLiteral)) name = node.getLiteralValue()
  else if (node.isKind(SyntaxKind.NumericLiteral)) name = String(node.getLiteralValue())
  else throw migrationError(`${label} contains a computed or unsupported property name.`)
  if (name === '__proto__') {
    throw migrationError(`${label} contains unsupported __proto__ syntax that cannot be migrated losslessly.`)
  }
  return name
}

function assertAllowedFields(
  fields: Map<string, PropertyAssignment>,
  allowed: string[],
  filePath: string,
  alias: string
): void {
  for (const field of fields.keys()) {
    if (!allowed.includes(field)) {
      throw configLiteralError(filePath, `dependency '${alias}' field '${field}' cannot be migrated losslessly`)
    }
  }
}

function requiredStringField(
  fields: Map<string, PropertyAssignment>,
  field: string,
  filePath: string,
  alias: string
): string {
  const value = optionalStringField(fields, field, filePath, alias)
  if (value === undefined) throw configLiteralError(filePath, `dependency '${alias}' requires literal ${field}`)
  return value
}

function optionalStringField(
  fields: Map<string, PropertyAssignment>,
  field: string,
  filePath: string,
  alias: string
): string | undefined {
  const property = fields.get(field)
  if (!property) return undefined
  const value = property.getInitializer()
  if (value?.isKind(SyntaxKind.StringLiteral) || value?.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return value.getLiteralText()
  }
  throw configLiteralError(filePath, `dependency '${alias}' ${field} must be a string literal`)
}

function optionalBooleanField(
  fields: Map<string, PropertyAssignment>,
  field: string,
  filePath: string,
  alias: string
): boolean | undefined {
  const property = fields.get(field)
  if (!property) return undefined
  const value = property.getInitializer()
  if (value?.isKind(SyntaxKind.TrueKeyword)) return true
  if (value?.isKind(SyntaxKind.FalseKeyword)) return false
  throw configLiteralError(filePath, `dependency '${alias}' ${field} must be a boolean literal`)
}

function optionalObjectField(
  fields: Map<string, PropertyAssignment>,
  field: string,
  filePath: string,
  alias: string
): Record<string, unknown> | undefined {
  const property = fields.get(field)
  if (!property) return undefined
  const value = property.getInitializer()
  if (!value?.isKind(SyntaxKind.ObjectLiteralExpression)) {
    throw configLiteralError(filePath, `dependency '${alias}' ${field} must be an object literal`)
  }
  return literalObject(value, `${alias}.${field}`, filePath)
}

function optionalPluginDependencies(
  fields: Map<string, PropertyAssignment>,
  filePath: string,
  alias: string
): Record<string, { integrationAlias: string }> | undefined {
  const raw = optionalObjectField(fields, 'dependencies', filePath, alias)
  if (raw === undefined) return undefined
  const result: Record<string, { integrationAlias: string }> = {}
  for (const [interfaceAlias, value] of Object.entries(raw)) {
    if (!isRecord(value) || Object.keys(value).some((key) => key !== 'integrationAlias')) {
      throw configLiteralError(filePath, `plugin '${alias}' dependency '${interfaceAlias}' is unsupported`)
    }
    if (typeof value.integrationAlias !== 'string' || !value.integrationAlias) {
      throw configLiteralError(filePath, `plugin '${alias}' dependency '${interfaceAlias}' needs a literal integrationAlias`)
    }
    result[interfaceAlias] = { integrationAlias: value.integrationAlias }
  }
  return result
}

function literalObject(node: ObjectLiteralExpression, label: string, filePath: string): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [name, property] of staticProperties(node, label)) {
    const value = property.getInitializer()
    if (!value) throw configLiteralError(filePath, `${label}.${name} has no literal value`)
    result[name] = literalValue(value, `${label}.${name}`, filePath)
  }
  return result
}

function literalValue(node: Expression, label: string, filePath: string): unknown {
  if (node.isKind(SyntaxKind.StringLiteral) || node.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    return node.getLiteralText()
  }
  if (node.isKind(SyntaxKind.NumericLiteral)) return jsonNumber(node.getLiteralValue(), label, filePath)
  if (node.isKind(SyntaxKind.TrueKeyword)) return true
  if (node.isKind(SyntaxKind.FalseKeyword)) return false
  if (node.isKind(SyntaxKind.NullKeyword)) return null
  if (node.isKind(SyntaxKind.ObjectLiteralExpression)) return literalObject(node, label, filePath)
  if (node.isKind(SyntaxKind.ArrayLiteralExpression)) {
    return node.getElements().map((element, index) => {
      if (!Node.isExpression(element)) {
        throw configLiteralError(filePath, `${label}[${index}] is not a literal expression`)
      }
      return literalValue(element, `${label}[${index}]`, filePath)
    })
  }
  if (node.isKind(SyntaxKind.PrefixUnaryExpression)) {
    const operand = node.getOperand()
    const operator = node.getOperatorToken()
    if (operand.isKind(SyntaxKind.NumericLiteral) && (operator === SyntaxKind.MinusToken || operator === SyntaxKind.PlusToken)) {
      const value = operand.getLiteralValue()
      return jsonNumber(operator === SyntaxKind.MinusToken ? -value : value, label, filePath)
    }
  }
  throw configLiteralError(filePath, `${label} must be a static JSON-compatible literal`)
}

function jsonNumber(value: number, label: string, filePath: string): number {
  if (!Number.isFinite(value)) {
    throw configLiteralError(filePath, `${label} must be a finite JSON-compatible number`)
  }
  return value
}

function splitDependencyRef(ref: string, filePath: string, alias: string): { name: string; version: string } {
  const separator = ref.lastIndexOf('@')
  if (separator <= 0 || separator === ref.length - 1) {
    throw configLiteralError(filePath, `dependency '${alias}' version '${ref}' must be name@version`)
  }
  return { name: ref.slice(0, separator), version: ref.slice(separator + 1) }
}

function emptyParsedDependencies(env: DependencySnapshotTarget['env']): ParsedDependencies {
  return {
    state: { version: 1, env, integrations: {}, plugins: {} },
    integrationConstraints: {},
    pluginConstraints: {},
  }
}

function parsedFromState(state: DependencyStateData, constrainAll: boolean): ParsedDependencies {
  const result = emptyParsedDependencies(state.env)
  result.state = dependencyStateSchema.parse(JSON.parse(JSON.stringify(state)))
  for (const [alias, entry] of Object.entries(result.state.integrations)) {
    result.integrationConstraints[alias] = {
      name: entry.name,
      version: entry.version,
      ...(constrainAll ? { enabled: entry.enabled, config: entry.config } : {}),
      ...(entry.configurationType !== undefined ? { configurationType: entry.configurationType } : {}),
    }
  }
  for (const [alias, entry] of Object.entries(result.state.plugins)) {
    result.pluginConstraints[alias] = {
      name: entry.name,
      version: entry.version,
      ...(constrainAll ? { enabled: entry.enabled, config: entry.config, dependencies: entry.dependencies } : {}),
    }
  }
  return result
}

function mergeParsedDependencies(target: ParsedDependencies, source: ParsedDependencies, sourceKind: SourceKind): void {
  for (const [alias, entry] of Object.entries(source.state.integrations)) {
    if (target.state.plugins[alias]) throw migrationConflict(alias, 'integration', 'plugin')
    const existing = target.state.integrations[alias]
    const constraints = source.integrationConstraints[alias]!
    if (!existing) {
      target.state.integrations[alias] = clone(entry)
      target.integrationConstraints[alias] = clone(constraints)
      continue
    }
    const existingConstraints = target.integrationConstraints[alias]!
    assertConstraintsCompatible(alias, existing, existingConstraints, entry, constraints, sourceKind)
    const mergedConstraints = mergeConstraints(existingConstraints, constraints)
    const materialized = sourceKind === 'lock' ? clone(entry) : existing
    target.state.integrations[alias] = materializeConstraints(materialized, mergedConstraints)
    target.integrationConstraints[alias] = mergedConstraints
  }

  for (const [alias, entry] of Object.entries(source.state.plugins)) {
    if (target.state.integrations[alias]) throw migrationConflict(alias, 'plugin', 'integration')
    const existing = target.state.plugins[alias]
    const constraints = source.pluginConstraints[alias]!
    if (!existing) {
      target.state.plugins[alias] = clone(entry)
      target.pluginConstraints[alias] = clone(constraints)
      continue
    }
    const existingConstraints = target.pluginConstraints[alias]!
    assertConstraintsCompatible(alias, existing, existingConstraints, entry, constraints, sourceKind)
    const mergedConstraints = mergeConstraints(existingConstraints, constraints)
    const materialized = sourceKind === 'lock' ? clone(entry) : existing
    target.state.plugins[alias] = materializeConstraints(materialized, mergedConstraints)
    target.pluginConstraints[alias] = mergedConstraints
  }
}

function assertConstraintsCompatible<T extends IntegrationDependencyEntry | PluginDependencyEntry>(
  alias: string,
  _existing: T,
  existingConstraints: EntryConstraints,
  _incoming: T,
  incomingConstraints: EntryConstraints,
  sourceKind: SourceKind
): void {
  for (const [field, expected] of Object.entries(existingConstraints)) {
    if (field in incomingConstraints && !jsonEqual(incomingConstraints[field as keyof EntryConstraints], expected)) {
      throw migrationError(`Dependency '${alias}' has a conflict between lock and agent.config sources (${field}, ${sourceKind}).`)
    }
  }
}

function mergeConstraints(left: EntryConstraints, right: EntryConstraints): EntryConstraints {
  return sortKeysDeep({ ...left, ...right })
}

function materializeConstraints<T extends IntegrationDependencyEntry | PluginDependencyEntry>(
  entry: T,
  constraints: EntryConstraints
): T {
  const materialized = clone(entry) as T & Record<string, unknown>
  for (const [field, value] of Object.entries(constraints)) materialized[field] = clone(value)
  return materialized
}

function migrationConflict(alias: string, left: string, right: string): DependencyError {
  return migrationError(`Dependency '${alias}' has a conflict: it is a ${left} in one source and a ${right} in another.`)
}

function assertPendingMatchesPlan(
  pending: DependencyMigrationPending,
  plan: MigrationPlan,
  target: DependencySnapshotTarget
): void {
  if (
    !jsonEqual(pending.target, target) ||
    !jsonEqual(pending.sources, plan.sourceRecords) ||
    pending.plan.digest !== plan.digest ||
    !jsonEqual(pending.plan.integrations, plan.progress.integrations) ||
    !jsonEqual(pending.plan.plugins, plan.progress.plugins)
  ) {
    throw migrationError(
      'Legacy migration source changed or is missing after the pending journal was created; source digest mismatch.'
    )
  }
}

function makePending(target: DependencySnapshotTarget, plan: MigrationPlan): DependencyMigrationPending {
  if (plan.sourceRecords.length === 0) {
    throw migrationError('Cannot create a legacy migration journal without an immutable source.')
  }
  const now = new Date().toISOString()
  return {
    version: 2,
    target,
    sources: plan.sourceRecords,
    plan: { digest: plan.digest, ...plan.progress },
    completed: { integrations: [], plugins: [] },
    createdAt: now,
    updatedAt: now,
  }
}

function checkpointPending(
  pending: DependencyMigrationPending,
  kind: 'integrations' | 'plugins',
  alias: string
): DependencyMigrationPending {
  return {
    ...pending,
    completed: {
      ...pending.completed,
      [kind]: [...pending.completed[kind], alias].sort(),
    },
    updatedAt: new Date().toISOString(),
  }
}

function reconcileNoJournalCloud(bot: CloudBot, plan: MigrationPlan): 'compatible' | 'empty-import' {
  const cloudIntegrations = recordOrThrow(bot.integrations, 'Cloud integrations')
  const cloudPlugins = recordOrThrow(bot.plugins, 'Cloud plugins')
  const plannedCount = plan.progress.integrations.length + plan.progress.plugins.length
  if (plannedCount === 0) return 'compatible'

  let present = 0
  for (const alias of plan.progress.integrations) {
    const row = cloudIntegrations[alias]
    if (row === undefined) continue
    present += 1
    assertCloudEntryCompatible('integration', alias, row, plan.integrationConstraints[alias]!)
  }
  for (const alias of plan.progress.plugins) {
    const row = cloudPlugins[alias]
    if (row === undefined) continue
    present += 1
    assertCloudEntryCompatible('plugin', alias, row, plan.pluginConstraints[alias]!)
  }

  const cloudCount = Object.keys(cloudIntegrations).length + Object.keys(cloudPlugins).length
  if (present === plannedCount) return 'compatible'
  if (present === 0 && cloudCount === 0) return 'empty-import'
  if (present > 0) {
    throw migrationError('Cloud contains a partial legacy dependency plan; migration cannot safely infer completed writes.')
  }
  throw migrationError('Cloud is non-empty but cannot prove the legacy plan as an exact semantic subset; state is ambiguous.')
}

function assertCompletedPendingAliases(
  bot: CloudBot,
  plan: MigrationPlan,
  pending: DependencyMigrationPending
): void {
  const cloudIntegrations = recordOrThrow(bot.integrations, 'Cloud integrations')
  const cloudPlugins = recordOrThrow(bot.plugins, 'Cloud plugins')
  for (const alias of pending.completed.integrations) {
    const row = cloudIntegrations[alias]
    if (row === undefined) {
      throw migrationError(`Pending completed integration '${alias}' is missing from initial authoritative Cloud state.`)
    }
    assertCloudEntryCompatible('integration', alias, row, fullConstraints(plan.state.integrations[alias]!))
  }
  for (const alias of pending.completed.plugins) {
    const row = cloudPlugins[alias]
    if (row === undefined) {
      throw migrationError(`Pending completed plugin '${alias}' is missing from initial authoritative Cloud state.`)
    }
    assertCloudEntryCompatible('plugin', alias, row, fullConstraints(plan.state.plugins[alias]!))
  }
}

function assertCloudContainsImportedPlan(bot: CloudBot, plan: MigrationPlan): void {
  const cloudIntegrations = recordOrThrow(bot.integrations, 'Cloud integrations')
  const cloudPlugins = recordOrThrow(bot.plugins, 'Cloud plugins')
  for (const alias of plan.progress.integrations) {
    const row = cloudIntegrations[alias]
    if (row === undefined) throw migrationError(`Post-import Cloud state is missing integration '${alias}'.`)
    assertCloudEntryCompatible('integration', alias, row, fullConstraints(plan.state.integrations[alias]!))
  }
  for (const alias of plan.progress.plugins) {
    const row = cloudPlugins[alias]
    if (row === undefined) throw migrationError(`Post-import Cloud state is missing plugin '${alias}'.`)
    assertCloudEntryCompatible('plugin', alias, row, fullConstraints(plan.state.plugins[alias]!))
  }
}

function fullConstraints(entry: IntegrationDependencyEntry | PluginDependencyEntry): EntryConstraints {
  return {
    name: entry.name,
    version: entry.version,
    enabled: entry.enabled,
    config: entry.config,
    ...('configurationType' in entry && entry.configurationType !== undefined
      ? { configurationType: entry.configurationType }
      : {}),
    ...('dependencies' in entry ? { dependencies: entry.dependencies } : {}),
  }
}

function assertCloudEntryCompatible(
  kind: DependencyKind,
  alias: string,
  value: unknown,
  constraints: EntryConstraints
): void {
  if (!isRecord(value)) throw migrationError(`Cloud ${kind} '${alias}' is invalid or conflicting.`)
  const normalized: Record<string, unknown> = {
    name: value.name,
    version: value.version,
    enabled: value.enabled,
    config: isRecord(value.configuration) ? value.configuration : {},
    ...(typeof value.configurationType === 'string' ? { configurationType: value.configurationType } : {}),
  }
  if (kind === 'plugin') {
    normalized.dependencies = cloudPluginDependencies(alias, value)
  }
  for (const [field, expected] of Object.entries(constraints)) {
    if (!jsonEqual(normalized[field], expected)) {
      throw migrationError(`Cloud ${kind} '${alias}' conflicts with the legacy plan at field '${field}'.`)
    }
  }
}

function assertDependencyReadinessAuthority(bot: CloudBot): void {
  assertNoPrototypeKeysDeep(bot.integrations, 'Cloud integrations')
  assertNoPrototypeKeysDeep(bot.plugins, 'Cloud plugins')
  const readiness = (bot as unknown as { devReadiness?: unknown }).devReadiness
  if (!isRecord(readiness) || readiness.schemaVersion !== 1) {
    throw migrationError('Cloud dependency readiness authority is missing or invalid; migration cannot safely continue.')
  }
  for (const kind of ['integrations', 'plugins'] as const) {
    const authority = readiness[kind]
    const expectedSource = kind === 'integrations' ? 'integration_installation' : 'bot_definition_plugins'
    if (!isRecord(authority) || authority.authority !== 'authoritative' || authority.source !== expectedSource) {
      throw migrationError(`Cloud ${kind} readiness authority is unknown; migration cannot safely continue.`)
    }
  }
}

function assertNoPrototypeKeysDeep(value: unknown, label: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPrototypeKeysDeep(item, `${label}[${index}]`))
    return
  }
  if (!isRecord(value)) return
  for (const key of Object.keys(value)) {
    if (key === '__proto__') {
      throw migrationError(`${label} contains an unsupported own __proto__ key; refusing a lossy migration.`)
    }
    assertNoPrototypeKeysDeep(value[key], `${label}.${key}`)
  }
}

function makeCompletionRecord(
  target: DependencySnapshotTarget,
  plan: MigrationPlan,
  runtimeBotId: string | undefined
): DependencyMigrationCompletionRecord {
  return {
    target,
    ...(target.env === 'dev' ? { runtimeBotId: runtimeBotId! } : {}),
    provenance:
      plan.sourceRecords.length > 0
        ? { kind: 'legacy', sources: plan.sourceRecords, planDigest: plan.digest }
        : { kind: 'cloud' },
    plan: plan.progress,
    completed: plan.progress,
    completedAt: new Date().toISOString(),
  }
}

function legacyStateAsSnapshot(
  state: DependencyStateData,
  target: DependencySnapshotTarget
): DependencySnapshotData {
  return {
    version: 2,
    env: target.env,
    target: { apiUrl: target.apiUrl, workspaceId: target.workspaceId, botId: target.botId },
    fetchedAt: new Date(0).toISOString(),
    integrations: clone(state.integrations),
    plugins: clone(state.plugins),
  }
}

function migrationPreviousSnapshot(
  plan: MigrationPlan,
  target: DependencySnapshotTarget,
  bot: CloudBot
): DependencySnapshotData {
  const previous = legacyStateAsSnapshot(plan.state, target)
  if (isRecord(bot.integrations)) {
    for (const [cloudAlias, value] of Object.entries(bot.integrations)) {
      if (!isRecord(value)) continue
      const row = value as Record<string, unknown>
      const existing = previous.integrations[cloudAlias]
      if (existing) {
        if (
          !Object.prototype.hasOwnProperty.call(plan.integrationConstraints[cloudAlias] ?? {}, 'config') &&
          isRecord(row.configuration)
        ) {
          existing.config = clone(row.configuration)
        }
        continue
      }
      if (
        typeof row.name !== 'string' ||
        typeof row.version !== 'string' ||
        typeof row.enabled !== 'boolean'
      ) {
        continue
      }
      previous.integrations[cloudAlias] = {
        name: row.name,
        version: row.version,
        enabled: row.enabled,
        config: isRecord(row.configuration) ? clone(row.configuration) : {},
        cloudAlias,
        ...(typeof row.id === 'string' ? { cloudId: row.id } : {}),
        ...(typeof row.configurationType === 'string'
          ? { configurationType: row.configurationType }
          : {}),
        ...(typeof row.configurationRevision === 'string'
          ? { configurationRevision: row.configurationRevision }
          : {}),
      }
    }
  }
  if (isRecord(bot.plugins)) {
    for (const [cloudAlias, value] of Object.entries(bot.plugins)) {
      if (!isRecord(value)) continue
      const existing = previous.plugins[cloudAlias]
      if (existing) {
        if (
          !Object.prototype.hasOwnProperty.call(plan.pluginConstraints[cloudAlias] ?? {}, 'config') &&
          isRecord(value.configuration)
        ) {
          existing.config = clone(value.configuration)
        }
        continue
      }
      if (typeof value.name !== 'string' || typeof value.version !== 'string') continue
      const dependencies = cloudPluginDependencies(cloudAlias, value)
      previous.plugins[cloudAlias] = {
        name: value.name,
        version: value.version,
        enabled: typeof value.enabled === 'boolean' ? value.enabled : true,
        config: isRecord(value.configuration) ? clone(value.configuration) : {},
        dependencies,
        cloudAlias,
        ...(typeof value.id === 'string' ? { cloudId: value.id } : {}),
      }
    }
  }
  return previous
}

function cloudPluginDependencies(
  pluginAlias: string,
  value: Record<string, unknown>
): Record<string, { integrationAlias: string }> {
  if (!isRecord(value.interfaces) || !isRecord(value.integrations)) {
    throw migrationError(
      `Cloud plugin '${pluginAlias}' must provide canonical interfaces and integrations dependency maps.`
    )
  }

  const dependencies: Record<string, { integrationAlias: string }> = Object.create(null)
  for (const [dependencyAlias, mapping] of Object.entries(value.interfaces)) {
    if (
      !isRecord(mapping) ||
      !jsonEqual(Object.keys(mapping).sort(), [
        'integrationAlias',
        'integrationId',
        'integrationInterfaceAlias',
      ]) ||
      typeof mapping.integrationAlias !== 'string' ||
      mapping.integrationAlias === '' ||
      typeof mapping.integrationId !== 'string' ||
      mapping.integrationId === '' ||
      typeof mapping.integrationInterfaceAlias !== 'string' ||
      mapping.integrationInterfaceAlias === ''
    ) {
      throw migrationError(
        `Cloud plugin '${pluginAlias}' interface dependency '${dependencyAlias}' is noncanonical.`
      )
    }
    dependencies[dependencyAlias] = { integrationAlias: mapping.integrationAlias }
  }

  for (const [dependencyAlias, mapping] of Object.entries(value.integrations)) {
    if (Object.prototype.hasOwnProperty.call(dependencies, dependencyAlias)) {
      throw migrationError(
        `Cloud plugin '${pluginAlias}' dependency '${dependencyAlias}' is duplicated across interfaces and integrations.`
      )
    }
    if (
      !isRecord(mapping) ||
      !jsonEqual(Object.keys(mapping).sort(), ['integrationAlias', 'integrationId']) ||
      typeof mapping.integrationAlias !== 'string' ||
      mapping.integrationAlias === '' ||
      typeof mapping.integrationId !== 'string' ||
      mapping.integrationId === ''
    ) {
      throw migrationError(
        `Cloud plugin '${pluginAlias}' direct integration dependency '${dependencyAlias}' is noncanonical.`
      )
    }
    dependencies[dependencyAlias] = { integrationAlias: mapping.integrationAlias }
  }
  return dependencies
}

async function cleanupCommittedSources(
  projectPath: string,
  marker: DependencyMigrationMarker,
  record: DependencyMigrationCompletionRecord,
  authority: DependencyMigrationAuthority
): Promise<void> {
  if (record.provenance.kind !== 'legacy') return
  if (authority.source === 'agentLocalBot' || authority.source === 'explicit') return
  const lock = record.provenance.sources.find((source) => source.kind === 'lock')
  if (lock) await deleteFileWithDigest(path.join(projectPath, `dependencies.${record.target.env}.lock.json`), lock.digest)

  const config = await sharedConfigCleanupDigest(projectPath, marker)
  if (config) await removeConfigDependenciesWithDigest(projectPath, config)
}

async function sharedConfigCleanupDigest(
  projectPath: string,
  marker: DependencyMigrationMarker
): Promise<string | null> {
  const dev = marker.records.dev
  const prod = marker.records.prod
  if (!dev || !prod || dev.provenance.kind !== 'legacy' || prod.provenance.kind !== 'legacy') return null
  if (dev.target.apiUrl !== prod.target.apiUrl || dev.target.workspaceId !== prod.target.workspaceId) return null
  if (!(await currentRawLinksMatchMarker(projectPath, prod, dev))) return null
  const devDigest = dev.provenance.sources.find((source) => source.kind === 'agentConfig')?.digest
  const prodDigest = prod.provenance.sources.find((source) => source.kind === 'agentConfig')?.digest
  return devDigest && devDigest === prodDigest ? devDigest : null
}

async function currentRawLinksMatchMarker(
  projectPath: string,
  prod: DependencyMigrationCompletionRecord,
  dev: DependencyMigrationCompletionRecord
): Promise<boolean> {
  try {
    const [prodRaw, devRaw] = await Promise.all([
      readOptional(path.join(projectPath, 'agent.json')),
      readOptional(path.join(projectPath, 'agent.local.json')),
    ])
    if (prodRaw === null || devRaw === null) return false

    const prodLink: unknown = JSON.parse(prodRaw)
    const devLink: unknown = JSON.parse(devRaw)
    if (!isRecord(prodLink) || !isRecord(devLink)) return false

    return (
      prodLink.apiUrl === prod.target.apiUrl &&
      prodLink.workspaceId === prod.target.workspaceId &&
      prodLink.botId === prod.target.botId &&
      devLink.devTargetBotId === dev.target.botId &&
      devLink.devApiUrl === dev.target.apiUrl &&
      devLink.devWorkspaceId === dev.target.workspaceId &&
      typeof dev.runtimeBotId === 'string' &&
      dev.runtimeBotId.length > 0 &&
      devLink.devId === dev.runtimeBotId
    )
  } catch {
    // Shared agent.config is destructive cleanup. If either raw link cannot be
    // read or parsed at cleanup time, current authority cannot be proven.
    return false
  }
}

async function deleteFileWithDigest(filePath: string, expectedDigest: string): Promise<void> {
  const raw = await readOptional(filePath)
  if (raw === null || sha256Raw(raw) !== expectedDigest) return
  await fs.unlink(filePath)
}

async function removeConfigDependenciesWithDigest(projectPath: string, expectedDigest: string): Promise<void> {
  const filePath = path.join(projectPath, 'agent.config.ts')
  let stat: Awaited<ReturnType<typeof fs.stat>>
  let raw: string
  try {
    ;[stat, raw] = await Promise.all([fs.stat(filePath), fs.readFile(filePath, 'utf8')])
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (sha256Raw(raw) !== expectedDigest) return

  const project = new Project({ useInMemoryFileSystem: true })
  const sourceFile = project.createSourceFile('agent.config.ts', raw, { overwrite: true })
  const root = canonicalDefaultDefineConfigObject(sourceFile, filePath)
  if (!root) throw configLiteralError(filePath, 'cannot find canonical default-export defineConfig for cleanup')
  const properties = staticProperties(root, 'defineConfig object')
  const dependencies = properties.get('dependencies')
  if (!dependencies) return
  dependencies.remove()
  const nextRaw = sourceFile.getFullText()

  const currentRaw = await fs.readFile(filePath, 'utf8')
  if (sha256Raw(currentRaw) !== expectedDigest) return
  await writeAtomicText(filePath, nextRaw, stat.mode & 0o777)
}

async function writeAtomicText(filePath: string, value: string, mode: number): Promise<void> {
  const dirPath = path.dirname(filePath)
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}-${crypto.randomUUID()}`
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(tmp, 'wx', mode)
    await handle.chmod(mode)
    await handle.writeFile(value, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await fs.rename(tmp, filePath)
    await syncDirectoryBestEffort(dirPath)
  } catch (error) {
    await handle?.close().catch(() => {})
    await fs.unlink(tmp).catch(() => {})
    throw error
  }
}

function recordLegacySources(result: MigrationResult, plan: MigrationPlan): void {
  for (const source of plan.sources) {
    if (!result.legacySources?.includes(source.kind)) result.legacySources?.push(source.kind)
  }
}

function recordOrThrow(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw migrationError(`${label} must be an object.`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sha256Raw(raw: string): string {
  return `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`
}

function sha256Canonical(value: unknown): string {
  return sha256Raw(JSON.stringify(sortKeysDeep(value)))
}

async function readOptional(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

async function syncDirectoryBestEffort(dirPath: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(dirPath, 'r')
    await handle.sync()
  } catch {
    // The file itself was fsynced; some filesystems do not support directory fsync.
  } finally {
    await handle?.close().catch(() => {})
  }
}

function configLiteralError(filePath: string, detail: string): DependencyError {
  return migrationError(`agent.config.ts dependencies must be literal and lossless (${filePath}): ${detail}.`)
}

function migrationError(message: string): DependencyError {
  return new DependencyError({ code: 'INVALID_CONFIG', message })
}
