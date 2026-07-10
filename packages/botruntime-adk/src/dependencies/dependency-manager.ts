import type { Client } from '@holocronlab/botruntime-client'
import * as semver from 'semver'
import path from 'path'
import { jsonEqual } from './json-utils.js'
import { dependencyStateSchema } from './types.js'
import type {
  Environment,
  ResourceType,
  AddSpec,
  MutationResult,
  DependencySnapshotData,
  DependencyStateData,
  IntegrationDependencyEntry,
  IntegrationSnapshotEntry,
  PluginDependencyEntry,
  PluginSnapshotEntry,
  ConfigPatch,
  DiffResult,
  ApplyResult,
  ApplyAction,
  DependencySnapshotTarget,
} from './types.js'
import { DependencyError } from './errors.js'
import { integrationRequiresAuthorization } from './status.js'
import { extractMissingRequiredFields } from '@holocronlab/botruntime-runtime'
import { IntegrationResolver } from './resolvers/integration-resolver.js'
import { PluginResolver } from './resolvers/plugin-resolver.js'
import { IntegrationRegistry } from './registry/integration-registry.js'
import { PluginRegistry } from './registry/plugin-registry.js'
import {
  DependencySnapshotStore,
  dependencySnapshotFromBot,
  normalizeDependencySnapshotTarget,
} from './snapshot-store.js'
import { assertDevBotMatchesTarget } from '../integrations/config-utils.js'
import { readAgentInfo, readAgentLocalInfo } from '../agent-project/agent-resolver.js'

export interface ResourceEntry {
  type: ResourceType
  alias: string
  name: string
  version: string
  enabled: boolean
}

export interface DependencyManagerOptions {
  projectPath: string
  target: DependencySnapshotTarget
  client: Client
  runtimeBotId?: string
  integrationRegistry?: IntegrationRegistry
  pluginRegistry?: PluginRegistry
  integrationResolver?: IntegrationResolver
  pluginResolver?: PluginResolver
}

export interface CopyOptions {
  from: Environment
  to: Environment
  sourceTarget: DependencySnapshotTarget
  dryRun?: boolean
  yes?: boolean
}

export class DependencyManager {
  private readonly snapshotStore: DependencySnapshotStore
  private readonly env: Environment
  private readonly client: Client
  private readonly projectPath: string
  private readonly target: DependencySnapshotTarget
  private readonly botId: string
  private readonly runtimeBotId?: string
  private devTargetVerification?: Promise<void>
  private readonly integrationRegistry: IntegrationRegistry
  private readonly pluginRegistry: PluginRegistry
  private readonly integrationResolver: IntegrationResolver
  private readonly pluginResolver: PluginResolver

