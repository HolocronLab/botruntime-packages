import { DependencyError } from '../dependencies/errors.js'
import type { DependencySnapshotData, DependencyStatus } from '../dependencies/types.js'
import type { DeployPlan, IntegrationVersionMismatch } from './types.js'

/**
 * The deploy gate (WS5), in one place: `computeDeployPlan` computes the blocking
 * set with {@link isDeployBlocking}, and every deploy surface — `adk deploy`, the
 * dev-console deploy handler, and any future entry point — enforces it through
 * {@link assertNoBlockingDependencies}. Keeping projection, predicate, and error
 * here means the surfaces cannot drift on what blocks a deploy or how it reads.
 */

/** JSON-safe projection of a deploy-blocking dependency (CLI error details + dev-console plan summary). */
export interface BlockingDependencySummary {
  type: string
  alias: string
  state: string
  missingFields?: string[]
  reason?: string
}

/**
 * Whether a dependency's verdict blocks a deploy. `disabled` never blocks: it is
 * an intentional, supported state (an integration toggled off, or a plugin whose
 * backing integration is) — the dependency ships inert, exactly as the user chose.
 * Every other non-`available` state on an enabled dependency blocks.
 */
export function isDeployBlocking(dependency: DependencyStatus): boolean {
  return dependency.enabled && dependency.state !== 'available' && dependency.state !== 'disabled'
}

export function summarizeBlockingDependencies(blocking: DependencyStatus[]): BlockingDependencySummary[] {
  return blocking.map((d) => ({
    type: d.type,
    alias: d.alias,
    state: d.state,
    ...(d.missingFields ? { missingFields: d.missingFields } : {}),
    // Carry the human cause (transitive breakage / unresolved spec) so the
    // JSON error is self-describing without a follow-up `status` call.
    ...(d.reason ? { reason: d.reason } : {}),
  }))
}

export function findIntegrationVersionMismatches(
  devSnapshot: DependencySnapshotData,
  prodSnapshot: DependencySnapshotData
): IntegrationVersionMismatch[] {
  return Object.entries(devSnapshot.integrations)
    .flatMap(([alias, dev]) => {
      const prod = prodSnapshot.integrations[alias]
      if (!prod || dev.name !== prod.name || dev.version === prod.version) return []
      return [
        {
          type: 'integration' as const,
          alias,
          name: dev.name,
          devVersion: dev.version,
          prodVersion: prod.version,
        },
      ]
    })
    .sort((a, b) => a.alias.localeCompare(b.alias))
}

/**
 * Throw the canonical `UNCONFIGURED_DEPENDENCIES` error when the plan carries a
 * blocking dependency set and the caller didn't opt into shipping them inert.
 * Entry points map this typed error to their transport (CLI exit, HTTP 422) and
 * may append surface-specific remediation, but the core message and the
 * `details.blocking` projection are shared.
 */
export function assertNoBlockingDependencies(plan: DeployPlan, options?: { allowUnconfigured?: boolean }): void {
  if (options?.allowUnconfigured) return
  const blocking = plan.dependencyPlan.blocking
  if (blocking.length === 0) return
  const summary = blocking.map((d) => `${d.alias} (${d.state})`).join(', ')
  throw new DependencyError({
    code: 'UNCONFIGURED_DEPENDENCIES',
    message: `${blocking.length} enabled ${blocking.length === 1 ? 'dependency is' : 'dependencies are'} unconfigured or unresolved: ${summary}`,
    details: { blocking: summarizeBlockingDependencies(blocking) },
    suggestion:
      'Run `adk integrations status` (and `adk plugins status`) to see details, configure them, then retry — or deploy with --allow-unconfigured to ship them inert.',
  })
}
