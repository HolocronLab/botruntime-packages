import { type InterfacePackage, type IntegrationPackage, type PluginPackage } from '@holocronlab/botruntime-sdk'
import { ZodType, ZodTypeDef } from '@holocronlab/botruntime-zui'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic default type parameter
export type ZuiType<Output = any, Input = Output> = ZodType<Output, ZodTypeDef, Input>

export type Integrations = never // Will be overridden by the ADK
export type Interfaces = never // Will be overridden by the ADK

// Re-export event types that will be overridden by the ADK
export type { Events, EventName, EventPayload } from './_types/events'
export type { Triggers } from './_types/triggers'

/**
 * An integration installed into the bot, carrying its capability status.
 *
 * `status` is populated by codegen (`adk-runtime.ts`'s `agentRegistry.initialize`)
 * and is required — the runtime proxy gates calls on it and never treats a
 * missing one as `available`. Whether the integration is enabled is derivable
 * (`status.state === 'available'` ⇔ callable); there is deliberately no separate
 * `enabled` flag to keep in sync. See {@link StatusVerdict}.
 */
export type RegisteredIntegration = IntegrationPackage & {
  alias: string
  status: StatusVerdict
}
export type RegisteredInterface = InterfacePackage & { alias: string }

/**
 * A plugin installed into the bot, carrying its capability status — the plugin
 * counterpart of {@link RegisteredIntegration}. Threaded through the same carrier
 * chain (registry → context) so the plugin action proxy can gate calls.
 */
export type RegisteredPlugin = PluginPackage & {
  alias: string
  status: StatusVerdict
}

/**
 * Capability state of an installed dependency (integration or plugin).
 *
 * Only `available` is callable. Every other state means the dependency is
 * present for typing/discovery but inert — invoking it yields a typed,
 * catchable error instead of crashing the bot. The verdict is computed once at
 * build time and carried into the running bot, then re-checked at call time as
 * a drift backstop.
 *
 * - `available`     — installed, enabled, and required config satisfied → callable
 * - `not_installed` — declared in the lock but its module is missing on disk
 * - `unconfigured`  — required configuration is missing (see `missingFields`)
 * - `disabled`      — explicitly turned off (configuration is otherwise complete)
 * - `unresolved`    — definition could not be resolved (catalog/cloud unreachable, version mismatch, dependency unavailable)
 * - `errored`       — an unexpected fault while loading/registering the dependency
 *
 * Note: the build-time status resolver (`adk` `dependencies/status.ts`) never emits
 * `errored` — that state is produced only by the codegen register-loop catch (WS3).
 */
export type DependencyState = 'available' | 'not_installed' | 'unconfigured' | 'disabled' | 'unresolved' | 'errored'

/**
 * The capability verdict, shared verbatim across the lock / codegen / runtime /
 * CLI surfaces so they cannot disagree.
 *
 * `state` strings are a public contract: they appear in
 * `adk integrations status --format=json` and in the typed runtime error
 * payload. Treat additions/renames as breaking.
 *
 * Consumers MUST branch on `state` — never infer "configured" from
 * `missingFields`. An identifier/OAuth integration whose state is `unconfigured`
 * carries `missingFields: []` (its required fields aren't enumerable client-side),
 * with the detail in `reason` instead.
 */
export interface StatusVerdict {
  state: DependencyState
  /**
   * Required config field names still missing — present when `state === 'unconfigured'`.
   * May be an empty array for identifier/OAuth integrations (fields not enumerable
   * client-side); use `reason` in that case.
   */
  missingFields?: string[]
  /** Human-readable detail for `unconfigured` (OAuth) / `unresolved` / `errored` (and the source dependency for transitive failures). */
  reason?: string
}
