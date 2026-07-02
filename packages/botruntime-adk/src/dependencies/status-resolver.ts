import { existsSync } from 'fs'
import * as path from 'path'
import type { StatusVerdict } from '@holocronlab/botruntime-runtime'
import type { DependencySnapshotData, DependencyStateData, DependencyStatus } from './types.js'
import type { IntegrationDefinition } from '../integrations/types.js'
import type { PluginDefinition } from '../plugins/types.js'
import {
  computeIntegrationStatus,
  computePluginStatus,
  computeSnapshotOnlyStatus,
  mapPluginDependencyStatuses,
  transitiveDependencyVerdict,
} from './status.js'
import { bpModuleDirName } from '../utils/ids.js'

/** Minimal registry surface the resolver needs (best-effort spec fetch). */
interface SpecSource<TDef> {
  getSpec(name: string, version?: string): Promise<TDef>
}

export interface ResolveDependencyStatusesInput {
  /** The per-env dependency snapshot. */
  snapshot: DependencySnapshotData | DependencyStateData
  /**
   * Directory holding the synced `bp_modules/` (e.g. `<project>/.adk/bot/bp_modules`),
   * used for the on-disk installed check (MODE B). When omitted, dependencies are
   * assumed installed — a fresh checkout that hasn't built yet shouldn't report every
   * dependency `not_installed`; the snapshot + config drives the verdict instead.
   */
  bpModulesDir?: string
  /** Optional catalog registries to enrich verdicts with specs. Best-effort: a fetch
   *  failure (offline / unauthenticated) degrades to a null spec, never throws. */
  integrationRegistry?: SpecSource<IntegrationDefinition>
  pluginRegistry?: SpecSource<PluginDefinition>
}

/**
 * Offline-first capability resolver: the single place that turns a dependency snapshot (+ optional
 * catalog specs + on-disk presence) into the flat {@link DependencyStatus} records
 * the CLI (`adk integrations status`, `adk check`), the `adk dev` boot summary, and
 * the deploy gate all consume. It gathers the I/O inputs and delegates the verdict to
 * the pure `compute*Status` functions; integrations are resolved first so each plugin
 * can see its backing integrations' verdicts (the transitive rule).
 *
 * Requires no auth/botId — a missing registry or a fetch failure simply yields a null
 * spec (verdict falls back to Cloud's persisted WS0 verdict, or `unresolved`).
 */
export async function resolveDependencyStatuses(input: ResolveDependencyStatusesInput): Promise<DependencyStatus[]> {
  const out: DependencyStatus[] = []
  const integrationVerdicts = new Map<string, StatusVerdict>()

  for (const [alias, entry] of Object.entries(input.snapshot.integrations)) {
    const installed = input.bpModulesDir
      ? existsSync(path.join(input.bpModulesDir, bpModuleDirName('integration', alias)))
      : true
    const spec = await tryGetSpec(input.integrationRegistry, entry.name, entry.version)
    const verdict = spec
      ? computeIntegrationStatus({
          installed,
          spec,
          enabled: entry.enabled,
          config: entry.config,
          ...(entry.configurationType ? { configurationType: entry.configurationType } : {}),
          ...(entry.missingFields !== undefined ? { persistedMissingFields: entry.missingFields } : {}),
          ...(entry.authorizationPending !== undefined ? { authorizationPending: entry.authorizationPending } : {}),
        })
      : computeSnapshotOnlyStatus({
          installed,
          enabled: entry.enabled,
          ...(entry.missingFields !== undefined ? { missingFields: entry.missingFields } : {}),
          ...(entry.authorizationPending !== undefined ? { authorizationPending: entry.authorizationPending } : {}),
        })
    integrationVerdicts.set(alias, verdict)
    out.push({
      type: 'integration',
      alias,
      name: entry.name,
      version: entry.version,
      enabled: entry.enabled,
      ...verdict,
    })
  }

  for (const [alias, entry] of Object.entries(input.snapshot.plugins)) {
    const installed = input.bpModulesDir
      ? existsSync(path.join(input.bpModulesDir, bpModuleDirName('plugin', alias)))
      : true
    const spec = await tryGetSpec(input.pluginRegistry, entry.name, entry.version)
    const dependencyStatuses = mapPluginDependencyStatuses(entry.dependencies, (intAlias) =>
      integrationVerdicts.get(intAlias)
    )
    let verdict: StatusVerdict
    if (spec) {
      verdict = computePluginStatus({
        installed,
        spec,
        enabled: entry.enabled,
        config: entry.config,
        dependencyStatuses,
        ...(entry.missingFields !== undefined ? { persistedMissingFields: entry.missingFields } : {}),
      })
    } else if (!installed) {
      verdict = { state: 'not_installed' }
    } else {
      // Snapshot-only (no spec): the transitive rule still applies — a plugin can't run
      // if a backing integration is inert — then trust the persisted WS0 verdict and
      // the snapshot's enabled flag, exactly like the integration path.
      verdict =
        transitiveDependencyVerdict(dependencyStatuses) ??
        computeSnapshotOnlyStatus({
          installed: true,
          enabled: entry.enabled,
          ...(entry.missingFields !== undefined ? { missingFields: entry.missingFields } : {}),
        })
    }
    out.push({ type: 'plugin', alias, name: entry.name, version: entry.version, enabled: entry.enabled, ...verdict })
  }

  return out
}

async function tryGetSpec<TDef>(
  source: SpecSource<TDef> | undefined,
  name: string,
  version: string
): Promise<TDef | null> {
  if (!source) return null
  try {
    return await source.getSpec(name, version)
  } catch {
    // Offline / unauthenticated / removed-from-catalog: degrade to a null spec.
    return null
  }
}