  constructor(opts: DependencyManagerOptions) {
    this.projectPath = opts.projectPath
    this.target = normalizeDependencySnapshotTarget(opts.target)
    this.env = this.target.env
    this.client = opts.client
    this.botId = this.target.botId
    this.runtimeBotId = opts.runtimeBotId
    this.snapshotStore = new DependencySnapshotStore({ projectPath: opts.projectPath })
    this.integrationRegistry = opts.integrationRegistry ?? new IntegrationRegistry()
    this.pluginRegistry = opts.pluginRegistry ?? new PluginRegistry()
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

  static async fromProject(opts: {
    projectPath: string
    env: Environment
    client: Client
    integrationRegistry?: IntegrationRegistry
    pluginRegistry?: PluginRegistry
    integrationResolver?: IntegrationResolver
    pluginResolver?: PluginResolver
    botId?: string
    apiUrl: string
    workspaceId: string
  }): Promise<DependencyManager> {
    const projectPath = path.resolve(opts.projectPath)
    const projectTarget = await DependencyManager.readProjectTarget(projectPath, opts.env)
    if (!projectTarget.botId) {
      throw new DependencyError({
        code: 'BOT_NOT_FOUND',
        message: `No ${opts.env} bot ID found in ${opts.projectPath}. Run 'brt link --bot-id <id> --key-stdin'.`,
      })
    }
    if (opts.botId !== undefined && opts.botId !== projectTarget.botId) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `The selected ${opts.env} bot ${opts.botId} does not match the environment-specific project link bot ${projectTarget.botId}.`,
      })
    }
    const botId = projectTarget.botId
    if (!projectTarget.apiUrl || !projectTarget.workspaceId) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `The ${opts.env} link must contain exact apiUrl and workspaceId authority.`,
      })
    }
    const target = normalizeDependencySnapshotTarget({
      env: opts.env,
      apiUrl: opts.apiUrl,
      workspaceId: opts.workspaceId,
      botId,
    })
    if (target.apiUrl !== projectTarget.apiUrl.replace(/\/+$/, '') || target.workspaceId !== projectTarget.workspaceId) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `The selected ${opts.env} apiUrl/workspaceId does not match the environment-specific project link.`,
      })
    }
    return new DependencyManager({
      projectPath,
      target,
      client: opts.client,
      runtimeBotId: opts.env === 'dev' ? projectTarget.runtimeBotId : undefined,
      integrationRegistry: opts.integrationRegistry,
      pluginRegistry: opts.pluginRegistry,
      integrationResolver: opts.integrationResolver,
      pluginResolver: opts.pluginResolver,
    })
  }

  private static async readProjectTarget(
    projectPath: string,
    env: Environment
  ): Promise<{ botId?: string; runtimeBotId?: string; apiUrl?: string; workspaceId?: string }> {
    if (env === 'prod') {
      const info = await readAgentInfo(projectPath)
      return { botId: info?.botId, apiUrl: info?.apiUrl, workspaceId: info?.workspaceId }
    }

    const localInfo = await readAgentLocalInfo(projectPath)
    return {
      botId: localInfo?.devTargetBotId,
      runtimeBotId: localInfo?.devId,
      apiUrl: localInfo?.devApiUrl,
      workspaceId: localInfo?.devWorkspaceId,
    }
  }

  private async getProjectTarget(
    env: Environment
  ): Promise<{ botId: string; runtimeBotId?: string; apiUrl: string; workspaceId: string }> {
    const target = await DependencyManager.readProjectTarget(this.projectPath, env)
    const botId = target.botId
    if (!botId) {
      throw new DependencyError({
        code: 'BOT_NOT_FOUND',
        message: `No ${env} bot ID found in ${this.projectPath}. Run 'brt link --bot-id <id> --key-stdin'.`,
      })
    }
    const runtimeBotId = env === 'dev' ? target.runtimeBotId : undefined
    if (env === 'dev' && !runtimeBotId) {
      throw new DependencyError({
        code: 'BOT_NOT_FOUND',
        message: `No dev runtime bot ID found in ${this.projectPath}. Run 'brt dev' to create the dev target.`,
      })
    }
    if (!target.apiUrl || !target.workspaceId) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `The ${env} project link must contain exact apiUrl and workspaceId authority.`,
      })
    }
    return {
      botId,
      ...(runtimeBotId ? { runtimeBotId } : {}),
      apiUrl: target.apiUrl.replace(/\/+$/, ''),
      workspaceId: target.workspaceId,
    }
  }

  private async ensureDevTargetVerified(): Promise<void> {
    if (this.env !== 'dev') return
    if (!this.runtimeBotId) {
      throw new DependencyError({
        code: 'BOT_NOT_FOUND',
        message: `No dev runtime bot ID found in ${this.projectPath}. Run 'brt dev' to create the dev target.`,
      })
    }
    this.devTargetVerification ??= this.client.getBot({ id: this.runtimeBotId }).then(({ bot }) => {
      assertDevBotMatchesTarget(bot, { botId: this.botId, runtimeBotId: this.runtimeBotId! })
    })
    await this.devTargetVerification
  }

  private async readTargetBot(): Promise<Awaited<ReturnType<Client['getBot']>>['bot']> {
    await this.ensureDevTargetVerified()
    const addressBotId = this.env === 'dev' ? this.runtimeBotId! : this.botId
    const { bot } = await this.client.getBot({ id: addressBotId })
    if (this.env === 'dev') {
      assertDevBotMatchesTarget(bot, { botId: this.botId, runtimeBotId: this.runtimeBotId! })
    }
    return bot
  }

  private async readSnapshot(): Promise<DependencySnapshotData> {
    return this.snapshotStore.readOrEmpty(this.target)
  }

  private async writeSnapshot(snapshot: DependencySnapshotData): Promise<void> {
    await this.ensureDevTargetVerified()
    await this.snapshotStore.write(this.target, {
      ...snapshot,
      env: this.target.env,
      target: { apiUrl: this.target.apiUrl, workspaceId: this.target.workspaceId, botId: this.target.botId },
      fetchedAt: new Date().toISOString(),
    })
  }

  private async readCloudSnapshot(previous?: DependencySnapshotData): Promise<DependencySnapshotData> {
    const bot = await this.readTargetBot()
    return dependencySnapshotFromBot({
      bot,
      target: this.target,
      fetchedAt: new Date(),
      previous,
    })
  }

  async snapshotStateFromCloud(): Promise<DependencyStateData> {
    const previous = await this.snapshotStore.read(this.target)
    const cloud = await this.readCloudSnapshot(previous ?? undefined)
    return dependencySnapshotToState(cloud)
  }

  async applyState(state: DependencyStateData, opts?: { dryRun?: boolean; yes?: boolean }): Promise<ApplyResult> {
    await this.ensureDevTargetVerified()
    const parsed = dependencyStateSchema.parse({
      ...state,
      env: this.env,
    })

    await this.writeSnapshot({
      version: 2,
      env: this.env,
      target: { apiUrl: this.target.apiUrl, workspaceId: this.target.workspaceId, botId: this.target.botId },
      fetchedAt: new Date().toISOString(),
      integrations: parsed.integrations,
      plugins: parsed.plugins,
    })

    const result = await this.apply(opts)
    if (!result.dryRun && result.applied.length === 0 && result.skipped.length === 0 && result.errors.length === 0) {
      await this.refreshSnapshotFromCloud()
    }
    return result
  }

  async list(type?: ResourceType): Promise<ResourceEntry[]> {
    // A missing exact-target snapshot is empty; an invalid or foreign snapshot
    // remains a hard error even for read-only status/list surfaces.
    const data = await this.readSnapshot()
    const out: ResourceEntry[] = []
    if (!type || type === 'integration') {
      for (const [alias, e] of Object.entries(data.integrations)) {
        out.push({ type: 'integration', alias, name: e.name, version: e.version, enabled: e.enabled })
      }
    }
    if (!type || type === 'plugin') {
      for (const [alias, e] of Object.entries(data.plugins)) {
        out.push({ type: 'plugin', alias, name: e.name, version: e.version, enabled: e.enabled })
      }
    }
    return out
  }

  async get(type: ResourceType, alias: string): Promise<ResourceEntry | undefined> {
    const all = await this.list(type)
    return all.find((e) => e.alias === alias)
  }

  // Poll until integration `name` has a live webhook; returns true once live, false on timeout.
  async waitForIntegrationWebhook(name: string, opts: { timeoutMs: number; intervalMs: number }): Promise<boolean> {
    await this.ensureDevTargetVerified()
    const deadline = Date.now() + opts.timeoutMs
    for (;;) {
      try {
        const { bot } = await this.client.getBot({ id: this.env === 'dev' ? this.runtimeBotId! : this.botId })
        if (this.env === 'dev') {
          assertDevBotMatchesTarget(bot, { botId: this.botId, runtimeBotId: this.runtimeBotId! })
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cloud bot integrations shape is wider than the client type
        const integrations = Object.values((bot.integrations ?? {}) as Record<string, any>)
        if (integrations.some((i) => i?.name === name && !!i?.webhookId)) {
          return true
        }
      } catch {
        // transient bot-read error — keep polling until the deadline
      }
      if (Date.now() >= deadline) {
        return false
      }
      await new Promise((resolve) => setTimeout(resolve, opts.intervalMs))
    }
  }

  async add(type: ResourceType, spec: AddSpec): Promise<MutationResult> {
    await this.ensureDevTargetVerified()
    if (type === 'interface') {
      throw new DependencyError({
        code: 'BUILTIN_INTERFACE_IMMUTABLE',
        message: 'Interfaces are built-in platform constants and cannot be added.',
      })
    }
    const alias = spec.alias ?? spec.name
    const version = spec.version ?? 'latest'
    const snapshot = await this.readSnapshot()

    if (type === 'integration' && snapshot.integrations[alias]) {
      const existing = snapshot.integrations[alias]!
      const versionMatch = version === 'latest' || existing.version === version
      if (existing.enabled && versionMatch && jsonEqual(existing.config, spec.config ?? {})) {
        return {
          ok: true,
          noop: true,
          resource: { type, alias, name: spec.name, version: existing.version },
        }
      }
    }
    if (type === 'plugin' && snapshot.plugins[alias]) {
      const existing = snapshot.plugins[alias]!
      const versionMatch = version === 'latest' || existing.version === version
      if (existing.enabled && versionMatch && jsonEqual(existing.config, spec.config ?? {})) {
        return {
          ok: true,
          noop: true,
          resource: { type, alias, name: spec.name, version: existing.version },
        }
      }
    }

    if (type === 'integration') {
      const desired: IntegrationDependencyEntry = {
        name: spec.name,
        version,
        enabled: true,
        config: spec.config ?? {},
      }
      let installedDisabled: { missingFields: string[] } | undefined
      let authorizationPending = false
      try {
        await this.integrationResolver.applyToCloud({ botId: this.botId, alias, entry: desired })
      } catch (err) {
        const missingFields = extractMissingRequiredFields(err)
        if (missingFields) {
          await this.integrationResolver.applyToCloud({
            botId: this.botId,
            alias,
            entry: { ...desired, enabled: false },
          })
          installedDisabled = { missingFields }
        } else if (await this.specRequiresAuthorization(spec.name, spec.version)) {
          // WS5/#7: an auth-gated (OAuth/connection) integration cannot register
          // until the user completes the connect flow — Cloud's `register` hook
          // hard-fails the enabled install (e.g. "No refresh token found …").
          // Classified by the SPEC (does it gate on an identifier?), not by error
          // wording. Install it disabled (the Integration Hub behavior) and persist
          // the pending-authorization verdict so every offline surface reports the
          // same `unconfigured` the codegen carrier bakes in.
          await this.integrationResolver.applyToCloud({
            botId: this.botId,
            alias,
            entry: { ...desired, enabled: false },
          })
          authorizationPending = true
        } else {
          throw err
        }
      }
      const refreshed = await this.refreshSnapshotFromCloud()
      // WS0: persist Cloud's install-time missing-field verdict on the (now disabled)
      // entry so the offline status resolver can explain *why* it is unconfigured —
      // including OAuth/identifier fields a client-side schema check can't enumerate.
      // Cloud refresh carries it forward across later refreshes while the entry
      // stays disabled with unchanged inputs (and drops it once that basis changes).
      if (installedDisabled || authorizationPending) {
        // `refreshSnapshotFromCloud` re-derives the snapshot alias from cloud,
        // which can differ from the alias we sent when the name is namespaced/unfriendly
        // and no explicit alias was given. Prefer the direct key; otherwise fall back to
        // the single newly-added disabled entry for this name (unambiguous — `add` installs
        // exactly one integration per call).
        const snapshotAlias = refreshed.integrations[alias]
          ? alias
          : Object.keys(refreshed.integrations).find(
              (k) =>
                !snapshot.integrations[k] &&
                !refreshed.integrations[k]!.enabled &&
                refreshed.integrations[k]!.name === spec.name
            )
        if (snapshotAlias && refreshed.integrations[snapshotAlias]) {
          refreshed.integrations[snapshotAlias] = {
            ...refreshed.integrations[snapshotAlias]!,
            ...(installedDisabled ? { missingFields: installedDisabled.missingFields } : {}),
            ...(authorizationPending ? { authorizationPending: true } : {}),
          }
          await this.writeSnapshot(refreshed)
        }
      }
      const resolvedVersion = refreshed.integrations[alias]?.version ?? version
      return {
        ok: true,
        resource: { type, alias, name: spec.name, version: resolvedVersion },
        installedDisabled,
        ...(authorizationPending ? { installedAwaitingAuthorization: true } : {}),
      }
    } else {
      const { dependencies: resolvedDeps, autoResolved } = await this.resolvePluginDependencies({
        pluginName: spec.name,
        pluginVersion: version,
        userDeps: spec.dependencies ?? {},
        state: snapshot,
      })
      const desired: PluginDependencyEntry = {
        name: spec.name,
        version,
        enabled: true,
        config: spec.config ?? {},
        dependencies: resolvedDeps,
      }
      // WS0/WS5, symmetric with the integration branch above: when Cloud rejects the
      // enable for missing required config, install disabled and persist the verdict
      // so offline readiness resolution and the deploy gate
      // can report `unconfigured` instead of trusting `enabled` blindly.
      let installedDisabled: { missingFields: string[] } | undefined
      try {
        await this.pluginResolver.applyToCloud({ botId: this.botId, alias, entry: desired, state: snapshot })
      } catch (err) {
        const missingFields = extractMissingRequiredFields(err)
        if (!missingFields) throw err
        await this.pluginResolver.applyToCloud({
          botId: this.botId,
          alias,
          entry: { ...desired, enabled: false },
          state: snapshot,
        })
        installedDisabled = { missingFields }
      }
      const refreshed = await this.refreshSnapshotFromCloud()
      if (installedDisabled) {
        // Same alias-fallback as the integration branch: `refreshSnapshotFromCloud`
        // re-derives the snapshot alias from cloud, which can differ from the one we sent.
        const snapshotAlias = refreshed.plugins[alias]
          ? alias
          : Object.keys(refreshed.plugins).find(
              (k) => !snapshot.plugins[k] && !refreshed.plugins[k]!.enabled && refreshed.plugins[k]!.name === spec.name
            )
        if (snapshotAlias && refreshed.plugins[snapshotAlias]) {
          refreshed.plugins[snapshotAlias] = {
            ...refreshed.plugins[snapshotAlias]!,
            missingFields: installedDisabled.missingFields,
          }
          await this.writeSnapshot(refreshed)
        }
      }
      const resolvedVersion = refreshed.plugins[alias]?.version ?? version
      return {
        ok: true,
        resource: { type, alias, name: spec.name, version: resolvedVersion },
        autoResolved,
        installedDisabled,
      }
    }
  }

  async remove(type: ResourceType, alias: string): Promise<MutationResult> {
    await this.ensureDevTargetVerified()
    if (type === 'interface') {
      throw new DependencyError({ code: 'BUILTIN_INTERFACE_IMMUTABLE', message: 'Interfaces cannot be removed.' })
    }
    const snapshot = await this.readSnapshot()
    const exists = type === 'integration' ? !!snapshot.integrations[alias] : !!snapshot.plugins[alias]
    if (!exists) return { ok: true, noop: true }

    if (type === 'integration') {
      await this.integrationResolver.removeFromCloud({ botId: this.botId, alias })
    } else {
      await this.pluginResolver.removeFromCloud({ botId: this.botId, alias })
    }
    await this.refreshSnapshotFromCloud()
    return { ok: true }
  }

  async upgrade(type: ResourceType, alias: string, version?: string): Promise<MutationResult> {
    await this.ensureDevTargetVerified()
    if (type === 'interface') {
      throw new DependencyError({ code: 'BUILTIN_INTERFACE_IMMUTABLE', message: 'Interfaces cannot be upgraded.' })
    }
    const snapshot = await this.readSnapshot()
    const existing = type === 'integration' ? snapshot.integrations[alias] : snapshot.plugins[alias]
    if (!existing) {
      throw new DependencyError({
        code: type === 'integration' ? 'INTEGRATION_NOT_FOUND' : 'PLUGIN_NOT_FOUND',
        message: `'${alias}' is not installed in ${this.env}`,
      })
    }
    const targetVersion = version ?? 'latest'
    if (existing.version === targetVersion) {
      return { ok: true, noop: true, resource: { type, alias, name: existing.name, version: existing.version } }
    }
    const next = { ...existing, version: targetVersion }
    await this.applyEntry(type, alias, next, snapshot)
    await this.refreshSnapshotFromCloud()
    return { ok: true, resource: { type, alias, name: existing.name, version: next.version } }
  }

  async enable(type: ResourceType, alias: string): Promise<MutationResult> {
    return this.toggleEnabled(type, alias, true)
  }

  async disable(type: ResourceType, alias: string): Promise<MutationResult> {
    return this.toggleEnabled(type, alias, false)
  }

  private async toggleEnabled(type: ResourceType, alias: string, enabled: boolean): Promise<MutationResult> {
    await this.ensureDevTargetVerified()
    if (type === 'interface') {
      throw new DependencyError({
        code: 'BUILTIN_INTERFACE_IMMUTABLE',
        message: 'Interfaces cannot be enabled/disabled.',
      })
    }
    const snapshot = await this.readSnapshot()
    const existing = type === 'integration' ? snapshot.integrations[alias] : snapshot.plugins[alias]
    if (!existing) {
      throw new DependencyError({
        code: type === 'integration' ? 'INTEGRATION_NOT_FOUND' : 'PLUGIN_NOT_FOUND',
        message: `'${alias}' is not installed in ${this.env}`,
      })
    }
    if (existing.enabled === enabled) return { ok: true, noop: true }
    await this.applyEntry(type, alias, { ...existing, enabled }, snapshot)
    const refreshedSnapshot = await this.refreshSnapshotFromCloud()
    const refreshedEntry =
      type === 'integration' ? refreshedSnapshot.integrations[alias] : refreshedSnapshot.plugins[alias]
    if (!refreshedEntry || refreshedEntry.enabled !== enabled) {
      throw new DependencyError({
        code: 'SNAPSHOT_DRIFT',
        message: `Cloud did not persist ${type} '${alias}' as ${enabled ? 'enabled' : 'disabled'}.`,
        details: {
          type,
          alias,
          expected: { enabled },
          actual: refreshedEntry ? { enabled: refreshedEntry.enabled } : null,
        },
      })
    }
    return { ok: true, resource: { type, alias, name: existing.name, version: existing.version } }
  }

  async configure(type: ResourceType, alias: string, patch: ConfigPatch): Promise<MutationResult> {
    await this.ensureDevTargetVerified()
    if (type === 'interface') {
      throw new DependencyError({ code: 'BUILTIN_INTERFACE_IMMUTABLE', message: 'Interfaces cannot be configured.' })
    }
    const snapshot = await this.readSnapshot()
    const existing = type === 'integration' ? snapshot.integrations[alias] : snapshot.plugins[alias]
    if (!existing) {
      throw new DependencyError({
        code: type === 'integration' ? 'INTEGRATION_NOT_FOUND' : 'PLUGIN_NOT_FOUND',
        message: `'${alias}' is not installed in ${this.env}`,
      })
    }
    const nextConfig = { ...existing.config, ...(patch.set ?? {}) }
    for (const key of patch.unset ?? []) delete nextConfig[key]
    const next: typeof existing = { ...existing, config: nextConfig }
    if (type === 'plugin' && patch.map && 'dependencies' in next) {
      ;(next as PluginDependencyEntry).dependencies = { ...(next as PluginDependencyEntry).dependencies, ...patch.map }
    }
    if (jsonEqual(next, existing)) {
      return { ok: true, noop: true, resource: { type, alias, name: existing.name, version: existing.version } }
    }
    await this.applyEntry(type, alias, next, snapshot)
    await this.refreshSnapshotFromCloud()
    return { ok: true, resource: { type, alias, name: existing.name, version: existing.version } }
  }

  private async applyEntry(
    type: ResourceType,
    alias: string,
    entry: IntegrationDependencyEntry | PluginDependencyEntry,
    state: Pick<DependencyStateData, 'integrations' | 'plugins'>
  ): Promise<void> {
    if (type === 'integration') {
      await this.integrationResolver.applyToCloud({
        botId: this.botId,
        alias,
        entry: entry as IntegrationDependencyEntry,
      })
    } else {
      await this.pluginResolver.applyToCloud({
        botId: this.botId,
        alias,
        entry: entry as PluginDependencyEntry,
        state,
      })
    }
  }

  /**
   * For each interface the plugin requires that is NOT in `userDeps`, scan
   * the current snapshot's installed integrations to find one that implements it.
   *
   * - Exactly one match → auto-resolve (no prompt needed).
   * - Multiple matches → throw AMBIGUOUS_DEPENDENCY (caller / CLI should prompt
   *   the user to pass --dep <iface>=<alias> and retry).
   * - No matches → throw MISSING_DEPENDENCY.
   */
  private async resolvePluginDependencies(opts: {
    pluginName: string
    pluginVersion: string
    userDeps: Record<string, { integrationAlias: string }>
    state: Pick<DependencyStateData, 'integrations' | 'plugins'>
  }): Promise<{
    dependencies: Record<string, { integrationAlias: string }>
    autoResolved: Array<{ pluginInterfaceAlias: string; integrationAlias: string }>
  }> {
    const pluginSpec = await this.pluginRegistry.getSpec(opts.pluginName, opts.pluginVersion)
    const requiredInterfaces: Record<string, { name: string }> =
      (pluginSpec as { dependencies?: { interfaces?: Record<string, { name: string }> } }).dependencies?.interfaces ??
      {}

    const resolved: Record<string, { integrationAlias: string }> = { ...opts.userDeps }
    const autoResolved: Array<{ pluginInterfaceAlias: string; integrationAlias: string }> = []

    for (const [pluginIfaceAlias, requirement] of Object.entries(requiredInterfaces)) {
      if (resolved[pluginIfaceAlias]) {
        // User explicitly provided this dep — skip auto-resolution.
        continue
      }

      // Find all installed integrations that implement the required interface.
      const candidates: Array<{ alias: string; integrationName: string }> = []
      for (const [integrationAlias, integrationEntry] of Object.entries(opts.state.integrations)) {
        let integrationSpec: { interfaces?: Record<string, { name: string }> }
        try {
          integrationSpec = await this.integrationRegistry.getSpec(integrationEntry.name, integrationEntry.version)
        } catch {
          // Skip this integration for auto-resolution. A transient
          // registry/network failure here silently makes the integration
          // invisible to auto-resolution, producing either a wrong auto-pick
          // or a misleading MISSING_DEPENDENCY downstream.
          // TODO(ADK-638): warn via the injected logger once adk has one —
          // include integration name@version, the interface being resolved,
          // and the fetch error.
          continue
        }
        const implements_ = Object.values(integrationSpec.interfaces ?? {}).some(
          (iface) => iface.name === requirement.name
        )
        if (implements_) {
          candidates.push({ alias: integrationAlias, integrationName: integrationEntry.name })
        }
      }

      if (candidates.length === 1) {
        const match = candidates[0]!
        resolved[pluginIfaceAlias] = { integrationAlias: match.alias }
        autoResolved.push({ pluginInterfaceAlias: pluginIfaceAlias, integrationAlias: match.alias })
      } else if (candidates.length > 1) {
        throw new DependencyError({
          code: 'AMBIGUOUS_DEPENDENCY',
          message: `Multiple installed integrations implement interface '${requirement.name}' required by plugin '${opts.pluginName}': ${candidates.map((c) => c.alias).join(', ')}. Pass --dep ${pluginIfaceAlias}=<alias> to disambiguate.`,
          details: {
            plugin: opts.pluginName,
            pluginInterfaceAlias: pluginIfaceAlias,
            interfaceName: requirement.name,
            candidates: candidates.map((c) => ({ alias: c.alias, name: c.integrationName })),
          },
          suggestion: `Pass --dep ${pluginIfaceAlias}=<alias> where <alias> is one of: ${candidates.map((c) => c.alias).join(', ')}`,
        })
      } else {
        const implementers = await this.findHubImplementersSafely(requirement.name)
        const suggestion = formatMissingDependencySuggestion({
          interfaceName: requirement.name,
          pluginInterfaceAlias: pluginIfaceAlias,
          implementers,
        })
        throw new DependencyError({
          code: 'MISSING_DEPENDENCY',
          message:
            `Plugin '${opts.pluginName}' requires interface '${requirement.name}', but no installed integration implements it.\n` +
            suggestion,
          details: {
            plugin: opts.pluginName,
            pluginInterfaceAlias: pluginIfaceAlias,
            interfaceName: requirement.name,
            implementers: implementers.map((i) => ({ name: i.name, version: i.version, title: i.title })),
          },
          suggestion,
        })
      }
    }

    return { dependencies: resolved, autoResolved }
  }

  /**
   * Best-effort lookup of hub integrations that implement a given interface.
   * Returns [] if the Cloud call fails — never throws (we don't want to mask
   * the real MISSING_DEPENDENCY error with a network error).
   */
  private async findHubImplementersSafely(
    interfaceName: string
  ): Promise<Array<{ name: string; version: string; title?: string }>> {
    try {
      const results = (await this.integrationRegistry.findImplementersOfInterface(interfaceName, 5)) as Array<{
        name: string
        version: string
        title?: string
      }>
      return results
    } catch {
      return []
    }
  }

  /**
   * Whether the integration's catalog spec gates on an OAuth/connection identifier.
   * Best-effort: an unreachable spec returns `false` so the caller falls back to
   * rethrowing the original error (we never *classify* on an unknown).
   */
  private async specRequiresAuthorization(name: string, version?: string): Promise<boolean> {
    try {
      const spec = await this.integrationRegistry.getSpec(name, version)
      return integrationRequiresAuthorization(spec as Parameters<typeof integrationRequiresAuthorization>[0])
    } catch {
      // Spec unreachable (offline / unauthenticated / not in catalog): unknown.
      return false
    }
  }

  private async refreshSnapshotFromCloud(): Promise<DependencySnapshotData> {
    await this.ensureDevTargetVerified()
    return this.snapshotStore.refreshFromCloud({
      client: this.client,
      target: this.target,
      runtimeBotId: this.env === 'dev' ? this.runtimeBotId : undefined,
      integrationRegistry: this.integrationRegistry,
    })
  }

  private integrationEntriesMatch(a: IntegrationDependencyEntry, b: IntegrationDependencyEntry): boolean {
    return jsonEqual(stripSnapshotMetadata(a), stripSnapshotMetadata(b))
  }

  private pluginEntriesMatch(a: PluginDependencyEntry, b: PluginDependencyEntry): boolean {
    return jsonEqual(stripSnapshotMetadata(a), stripSnapshotMetadata(b))
  }

  async diff(): Promise<DiffResult> {
    const snapshot = await this.readSnapshot()
    const cloud = await this.readCloudSnapshot(snapshot)
    const delta: DiffResult['delta'] = { addedInSnapshot: [], removedInSnapshot: [], changedInSnapshot: [] }
    for (const [alias, entry] of Object.entries(snapshot.integrations)) {
      const cloudEntry = cloud.integrations[alias]
      if (!cloudEntry) {
        delta.addedInSnapshot.push({ type: 'integration', alias, name: entry.name, version: entry.version })
      } else if (!this.integrationEntriesMatch(entry, cloudEntry)) {
        delta.changedInSnapshot.push({ type: 'integration', alias, field: 'unspecified' })
      }
    }
    for (const [alias, entry] of Object.entries(cloud.integrations)) {
      if (!snapshot.integrations[alias]) {
        delta.removedInSnapshot.push({ type: 'integration', alias, name: entry.name, version: entry.version })
      }
    }
    for (const [alias, entry] of Object.entries(snapshot.plugins)) {
      const cloudEntry = cloud.plugins[alias]
      if (!cloudEntry) {
        delta.addedInSnapshot.push({ type: 'plugin', alias, name: entry.name, version: entry.version })
      } else if (!this.pluginEntriesMatch(entry, cloudEntry)) {
        delta.changedInSnapshot.push({ type: 'plugin', alias, field: 'unspecified' })
      }
    }
    for (const [alias, entry] of Object.entries(cloud.plugins)) {
      if (!snapshot.plugins[alias]) {
        delta.removedInSnapshot.push({ type: 'plugin', alias, name: entry.name, version: entry.version })
      }
    }
    const snapshotReflectsCloud =
      delta.addedInSnapshot.length === 0 && delta.removedInSnapshot.length === 0 && delta.changedInSnapshot.length === 0
    return { target: this.env, snapshotReflectsCloud, delta }
  }

  async apply(opts?: { dryRun?: boolean; yes?: boolean }): Promise<ApplyResult> {
    await this.ensureDevTargetVerified()
    const snapshot = await this.readSnapshot()
    const cloud = await this.readCloudSnapshot(snapshot)

    const actions: ApplyAction[] = []
    const errors: ApplyResult['errors'] = []

    for (const [alias, entry] of Object.entries(snapshot.integrations)) {
      const c = cloud.integrations[alias]
      if (!c) {
        actions.push({
          type: 'integration',
          alias,
          action: 'install',
          details: { name: entry.name, version: entry.version },
        })
      } else if (c.version !== entry.version) {
        const isDowngrade =
          semver.valid(c.version) && semver.valid(entry.version) && semver.gt(c.version, entry.version)
        actions.push({
          type: 'integration',
          alias,
          action: isDowngrade ? 'downgrade' : 'upgrade',
          details: { name: entry.name, fromVersion: c.version, toVersion: entry.version },
        })
      } else {
        if (c.enabled !== entry.enabled)
          actions.push({
            type: 'integration',
            alias,
            action: entry.enabled ? 'enable' : 'disable',
            details: { name: entry.name, version: entry.version, previous: c.enabled },
          })
        if (!jsonEqual(c.config, entry.config))
          actions.push({
            type: 'integration',
            alias,
            action: 'reconfigure',
            details: { name: entry.name, version: entry.version, changedFields: ['config'] },
          })
      }
    }
    for (const alias of Object.keys(cloud.integrations)) {
      if (!snapshot.integrations[alias]) {
        const c = cloud.integrations[alias]!
        actions.push({
          type: 'integration',
          alias,
          action: 'uninstall',
          details: { name: c.name, version: c.version },
        })
      }
    }
    for (const [alias, entry] of Object.entries(snapshot.plugins)) {
      const c = cloud.plugins[alias]
      if (!c) {
        actions.push({
          type: 'plugin',
          alias,
          action: 'install',
          details: { name: entry.name, version: entry.version },
        })
      } else if (c.version !== entry.version) {
        const isDowngrade =
          semver.valid(c.version) && semver.valid(entry.version) && semver.gt(c.version, entry.version)
        actions.push({
          type: 'plugin',
          alias,
          action: isDowngrade ? 'downgrade' : 'upgrade',
          details: { name: entry.name, fromVersion: c.version, toVersion: entry.version },
        })
      } else {
        if (c.enabled !== entry.enabled)
          actions.push({
            type: 'plugin',
            alias,
            action: entry.enabled ? 'enable' : 'disable',
            details: { name: entry.name, version: entry.version, previous: c.enabled },
          })
        const configChanged = !jsonEqual(c.config, entry.config)
        const depsChanged = !jsonEqual(c.dependencies, entry.dependencies)
        if (configChanged || depsChanged) {
          const changedFields: string[] = []
          if (configChanged) changedFields.push('config')
          if (depsChanged) changedFields.push('dependencies')
          actions.push({
            type: 'plugin',
            alias,
            action: 'reconfigure',
            details: { name: entry.name, version: entry.version, changedFields },
          })
        }
      }
    }
    for (const alias of Object.keys(cloud.plugins)) {
      if (!snapshot.plugins[alias]) {
        const c = cloud.plugins[alias]!
        actions.push({
          type: 'plugin',
          alias,
          action: 'uninstall',
          details: { name: c.name, version: c.version },
        })
      }
    }

    if (opts?.dryRun) {
      return { target: this.env, applied: [], errors: [], skipped: actions, dryRun: true }
    }

    if (actions.length === 0) {
      return { target: this.env, applied: [], skipped: [], errors, dryRun: false }
    }

    if (!opts?.yes && this.env === 'prod') {
      throw new DependencyError({
        code: 'PROD_CONFIRMATION_REQUIRED',
        message: 'Apply targets production. Pass yes: true to confirm.',
        details: { planned: actions },
      })
    }

    if (!opts?.yes && actions.some((a) => a.action === 'uninstall')) {
      throw new DependencyError({
        code: 'UNINSTALL_REQUIRES_CONFIRMATION',
        message: 'Apply would uninstall resources from cloud. Pass yes: true to confirm.',
        details: { destructive: actions.filter((a) => a.action === 'uninstall') },
      })
    }

    const order: ApplyAction['action'][] = ['uninstall', 'upgrade', 'install', 'reconfigure', 'enable', 'disable']
    // For installs, integrations before plugins (plugins depend on integrations).
    // For uninstalls, plugins before integrations (mirror of install order — avoid
    // removing an integration that a plugin still depends on).
    function typeWeight(action: string, type: 'integration' | 'plugin' | 'interface'): number {
      if (action === 'uninstall') return type === 'plugin' ? 0 : 1
      return type === 'integration' ? 0 : 1
    }
    const sorted = [...actions].sort((a, b) => {
      const verbDiff = order.indexOf(a.action) - order.indexOf(b.action)
      if (verbDiff !== 0) return verbDiff
      return typeWeight(a.action, a.type) - typeWeight(b.action, b.type)
    })

    const applied: ApplyAction[] = []
    const appliedKeys = new Set<string>()
    for (const a of sorted) {
      try {
        const key = `${a.type}:${a.alias}`
        if (a.action === 'uninstall') {
          if (a.type === 'integration')
            await this.integrationResolver.removeFromCloud({ botId: this.botId, alias: a.alias })
          else await this.pluginResolver.removeFromCloud({ botId: this.botId, alias: a.alias })
        } else if (!appliedKeys.has(key)) {
          const entry = a.type === 'integration' ? snapshot.integrations[a.alias]! : snapshot.plugins[a.alias]!
          await this.applyEntry(a.type, a.alias, entry, snapshot)
          appliedKeys.add(key)
        }
        applied.push(a)
      } catch (err) {
        errors.push({
          action: a,
          code: (err as DependencyError).code ?? 'INVALID_CONFIG',
          message: (err as Error).message,
          suggestion: (err as DependencyError).suggestion,
        })
      }
    }

    await this.refreshSnapshotFromCloud()
    return { target: this.env, applied, skipped: [], errors, dryRun: false }
  }

  async copy(opts: CopyOptions): Promise<ApplyResult> {
    if (opts.from === opts.to) {
      throw new DependencyError({ code: 'SAME_SOURCE_TARGET', message: '--from and --to must be different' })
    }
    if (this.env !== opts.to) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `DependencyManager constructed with env='${this.env}' but copy targets '${opts.to}'`,
      })
    }
    const sourceTarget = normalizeDependencySnapshotTarget(opts.sourceTarget)
    if (sourceTarget.env !== opts.from) {
      throw new DependencyError({ code: 'INVALID_CONFIG', message: 'copy sourceTarget.env must match --from' })
    }
    if (sourceTarget.apiUrl !== this.target.apiUrl || sourceTarget.workspaceId !== this.target.workspaceId) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: 'Cross-authority dependency copy requires a separately authenticated source client and is not supported.',
      })
    }
    if (sourceTarget.botId === this.botId) {
      throw new DependencyError({
        code: 'SAME_SOURCE_TARGET',
        message: `${opts.from} and ${opts.to} resolve to the same Cloud bot (${sourceTarget.botId}).`,
      })
    }
    const sourceProjectTarget = await this.getProjectTarget(opts.from)
    if (
      sourceProjectTarget.apiUrl !== sourceTarget.apiUrl ||
      sourceProjectTarget.workspaceId !== sourceTarget.workspaceId
    ) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `copy sourceTarget authority does not match the ${opts.from} project link apiUrl/workspaceId.`,
      })
    }
    if (sourceProjectTarget.botId !== sourceTarget.botId) {
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `copy source target bot ${sourceTarget.botId} does not match the ${opts.from} project link`,
      })
    }
    await this.ensureDevTargetVerified()
    const sourceBotId = sourceTarget.botId
    const sourceStore = new DependencySnapshotStore({ projectPath: this.projectPath })
    if (opts.from === 'dev') {
      const runtimeBotId = sourceProjectTarget.runtimeBotId!
      const { bot } = await this.client.getBot({ id: runtimeBotId })
      assertDevBotMatchesTarget(bot, { botId: sourceBotId, runtimeBotId })
    }
    const sourceData = await sourceStore.refreshFromCloud({
      client: this.client,
      target: sourceTarget,
      runtimeBotId: opts.from === 'dev' ? sourceProjectTarget.runtimeBotId : undefined,
      integrationRegistry: this.integrationRegistry,
    })
    const targetSnapshotExists = await this.snapshotStore.exists(this.target)
    const targetSnapshot = await this.readSnapshot()

    const originalSnapshot = JSON.stringify(targetSnapshot)
    const merged = { ...targetSnapshot, integrations: sourceData.integrations, plugins: sourceData.plugins }
    await this.writeSnapshot(merged)

    try {
      const result = await this.apply({ dryRun: opts.dryRun, yes: opts.yes })
      if (opts.dryRun) {
        if (targetSnapshotExists) {
          await this.writeSnapshot(JSON.parse(originalSnapshot))
        } else {
          await this.snapshotStore.delete(this.target)
        }
      }
      return result
    } catch (err) {
      if (targetSnapshotExists) {
        await this.writeSnapshot(JSON.parse(originalSnapshot)).catch(() => {})
      } else {
        await this.snapshotStore.delete(this.target).catch(() => {})
      }
      throw err
    }
  }
}

