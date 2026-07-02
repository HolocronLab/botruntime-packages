import type { Integration as IntegrationDefinition, Plugin as PluginDefinition } from '@holocronlab/botruntime-client'
import type { DependencyState, StatusVerdict } from '@holocronlab/botruntime-runtime'

/**
 * Pure, offline capability-status resolution for dependencies (integrations and
 * plugins).
 *
 * Everything here is a pure function over already-resolved inputs — no
 * filesystem, network, auth, or cloud I/O. The callers gather the inputs:
 *
 * - `adk integrations status` / `adk check` (offline-first): snapshot entry + catalog
 *   spec (if reachable) + `existsSync(bp_modules/...)`.
 * - codegen (online): the same plus cloud `enabledStates` / merged config from
 *   `fetchServerIntegrationConfigs`.
 *
 * The verdict ({@link StatusVerdict}) is shared verbatim with the runtime carrier
 * and the CLI JSON surface so the three never disagree. `DependencyState` strings
 * are a public contract — see `packages/runtime/src/types.ts`.
 *
 * @see docs/INTEGRATION-ARCHITECTURE.md
 */

/** Structural view of a configuration definition (shared by integrations and plugins). */
interface ConfigurationLike {
  identifier?: { required?: boolean; linkTemplateScript?: string } | null
  schema?: { required?: unknown } | null
}

/**
 * Top-level required-field names declared by a JSON-schema configuration.
 * The catalog spec (`@holocronlab/botruntime-client` `Integration`/`Plugin`) serializes config
 * schemas to JSON schema, so `required` is a real `string[]` here (unlike the live
 * Zui object the runtime sees — that path uses `safeParse` instead).
 */
function schemaRequiredFields(config: ConfigurationLike | null | undefined): string[] {
  const required = (config?.schema as { required?: unknown } | undefined)?.required
  if (!Array.isArray(required)) return []
  return required.filter((field): field is string => typeof field === 'string')
}

/**
 * Whether a configuration definition forces the user to supply something before
 * the dependency can run: an identifier (OAuth/link) or any required schema field.
 *
 * Note the asymmetry with {@link integrationRequiresConfiguration}: a `null`/`undefined`
 * config returns `false` here (a resolved-but-empty variant requires nothing), whereas
 * the conservative `!configuration => true` rule lives one level up in
 * `integrationRequiresConfiguration` (a wholly-unresolved definition is treated as
 * requiring config). Both are intentional.
 */
function configurationRequiresInput(config: ConfigurationLike | null | undefined): boolean {
  if (!config) return false
  if (configGatesOnAuthorization(config)) return true
  return schemaRequiredFields(config).length > 0
}

/**
 * Whether a configuration definition gates on an external authorization (an
 * OAuth / connection identifier) — a requirement that is NOT enumerable as
 * schema fields client-side. The discriminator between "we can verify the
 * config locally" and "only Cloud knows whether it's satisfied".
 */
function configGatesOnAuthorization(config: ConfigurationLike | null | undefined): boolean {
  return !!(config?.identifier?.required || config?.identifier?.linkTemplateScript)
}

/**
 * Required schema fields absent from the supplied config values.
 *
 * "Absent" means `values[field] === undefined`, matching AJV's `required` keyword —
 * the validator Cloud uses (see `dependency-manager.ts` `extractMissingRequiredFields`).
 * A key present as `null` / `''` / `0` counts as configured here, agreeing with Cloud;
 * value-shape validation (e.g. a Zui schema rejecting `''`) is the runtime `safeParse`
 * backstop's job (WS2), not this build-time/CLI verdict.
 *
 * FIXME(WS2): this is one of three missing-field matchers in flight (the others being
 * DM's SDK-error parser and the future runtime Zui parse). WS2 converges them; until then
 * `persistedMissingFields` (Cloud's install-time verdict, WS0) is the authoritative override.
 */
function missingRequiredFields(
  config: ConfigurationLike | null | undefined,
  values: Record<string, unknown>
): string[] {
  return schemaRequiredFields(config).filter((field) => values[field] === undefined)
}

/** Build an `unconfigured` verdict, supplying a generic reason when the fields aren't enumerable (OAuth/identifier). */
function unconfigured(missingFields: string[]): StatusVerdict {
  if (missingFields.length > 0) return { state: 'unconfigured', missingFields }
  return {
    state: 'unconfigured',
    missingFields: [],
    reason: 'requires authorization or credentials (configure it in the Control Panel)',
  }
}

