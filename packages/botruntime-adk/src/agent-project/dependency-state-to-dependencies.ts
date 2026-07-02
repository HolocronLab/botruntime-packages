import type { DependencyStateData } from '@holocronlab/botruntime-adk/dependencies'
import type { Dependencies } from './types.js'

/**
 * Convert per-env dependency snapshot data into the `Dependencies` shape
 * consumed by IntegrationManager / InterfaceManager / PluginManager.
 *
 * The persisted snapshot is keyed by alias with `{ name, version, enabled, config }`.
 * The legacy `Dependencies` shape is keyed by alias with `{ version: "name@version", enabled, config }`.
 */
export function dependencyStateToDependencies(state: DependencyStateData): Dependencies {
  const integrations: Dependencies['integrations'] = {}
  for (const [alias, entry] of Object.entries(state.integrations)) {
    integrations[alias] = {
      version: `${entry.name}@${entry.version}`,
      enabled: entry.enabled,
      config: entry.config,
      // Carry the persisted configuration variant (WS0) so codegen validates against
      // and emits the right `configurations[type]` instead of the default schema.
      ...(entry.configurationType ? { configurationType: entry.configurationType } : {}),
    }
  }

  const plugins: Dependencies['plugins'] = {}
  for (const [alias, entry] of Object.entries(state.plugins)) {
    plugins[alias] = {
      version: `${entry.name}@${entry.version}`,
      config: entry.config,
      dependencies: entry.dependencies,
      ...(entry.missingFields !== undefined ? { missingFields: entry.missingFields } : {}),
    }
  }

  return { integrations, plugins }
}
