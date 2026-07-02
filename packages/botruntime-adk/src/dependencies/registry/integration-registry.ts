import { IntegrationManager, type IntegrationManagerOptions } from '../../integrations/manager.js'
import type { IntegrationDefinition, IntegrationRef } from '../../integrations/types.js'

export interface IntegrationRegistryOptions {
  /** Optional: pass a pre-built manager. If omitted, a default is constructed. */
  manager?: IntegrationManager
  /** Optional: manager options passed to constructor when manager is not provided. */
  managerOptions?: IntegrationManagerOptions
}

export class IntegrationRegistry {
  private readonly manager: IntegrationManager

  constructor(opts: IntegrationRegistryOptions = {}) {
    this.manager = opts.manager ?? new IntegrationManager(opts.managerOptions)
  }

  async getSpec(name: string, version?: string): Promise<IntegrationDefinition> {
    const ref: IntegrationRef = {
      name,
      version: version ?? 'latest',
      fullName: name,
    }
    return this.manager.fetchIntegration(ref)
  }

  async search(_query: string): Promise<unknown[]> {
    return this.manager.searchIntegrations(_query)
  }

  async findImplementersOfInterface(interfaceName: string, limit?: number): Promise<unknown[]> {
    return this.manager.findImplementersOfInterface(interfaceName, limit)
  }

  async listVersions(name: string): Promise<string[]> {
    return this.manager.listIntegrationVersions(name)
  }
}