/**
 * The canonical verdict for an OAuth/connection-gated integration the user has
 * not authorized yet. Shared by the codegen carrier (the authorization gate) and
 * the offline snapshot readers (via the persisted `authorizationPending` flag) so
 * every surface words the same condition identically.
 */
export function authorizationPendingVerdict(): StatusVerdict {
  return {
    state: 'unconfigured',
    missingFields: [],
    reason: 'requires authorization — connect it in the Control Panel, then re-deploy',
  }
}

/**
 * Classify from the snapshot alone — no catalog spec available (the offline CLI path).
 * Cloud's persisted install-time verdict (WS0) is authoritative: a non-empty
 * `missingFields` means unconfigured; an empty one means Cloud confirmed configured,
 * so the only question left is the enable toggle. Callers use this only when they
 * actually hold a persisted verdict; absent one, a missing spec stays `unresolved`.
 */
function snapshotOnlyVerdict(enabled: boolean, persistedMissingFields: string[]): StatusVerdict {
  if (persistedMissingFields.length > 0) return unconfigured(persistedMissingFields)
  if (!enabled) return { state: 'disabled' }
  return { state: 'available' }
}

/**
 * Whether an integration requires configuration before it can be enabled.
 *
 * The default-configuration branch of {@link computeIntegrationStatus}. Behavior is
 * equivalent to the original `bot-generator/generator.ts` helper for all valid
 * JSON-schema input, including the deliberately conservative
 * `!configuration => requires config` rule (an integration whose definition could
 * not be fully resolved is treated as requiring config, so it is not auto-enabled).
 * The one intentional refinement: a malformed `required` entry that isn't a string
 * is ignored (see {@link schemaRequiredFields}), where the original counted any
 * non-empty array; real JSON schemas only contain string entries.
 */
export function integrationRequiresConfiguration(definition: IntegrationDefinition): boolean {
  const config = definition.configuration
  if (!config) return true
  return configurationRequiresInput(config)
}

/** Whether a plugin requires configuration before it can run. Plugins have no identifier. */
export function pluginRequiresConfiguration(definition: PluginDefinition): boolean {
  return schemaRequiredFields(definition.configuration).length > 0
}

/**
 * Whether an integration's active configuration gates on an external *authorization*
 * (an OAuth / connection identifier) rather than plain config fields. Such an integration
 * cannot be registered until the user completes the connect flow — Cloud's `register`
 * lifecycle hook hard-fails otherwise (e.g. "No refresh token found. Please complete the
 * OAuth flow to obtain a refresh token"). Used by {@link isAuthorizationPending} to leave an
 * unauthorized OAuth integration inert (`enabled: false`) rather than letting Cloud's
 * `register` hook abort the whole deploy/dev boot.
 *
 * Narrower than {@link integrationRequiresConfiguration}, which also counts plain required
 * schema fields — those CAN be satisfied from config without a cloud roundtrip, so they
 * don't need this register-time guard (a missing one is already `unconfigured`).
 */
export function integrationRequiresAuthorization(
  definition: IntegrationDefinition,
  configurationType?: string
): boolean {
  const { config } = resolveActiveConfiguration(definition, configurationType)
  return configGatesOnAuthorization(config)
}

/**
 * Pick the configuration definition to validate against. When the integration
 * uses a named variant (`configurations[type]`) that variant's schema applies;
 * otherwise the default `configuration` is used.
 *
 * `variantMissing` is set when a non-default variant was requested but the spec has
 * no such variant (stale snapshot, or a catalog spec that renamed/removed it). The caller
 * must treat that as `unresolved` rather than silently validating against the default
 * schema, which could produce a false `available`.
 */
function resolveActiveConfiguration(
  spec: IntegrationDefinition,
  configurationType?: string
): { config: ConfigurationLike | null | undefined; isDefault: boolean; variantMissing: boolean } {
  if (configurationType && configurationType !== 'default') {
    const variant = (spec.configurations as Record<string, ConfigurationLike> | undefined)?.[configurationType]
    if (variant) return { config: variant, isDefault: false, variantMissing: false }
    return { config: undefined, isDefault: false, variantMissing: true }
  }
  return { config: spec.configuration, isDefault: true, variantMissing: false }
}

