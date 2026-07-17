import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
// Type-only: erased at runtime (bun/tsc strip it), so the ADK library is still
// loaded lazily — this import adds ZERO runtime cost and just recovers the exact
// type of the dynamically-imported `generateBotProject` (see generateAgentBot).
import type * as adkLib from '@holocronlab/botruntime-adk'
import type * as adkDependenciesLib from '@holocronlab/botruntime-adk/dependencies'
import { cloudInfo } from './cloud-io'
import * as errors from './errors'
import { assertAdkCompatibility } from './adk-compatibility'
import { CLI_VERSION } from './cli-version'

// brt deploy --adk — build path for ADK "agent" projects (manifest:
// agent.config.ts). Ф1: brt is now the SINGLE binary. It no longer shells out
// to an external `adk`/`bp` build binary; instead it calls the
// @holocronlab/botruntime-adk LIBRARY in-process to generate the synthetic
// classic bot at <dir>/.adk/bot, then builds THAT with brt's own native
// esbuild pipeline (see deploy-command.ts _buildAdkBundle -> BuildCommand),
// and finally normalizes the produced classic-bot bundle to a deterministic
// .brt/dist/index.cjs.
//
// REBRAND RULE: the generator's build dirs (.adk/, .botpress/) are produced by
// the library — brt reads them, it does not rename them.

export const ADK_BUNDLE_REL_PATH = path.join('.brt', 'dist', 'index.cjs')

export interface BundleTarget {
  apiUrl: string
  workspaceId: string
  botId: string
}

export interface BundleProvenance extends BundleTarget {
  schemaVersion: 1
  sha256: string
}

export interface LoadedBundle {
  path: string
  code: string
  sha256: string
}

export interface VerifiedBundle {
  code: string
  sha256: string
  provenance: BundleProvenance
}

const BUNDLE_PROVENANCE_KEYS = ['schemaVersion', 'apiUrl', 'workspaceId', 'botId', 'sha256'] as const

// The agent-project manifest. Its presence is how brt recognizes an ADK
// "agent" project (as opposed to a Botpress-shaped bot/integration/plugin,
// which are keyed by their own *.definition.ts).
export const AGENT_CONFIG_FILE = 'agent.config.ts'

// Where the library generates the synthetic classic bot.
export const AGENT_BOT_REL_PATH = path.join('.adk', 'bot')

type WorkflowScheduleProject = {
  workflows: Array<{
    definition: {
      name: string
      schedule?: string
      input?: { required?: string[]; type?: unknown }
    }
  }>
}

export interface RecurringEventManifestEntry {
  type: 'workflowSchedule'
  schedule: { cron: string }
  payload: { workflow: string }
}

export type RecurringEventsManifest = Record<string, RecurringEventManifestEntry>

export function buildRecurringEventsManifest(project: WorkflowScheduleProject): RecurringEventsManifest {
  const manifest: RecurringEventsManifest = {}
  for (const { definition } of project.workflows) {
    if (!definition.schedule) continue
    const required = definition.input?.required ?? []
    if (required.length > 0) {
      throw new errors.BotpressCLIError(
        `Scheduled workflow "${definition.name}" receives input {} but its input schema requires: ${required.join(', ')}`
      )
    }
    const eventName = `${definition.name}Schedule`.replaceAll(/[^a-zA-Z0-9]/g, '').toLowerCase()
    manifest[eventName] = {
      type: 'workflowSchedule',
      schedule: { cron: definition.schedule },
      payload: { workflow: definition.name },
    }
  }
  return manifest
}

export async function loadAgentRecurringEvents(dir: string): Promise<RecurringEventsManifest> {
  const { AgentProject } = await loadAdkProjectTools()
  const project = await AgentProject.load(dir, { offline: true, noCache: true })
  return buildRecurringEventsManifest(project)
}

// Where brt's native build drops the generated bot's single-file CJS bundle,
// most-specific first. .adk/bot/.botpress/dist/index.cjs is what BuildCommand
// produces for the generated classic bot; the flatter candidates cover a
// prebuilt bundle handed to brt directly.
const BUNDLE_CANDIDATES = [
  path.join('.adk', 'bot', '.botpress', 'dist', 'index.cjs'),
  path.join('.botpress', 'dist', 'index.cjs'),
  path.join('dist', 'index.cjs'),
]

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

