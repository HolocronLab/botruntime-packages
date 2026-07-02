export function getIntegrationAlias(integrationName: string) {
  return integrationName.replace(/\//g, '__').replace(/-/g, '_').toLowerCase()
}

export function getPluginAlias(pluginName: string) {
  return pluginName.replace(/-/g, '_').toLowerCase()
}

/**
 * Directory name of a synced module under `bp_modules/`.
 *
 * Encodes the one naming rule shared by sync (which creates the folders),
 * codegen (which gates emission on their presence), and the offline status
 * resolver (which reports `not_installed`): integration folders use the
 * normalized alias, plugin folders use the raw dependency alias. Normalization is
 * idempotent, so already-normalized aliases are safe to pass.
 */
export function bpModuleDirName(kind: 'integration' | 'plugin', alias: string): string {
  return kind === 'integration' ? `integration_${getIntegrationAlias(alias)}` : `plugin_${alias}`
}