function formatMissingDependencySuggestion(opts: {
  interfaceName: string
  pluginInterfaceAlias: string
  implementers: Array<{ name: string; version: string; title?: string }>
}): string {
  if (opts.implementers.length === 0) {
    return (
      `Install an integration that implements '${opts.interfaceName}' first, ` +
      `then update plugin binding '${opts.pluginInterfaceAlias}' through the Cloud bot-definition API and retry ` +
      `'brt dev' or 'brt deploy --adk'. Agent plugin binding mutation has no public brt command.`
    )
  }
  const lines = [`Hub integrations that implement '${opts.interfaceName}':`]
  for (const i of opts.implementers) {
    const title = i.title && i.title !== i.name ? ` — ${i.title}` : ''
    lines.push(`  • ${i.name}@${i.version}${title}`)
  }
  lines.push('')
  lines.push(
    `Install one on the selected target:  brt integrations install ${opts.implementers[0]!.name} --config-file <path>`
  )
  lines.push(`Register the returned webhookId:  brt integrations register <webhook-id>`)
  lines.push(
    `Update plugin binding '${opts.pluginInterfaceAlias}' through the Cloud bot-definition API, then retry brt dev (or brt deploy --adk for production). ` +
      `Agent plugin binding mutation has no public brt command.`
  )
  return lines.join('\n')
}

function stripSnapshotMetadata<T extends object>(entry: T): Omit<T, 'cloudAlias' | 'cloudId' | 'updatedAt'> {
  const {
    cloudAlias: _cloudAlias,
    cloudId: _cloudId,
    updatedAt: _updatedAt,
    ...semantic
  } = entry as T & {
    cloudAlias?: string
    cloudId?: string
    updatedAt?: string
  }
  return semantic as Omit<T, 'cloudAlias' | 'cloudId' | 'updatedAt'>
}

function dependencySnapshotToState(snapshot: DependencySnapshotData): DependencyStateData {
  const integrations: Record<string, IntegrationDependencyEntry> = {}
  for (const [alias, entry] of Object.entries(snapshot.integrations)) {
    integrations[alias] = stripSnapshotMetadata(entry as IntegrationSnapshotEntry)
  }

  const plugins: Record<string, PluginDependencyEntry> = {}
  for (const [alias, entry] of Object.entries(snapshot.plugins)) {
    plugins[alias] = stripSnapshotMetadata(entry as PluginSnapshotEntry)
  }

  return dependencyStateSchema.parse({
    version: 1,
    env: snapshot.env,
    integrations,
    plugins,
  })
}