export interface ComputeIntegrationStatusInput {
  /** Whether the integration's module exists on disk (`bp_modules/integration_<alias>`). */
  installed: boolean
  /** Catalog/cloud definition; `null` when it could not be resolved. */
  spec: IntegrationDefinition | null
  /** Resolved enabled flag — the snapshot's intent, optionally reconciled with cloud by the caller. */
  enabled: boolean
  /** Effective merged configuration (server + local). */
  config?: Record<string, unknown>
  /** Active variant key when the integration uses `configurations` (plural). */
  configurationType?: string
  /**
   * Authoritative missing-field set captured from Cloud at install time and
   * persisted in the snapshot (WS0). Wins over schema-derived fields when provided:
   * an explicit empty array means "Cloud confirms configured".
   */
  persistedMissingFields?: string[]
  /**
   * Cloud's current enabled state, when known (codegen path). Disambiguates
   * identifier/OAuth integrations whose required fields aren't enumerable
   * client-side: Cloud only keeps such an integration enabled once configured.
   */
  cloudEnabled?: boolean
  /**
   * Last-known authorization state persisted in the snapshot (WS5/#7): `true` means
   * the integration gates on an OAuth/connection identifier the cloud bot did
   * not have at the last refresh. Yields the same `unconfigured` verdict the
   * codegen authorization gate bakes into the runtime carrier.
   */
  authorizationPending?: boolean
}

/**
 * Resolve an integration's capability state. Precedence:
 * `not_installed` > `unresolved` > `unconfigured` > `disabled` > `available`.
 */
export function computeIntegrationStatus(input: ComputeIntegrationStatusInput): StatusVerdict {
  if (!input.installed) return { state: 'not_installed' }
  // Spec-required: without a definition the integration can't be wired, so it's
  // unresolved. The offline reader, which intentionally may not fetch a spec, uses
  // {@link computeSnapshotOnlyStatus} instead (trusting the snapshot's cloud-reflected state).
  if (!input.spec) return { state: 'unresolved', reason: 'integration definition could not be resolved' }

  const {
    config: activeConfig,
    isDefault,
    variantMissing,
  } = resolveActiveConfiguration(input.spec, input.configurationType)
  if (variantMissing) {
    return { state: 'unresolved', reason: `configuration variant '${input.configurationType}' not found in spec` }
  }
  const requiresConfig = isDefault
    ? integrationRequiresConfiguration(input.spec)
    : configurationRequiresInput(activeConfig)

  const values = input.config ?? {}
  const schemaMissing = requiresConfig ? missingRequiredFields(activeConfig, values) : []

  let configIncomplete = false
  if (input.persistedMissingFields !== undefined) {
    // Authoritative Cloud verdict (empty array => configured) — dominates the
    // catalog spec, since it reflects Cloud's actual install-time validation.
    configIncomplete = input.persistedMissingFields.length > 0
  } else if (requiresConfig) {
    if (schemaMissing.length > 0) {
      configIncomplete = true
    } else if (input.cloudEnabled === false && configGatesOnAuthorization(activeConfig)) {
      // Gates on a non-enumerable authorization (identifier/OAuth): missing
      // credentials are invisible client-side, so trust Cloud's refusal to
      // enable as evidence config is still incomplete. A plain schema config
      // with every required field supplied must NOT hit this branch — cloud-off
      // there is a deliberate disable, not missing config.
      configIncomplete = true
    }
  }

  if (configIncomplete) {
    const missingFields =
      input.persistedMissingFields && input.persistedMissingFields.length > 0
        ? input.persistedMissingFields
        : schemaMissing
    return unconfigured(missingFields)
  }

  // Authorization is orthogonal to config fields and to the enable toggle (the
  // identifier persists across toggles): an unauthorized OAuth integration is
  // unconfigured whatever else looks fine — same precedence as the codegen gate.
  if (input.authorizationPending) return authorizationPendingVerdict()

  // An explicit cloud-off is a deliberate disable even when the snapshot still says
  // enabled (the dev-console toggle writes only the cloud bot).
  if (!input.enabled || input.cloudEnabled === false) return { state: 'disabled' }
  return { state: 'available' }
}

export interface AuthorizationGateInput {
  /** Whether the integration's active config gates on an OAuth/connection identifier. */
  requiresAuthorization: boolean
  /**
   * Whether the integration is authorized on the target cloud bot (has an `identifier`).
   * `undefined` means it's not on the cloud bot yet → treated as not authorized.
   */
  cloudAuthorized?: boolean
  /** True when the cloud read failed this pass — then we can't conclude anything. */
  cloudFetchErrored?: boolean
}