// TODO(Ф1 follow-up): expose a `brt check`/typegen path for agent projects that
// calls generateLocalTypes({ projectPath }) from @holocronlab/botruntime-adk to
// emit the .adk/*.d.ts intellisense stubs WITHOUT a full generate+build. Left as
// a TODO to avoid adding a new command surface in this change; generateBotProject
// (the build path below) already emits those types as a side effect, so nothing
// is broken by deferring it.

// Presence of agent.config.ts marks an ADK agent project.
export function isAgentProject(dir: string): boolean {
  return fs.existsSync(path.join(dir, AGENT_CONFIG_FILE))
}

export function isAgentSourceChange(
  dir: string,
  changedPath: string,
  opts: { dependencyEnv: 'dev' | 'prod' }
): boolean {
  const rel = path.relative(dir, changedPath)
  if (rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return false

  const segments = rel.split(path.sep)
  if (segments.length === 1) {
    return (
      rel === AGENT_CONFIG_FILE ||
      rel === 'package.json' ||
      rel === 'agent.json' ||
      rel === 'bun.lock' ||
      rel === 'bun.lockb' ||
      rel === 'package-lock.json' ||
      rel === 'pnpm-lock.yaml' ||
      rel === 'yarn.lock'
    )
  }

  if (segments[0] === 'src') return true

  return (
    segments.length === 3 &&
    segments[0] === '.adk' &&
    segments[1] === 'dependencies' &&
    segments[2] === `${opts.dependencyEnv}.json`
  )
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortJsonKeys(nested)])
  )
}

