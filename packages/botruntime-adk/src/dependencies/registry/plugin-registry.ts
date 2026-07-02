import { PluginManager, type PluginManagerOptions } from '../../plugins/manager.js'
import type { PluginDefinition, PluginRef } from '../../plugins/types.js'

export interface PluginRegistryOptions {
  /** Optional: pass a pre-built manager. If omitted, a default is constructed. */
  manager?: PluginManager
  /** Optional: manager options passed to constructor when manager is not provided. */
  managerOptions?: PluginManagerOptions
}

export class PluginRegistry {
  private readonly manager: PluginManager

  constructor(opts: PluginRegistryOptions = {}) {
    this.manager = opts.manager ?? new PluginManager(opts.managerOptions)
  }

  async getSpec(name: string, version?: string): Promise<PluginDefinition> {
    const ref: PluginRef = {
      name,
      version: version ?? 'latest',
      fullName: name,
    }
    return this.manager.fetchPlugin(ref)
  }

  async search(_query: string): Promise<unknown[]> {
    return this.manager.searchPlugins(_query)
  }

  async listVersions(name: string): Promise<string[]> {
    return this.manager.listPluginVersions(name)
  }
}