/**
 * Whether an integration must be left inert (emitted `enabled: false`, but still declared)
 * because it gates on an authorization the user hasn't completed yet. The classic case: a
 * managed-OAuth integration (`gmail`) toggled on but never connected — Cloud's `register`
 * hook hard-fails ("No refresh token found …") and aborts the WHOLE `adk dev` / `adk deploy`
 * boot if the integration is declared `enabled: true`.
 *
 * The fix is to demote it to `enabled: false`, NOT to omit it from the definition: `bp`
 * skips registering a disabled integration (so the boot survives), yet keeps it on the bot
 * so (a) the user can still authorize it in the Control Panel — omitting it makes `bp` prune
 * it from the cloud bot, a first-auth dead end — and (b) any plugin whose dependency maps to
 * this alias still resolves at `addPlugin` time. Once the user authorizes it the cloud
 * integration gains an `identifier`, this returns false, and codegen re-enables it.
 *
 * Keyed off *authorization* (the `identifier`), NOT the registration lifecycle status: a
 * disabled integration reports `unregistered`, which a status-based gate would read as
 * "still blocked" forever even after the user connects it — a dead loop. The identifier
 * persists across the enable/disable toggle, so it's the signal that lets us self-heal.
 *
 * Only authorization-gated integrations are affected: plain config/schema integrations
 * register fine from their config without an out-of-band step. Guarded by `cloudFetchErrored`
 * so a transient cloud-read failure never demotes a working integration (unknown ≠
 * unauthorized).
 */
export function isAuthorizationPending(input: AuthorizationGateInput): boolean {
  if (input.cloudFetchErrored) return false
  if (!input.requiresAuthorization) return false
  return !input.cloudAuthorized
}

export interface PluginDependencyStatus {
  alias: string
  verdict: StatusVerdict
}

/**
 * Transitive rule shared by every plugin-verdict path (spec-aware, codegen
 * carrier, snapshot-only): a plugin cannot run while a backing integration is inert.
 * A deliberately *disabled* backing integration makes the plugin `disabled` —
 * an intentional, supported state that must not read as a failure (or block a
 * deploy) — while any other non-available state makes it `unresolved`.
 * Returns `null` when every backing integration is available.
 */
export function transitiveDependencyVerdict(
  dependencyStatuses: PluginDependencyStatus[] | undefined
): StatusVerdict | null {
  const broken = (dependencyStatuses ?? []).find((dep) => dep.verdict.state !== 'available')
  if (!broken) return null
  const state = broken.verdict.state === 'disabled' ? ('disabled' as const) : ('unresolved' as const)
  return { state, reason: `dependency '${broken.alias}' is ${broken.verdict.state}` }
}

/**
 * Shape a plugin's `dependencies` map into the {@link PluginDependencyStatus}
 * list the transitive rule consumes, resolving each backing integration's
 * verdict through the caller's lookup. Shared by codegen and the offline
 * resolver so the fallback — a reference to an integration that has no verdict,
 * i.e. one not declared in the project — reads identically everywhere.
 */
export function mapPluginDependencyStatuses(
  dependencies: Record<string, { integrationAlias?: string }> | undefined,
  verdictFor: (alias: string) => StatusVerdict | undefined
): PluginDependencyStatus[] {
  return Object.values(dependencies ?? {})
    .map((dep) => dep.integrationAlias)
    .filter((alias): alias is string => !!alias)
    .map((alias) => ({
      alias,
      verdict: verdictFor(alias) ?? {
        state: 'unresolved' as const,
        reason: `backing integration '${alias}' is not declared in the project`,
      },
    }))
}

export interface ComputePluginStatusInput {
  /** Whether the plugin's module exists on disk (`bp_modules/plugin_<alias>`). */
  installed: boolean
  /** Catalog/cloud definition; `null` when it could not be resolved. */
  spec: PluginDefinition | null
  /** Resolved enabled flag. */
  enabled: boolean
  /** Effective merged configuration (server + local). */
  config?: Record<string, unknown>
  /** Authoritative missing-field set persisted in the snapshot (WS0). Wins when provided. */
  persistedMissingFields?: string[]
  /**
   * Capability verdicts of the integrations backing this plugin's interface
   * dependencies. A plugin cannot run if any backing integration is inert.
   */
  dependencyStatuses?: PluginDependencyStatus[]
}

/**
 * Resolve a plugin's capability state. Same precedence as integrations, plus a
 * transitive rule: a plugin is `unresolved` if any backing integration (the
 * concrete fulfilment of an interface dependency) is itself not `available`.
 * Precedence: `not_installed` > `unresolved` (own or transitive) > `unconfigured` > `disabled` > `available`.
 */