export function agentDependencySnapshotBuildFingerprint(dir: string, env: 'dev' | 'prod'): string {
  const snapshotPath = path.join(dir, '.adk', 'dependencies', `${env}.json`)
  let raw: string
  try {
    raw = fs.readFileSync(snapshotPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'missing'
    throw error
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const { fetchedAt: _fetchedAt, botUpdatedAt: _botUpdatedAt, ...buildInput } = parsed
    return sha256(JSON.stringify(sortJsonKeys(buildInput)))
  } catch {
    return `invalid:${sha256(raw)}`
  }
}

// generateAgentBot calls the @holocronlab/botruntime-adk library IN-PROCESS to
// generate the synthetic classic bot at <dir>/.adk/bot (bot.definition.ts +
// shims targeting @holocronlab/botruntime-sdk). This is exactly what the
// former upstream toolchain did before it shelled to a second CLI — except here it is
// a plain function call, NOT a child process. Returns the generated bot path.
// A DependencyInstaller vendors one integration/plugin/interface resource into
// the generated bot's bp_modules. brt supplies one that drives its native
// AddCommand IN-PROCESS (see deploy-command._buildAdkBundle), so the whole
// agent build path is free of any child-process spawn. Structurally identical
// to @holocronlab/botruntime-adk's exported `DependencyInstaller` type; declared
// locally to keep this module's ADK import lazy (type-only would still be erased,
// but an explicit local type documents the contract at the call boundary).
export type DependencyInstaller = (args: {
  resource: string
  botPath: string
  workspaceId: string
  credentials: { token: string; apiUrl: string }
}) => Promise<void>

export type AgentBotGenerationOptions = {
  adkCommand: 'adk-dev' | 'adk-build' | 'adk-deploy'
  configTarget:
    | {
        environment: 'dev'
        botId?: string
        runtimeBotId?: string
        credentials?: { token: string; apiUrl: string; workspaceId: string }
      }
    | {
        environment: 'prod'
        botId: string
        credentials: { token: string; apiUrl: string; workspaceId: string }
      }
  quiet?: boolean
}

// loadAdkModule lazy-imports @holocronlab/botruntime-adk. The ADK library
// drags in a heavy dependency graph (runtime, otel, …) — load it only when an
// agent build/table-sync actually runs, so plain brt commands — and the
// pure-function unit tests in this module — never pay for it. This is a
// deferred load of a load-bearing dep, NOT an optional fallback.
//
// Resolve the entry with Bun's NATIVE resolver, anchored to this module's dir.
// Under a `bun install -g` the sibling lives at ~/.bun/install/global/
// node_modules, which Node's CJS resolution — what a bare dynamic import() AND
// createRequire().resolve() both use — does NOT search, so both fail to find
// the (installed, runtime-complete) sibling. Bun.resolveSync knows the
// bun-global layout and returns the absolute dist entry, which import() then
// loads. brt only ever runs under bun (bin = src/cli.ts, `#!/usr/bin/env
// bun`), so there is no non-bun path to fall back to — if `Bun` is ever
// absent this throws loudly, which is the correct signal for an unsupported
// runtime. Typed locally because brt's tsconfig uses node types, not bun-types.
// Bun caches import() by resolved path, so repeat calls (e.g. one from
// generateAgentBot, one from the table-sync step) return the SAME module
// instance — load-once, and critically the SAME AgentProject class (its
// static project cache is keyed per-class, not per-import-site).
async function loadAdkModule(): Promise<typeof adkLib> {
  const bun = (globalThis as unknown as { Bun: { resolveSync(id: string, parent: string): string } }).Bun
  const adkEntry = bun.resolveSync('@holocronlab/botruntime-adk', (import.meta as unknown as { dir: string }).dir)
  const loaded = (await import(adkEntry)) as typeof adkLib
  assertAdkCompatibility(CLI_VERSION, loaded.BRT_COMPATIBILITY_RANGE)
  return loaded
}

// loadAdkTableManager exposes just the two ADK exports the table-sync step
// needs: AgentProject (to load the already-parsed project.tables) and
// TableManager (the sync engine itself).
export async function loadAdkTableManager(): Promise<{
  AgentProject: {
    load(
      projectPath: string,
      options: {
        adkCommand: 'adk-build'
        configTarget: AgentBotGenerationOptions['configTarget']
      }
    ): ReturnType<typeof adkLib.AgentProject.load>
  }
  TableManager: typeof adkLib.TableManager
}> {
  const { AgentProject, TableManager } = await loadAdkModule()
  return { AgentProject, TableManager }
}

export async function loadAdkProjectTools(): Promise<{
  AgentProject: typeof adkLib.AgentProject
}> {
  const { AgentProject } = await loadAdkModule()
  return { AgentProject }
}

export async function loadAdkProjectInitializer(): Promise<{
  AgentProjectGenerator: typeof adkLib.AgentProjectGenerator
}> {
  const { AgentProjectGenerator } = await loadAdkModule()
  return { AgentProjectGenerator }
}

export async function loadAdkDependencyTools(): Promise<
  Pick<typeof adkDependenciesLib, 'DependencySnapshotStore' | 'reconcileDependencyReadiness'>
> {
  const { dependencies } = await loadAdkModule()
  return {
    DependencySnapshotStore: dependencies.DependencySnapshotStore,
    reconcileDependencyReadiness: dependencies.reconcileDependencyReadiness,
  }
}

// Stateful Cloud mutations must not assemble marker-check + snapshot-write in
// the CLI. The ADK library owns that transition and its migration mutex.
export async function loadAdkDependencyRefreshTools(): Promise<
  Pick<typeof adkDependenciesLib, 'refreshCompletedDependencySnapshot'>
> {
  const { dependencies } = await loadAdkModule()
  return {
    refreshCompletedDependencySnapshot: dependencies.refreshCompletedDependencySnapshot,
  }
}

// Kept separate from the readiness/snapshot loader so read-only surfaces such
// as `brt dev --check` cannot accidentally acquire a migration capability.
export async function loadAdkMigrationTools(): Promise<
  Pick<typeof adkDependenciesLib, 'migrateFromConfig'>
> {
  const { dependencies } = await loadAdkModule()
  return { migrateFromConfig: dependencies.migrateFromConfig }
}

export async function generateAgentBot(
  dir: string,
  installer: DependencyInstaller | undefined,
  opts: AgentBotGenerationOptions
): Promise<string> {
  if (!isAgentProject(dir)) {
    throw new errors.BotpressCLIError(`not an agent project: no ${AGENT_CONFIG_FILE} found in ${dir}`)
  }
  if (!opts.quiet) cloudInfo(`generate: @holocronlab/botruntime-adk -> ${AGENT_BOT_REL_PATH} (in ${dir})`)

  const { generateBotProject } = await loadAdkModule()
  // Passing `installer` makes the ADK dependency-sync vendor deps in-process
  // (no add-command child process). Without it, the ADK library falls back to its
  // standalone execa path — that only happens for non-brt callers.
  await generateBotProject({
    projectPath: dir,
    adkCommand: opts.adkCommand,
    configTarget: opts.configTarget,
    installer,
  }).catch((thrown) => {
    throw errors.BotpressCLIError.wrap(thrown, 'agent bot generation failed')
  })

  const botPath = path.join(dir, AGENT_BOT_REL_PATH)
  const botDefinition = path.join(botPath, 'bot.definition.ts')
  if (!fs.existsSync(botDefinition)) {
    throw new errors.BotpressCLIError(
      `agent bot generation produced no ${path.join(AGENT_BOT_REL_PATH, 'bot.definition.ts')} in ${dir}`
    )
  }
  return botPath
}

// normalizeBundle copies whatever single-file bundle brt's native build
// produced (under one of BUNDLE_CANDIDATES) to the deterministic
// .brt/dist/index.cjs, and returns that path.
export function normalizeBundle(dir: string, opts: { quiet?: boolean } = {}): string {
  const produced = BUNDLE_CANDIDATES.map((p) => path.join(dir, p)).find((p) => fs.existsSync(p))
  if (!produced) {
    throw new errors.BotpressCLIError(
      `build produced no bundle; looked for ${BUNDLE_CANDIDATES.join(', ')}. ` +
        'If the toolchain emits elsewhere, set BRT_BUNDLE_PATH.'
    )
  }

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.copyFileSync(produced, out)
  if (!opts.quiet) cloudInfo(`bundle -> ${ADK_BUNDLE_REL_PATH} (${fs.statSync(out).size} bytes)`)
  return out
}

// ensureBundle returns a FRESHLY built bundle path, always invoking `build`
// (the in-process generate + native-build orchestration owned by the caller).
// It deliberately does NOT reuse an existing .brt/dist/index.cjs: deploy must
// reflect the current sources, and reusing a stale artifact silently ships old
// code under a new version (a source-map-js fix only landed after the artifact
// was manually deleted). `brt deploy --adk --noBuild` (requireExistingBundle)
// is the explicit opt-out that reuses an existing bundle; BRT_BUNDLE_PATH still
// short-circuits to a prebuilt file for tests/CI.
export async function ensureBundle(build: () => Promise<string>): Promise<string> {
  const envOverride = bundlePathOverride()
  if (envOverride) return envOverride

  return build()
}

// requireExistingBundle backs `brt deploy --adk --noBuild`: the caller
// explicitly opted out of building, so a missing bundle is a loud failure,
// never a silent fall-through to a build the caller asked to skip.
export function requireExistingBundle(dir: string): string {
  const envOverride = bundlePathOverride()
  if (envOverride) return envOverride

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  if (!isRegularFile(out)) {
    throw new errors.BotpressCLIError(`--noBuild was set but no existing bundle was found at ${out}`)
  }
  return out
}

export function readBundlePathOverride(): LoadedBundle | undefined {
  const overridePath = bundlePathOverride()
  return overridePath ? readBundle(overridePath, 'BRT_BUNDLE_PATH') : undefined
}

export function invalidateBundleProvenance(bundlePath: string): void {
  const provenancePath = bundleProvenancePath(bundlePath)
  try {
    fs.rmSync(provenancePath, { force: true })
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `Could not invalidate stale bundle provenance at ${provenancePath}`)
  }
}