export function computePluginStatus(input: ComputePluginStatusInput): StatusVerdict {
  if (!input.installed) return { state: 'not_installed' }
  if (!input.spec) return { state: 'unresolved', reason: 'plugin definition could not be resolved' }

  const transitive = transitiveDependencyVerdict(input.dependencyStatuses)
  if (transitive) return transitive

  const requiresConfig = pluginRequiresConfiguration(input.spec)
  const values = input.config ?? {}
  const schemaMissing = requiresConfig ? missingRequiredFields(input.spec.configuration, values) : []

  let configIncomplete = false
  if (input.persistedMissingFields !== undefined) {
    configIncomplete = input.persistedMissingFields.length > 0
  } else if (requiresConfig) {
    configIncomplete = schemaMissing.length > 0
  }

  if (configIncomplete) {
    const missingFields =
      input.persistedMissingFields && input.persistedMissingFields.length > 0
        ? input.persistedMissingFields
        : schemaMissing
    return unconfigured(missingFields)
  }

  if (!input.enabled) return { state: 'disabled' }
  return { state: 'available' }
}

export interface ComputePluginCarrierStatusInput {
  /** Whether the plugin's module exists on disk (`bp_modules/plugin_<alias>`). */
  installed: boolean
  /** Cloud's persisted install-time missing-field verdict, if any. */
  persistedMissingFields?: string[]
  /**
   * Capability verdicts of the integrations backing this plugin's interface
   * dependencies. A plugin cannot run if any backing integration is inert.
   */
  dependencyStatuses?: PluginDependencyStatus[]
}

/**
 * Plugin capability verdict for the **codegen carrier**, where the plugin spec
 * is intentionally not loaded (the build pipeline loads integration and
 * interface definitions, but not plugin definitions). It therefore covers
 * on-disk presence, transitive integration-dependency availability, and the
 * persisted Cloud missing-field verdict captured during install/refresh:
 *
 * - `not_installed` — the plugin module is missing on disk (MODE B)
 * - `disabled`      — a backing integration is deliberately disabled
 * - `unresolved`    — a backing integration is otherwise not `available`
 * - `unconfigured` — Cloud rejected the plugin's own required config
 * - `available`    — installed, configured, and all backing integrations are available
 *
 * The runtime drift backstop still catches missing config that Cloud has not
 * persisted yet. The spec-aware {@link computePluginStatus} is used by the
 * offline CLI path, where the plugin definition is available.
 */
export function computePluginCarrierStatus(input: ComputePluginCarrierStatusInput): StatusVerdict {
  if (!input.installed) return { state: 'not_installed' }
  const transitive = transitiveDependencyVerdict(input.dependencyStatuses)
  if (transitive) return transitive
  if (input.persistedMissingFields && input.persistedMissingFields.length > 0) {
    return unconfigured(input.persistedMissingFields)
  }
  return { state: 'available' }
}

export interface ComputeSnapshotOnlyStatusInput {
  /** Whether the dependency's module exists on disk (`bp_modules/...`). */
  installed: boolean
  /** Resolved enabled flag (the snapshot's cloud-reflected intent). */
  enabled: boolean
  /** Cloud's persisted install-time missing-field verdict (WS0), if any. */
  missingFields?: string[]
  /** Persisted last-known authorization state (WS5/#7), integrations only. */
  authorizationPending?: boolean
}

/**
 * Capability verdict from the **snapshot alone** — no catalog spec. This is the
 * offline reader's path (`adk integrations status`, `adk check`, the `adk dev`
 * boot summary) when a spec wasn't (or couldn't be) fetched.
 *
 * It trusts the snapshot because the snapshot reflects Cloud's validated state: Cloud only
 * keeps an integration `enabled` once its required config is satisfied, so
 * `enabled` ⟹ `available`. A persisted missing-field verdict (WS0) overrides that
 * with `unconfigured`. Unlike {@link computeIntegrationStatus}, this never returns
 * `unresolved` for a missing spec — the absence of a spec here means "not fetched",
 * not "unresolvable".
 *
 * Precedence: `not_installed` > `unconfigured` (persisted) > `disabled` > `available`.
 */
export function computeSnapshotOnlyStatus(input: ComputeSnapshotOnlyStatusInput): StatusVerdict {
  if (!input.installed) return { state: 'not_installed' }
  const verdict = snapshotOnlyVerdict(input.enabled, input.missingFields ?? [])
  // A pending authorization makes an otherwise-clean entry unconfigured (the
  // codegen carrier reports the same), but never hides a more specific verdict.
  if (verdict.state === 'available' || verdict.state === 'disabled') {
    if (input.authorizationPending) return authorizationPendingVerdict()
  }
  return verdict
}

/** A dependency's capability state is callable only when `available`. */
export function isCallable(state: DependencyState): boolean {
  return state === 'available'
}