export function writeBundleProvenance(bundlePath: string, target: BundleTarget, code?: string): string {
  const canonicalTarget = canonicalBundleTarget(target)
  const bundle = code === undefined ? readBundle(bundlePath, 'ADK bundle') : { code, sha256: sha256(code) }
  const provenance: BundleProvenance = {
    schemaVersion: 1,
    apiUrl: canonicalTarget.apiUrl,
    workspaceId: canonicalTarget.workspaceId,
    botId: canonicalTarget.botId,
    sha256: bundle.sha256,
  }
  const provenancePath = bundleProvenancePath(bundlePath)
  const tmpPath = `${provenancePath}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  fs.mkdirSync(path.dirname(provenancePath), { recursive: true })
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(provenance, null, 2) + '\n', 'utf8')
    fs.renameSync(tmpPath, provenancePath)
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `Could not write bundle provenance at ${provenancePath}`)
  } finally {
    fs.rmSync(tmpPath, { force: true })
  }
  return provenancePath
}

export function validateBundleProvenance(bundlePath: string, target: BundleTarget): VerifiedBundle {
  const canonicalTarget = canonicalBundleTarget(target)
  const bundle = readBundle(bundlePath, 'ADK --noBuild bundle')
  const provenancePath = bundleProvenancePath(bundlePath)
  let value: unknown
  try {
    value = JSON.parse(fs.readFileSync(provenancePath, 'utf8'))
  } catch {
    throw invalidProvenance(provenancePath, 'is missing or is not valid JSON')
  }

  if (!isRecord(value)) {
    throw invalidProvenance(provenancePath, 'must be a JSON object')
  }
  const keys = Object.keys(value)
  if (keys.length !== BUNDLE_PROVENANCE_KEYS.length || !BUNDLE_PROVENANCE_KEYS.every((key) => keys.includes(key))) {
    throw invalidProvenance(provenancePath, 'must contain exactly schemaVersion, apiUrl, workspaceId, botId, sha256')
  }
  if (value['schemaVersion'] !== 1) {
    throw invalidProvenance(provenancePath, 'has an unsupported schemaVersion')
  }
  if (
    typeof value['apiUrl'] !== 'string' ||
    typeof value['workspaceId'] !== 'string' ||
    typeof value['botId'] !== 'string' ||
    typeof value['sha256'] !== 'string'
  ) {
    throw invalidProvenance(provenancePath, 'contains a field with the wrong type')
  }

  const provenance = value as unknown as BundleProvenance
  if (
    provenance.apiUrl.length === 0 ||
    provenance.apiUrl !== normalizeApiUrl(provenance.apiUrl) ||
    !isCanonicalId(provenance.workspaceId) ||
    !isCanonicalId(provenance.botId) ||
    !/^[0-9a-f]{64}$/.test(provenance.sha256)
  ) {
    throw invalidProvenance(provenancePath, 'contains a non-canonical field')
  }
  if (
    provenance.apiUrl !== canonicalTarget.apiUrl ||
    provenance.workspaceId !== canonicalTarget.workspaceId ||
    provenance.botId !== canonicalTarget.botId
  ) {
    throw invalidProvenance(provenancePath, 'does not match the selected deploy target')
  }
  if (provenance.sha256 !== bundle.sha256) {
    throw invalidProvenance(provenancePath, 'does not match the bundle SHA-256')
  }

  return { code: bundle.code, sha256: bundle.sha256, provenance }
}

function bundleProvenancePath(bundlePath: string): string {
  return `${bundlePath}.provenance.json`
}

function canonicalBundleTarget(target: BundleTarget): BundleTarget {
  const apiUrl = typeof target.apiUrl === 'string' ? normalizeApiUrl(target.apiUrl) : ''
  if (!apiUrl || !isCanonicalId(target.workspaceId) || !isCanonicalId(target.botId)) {
    throw new errors.BotpressCLIError('ADK bundle provenance requires a non-empty canonical apiUrl, workspaceId, and botId')
  }
  return { apiUrl, workspaceId: target.workspaceId, botId: target.botId }
}

function normalizeApiUrl(apiUrl: string): string {
  return apiUrl.replace(/\/+$/, '')
}

function isCanonicalId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value === value.trim()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidProvenance(provenancePath: string, reason: string): errors.BotpressCLIError {
  return new errors.BotpressCLIError(
    `Bundle provenance at ${provenancePath} ${reason}. Rebuild without --noBuild for this target, then retry.`
  )
}

function readBundle(bundlePath: string, label: string): LoadedBundle {
  if (!isRegularFile(bundlePath)) {
    throw new errors.BotpressCLIError(`${label} must point to a readable regular file: ${bundlePath}`)
  }
  try {
    const code = fs.readFileSync(bundlePath, 'utf8')
    return { path: bundlePath, code, sha256: sha256(code) }
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `${label} must point to a readable regular file: ${bundlePath}`)
  }
}

function isRegularFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile()
  } catch {
    return false
  }
}

function bundlePathOverride(): string | undefined {
  const env = process.env['BRT_BUNDLE_PATH']
  if (!env) return undefined
  if (!isRegularFile(env)) {
    throw new errors.BotpressCLIError(`BRT_BUNDLE_PATH must point to a readable regular file: ${env}`)
  }
  return env
}
