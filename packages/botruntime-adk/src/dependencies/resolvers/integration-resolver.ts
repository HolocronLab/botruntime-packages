import type { Client } from '@holocronlab/botruntime-client'
import type { IntegrationRegistry } from '../registry/integration-registry.js'
import type { IntegrationDependencyEntry } from '../types.js'
import { DependencyError } from '../errors.js'

interface CloudIntegration {
  name?: string
  version?: string
  enabled?: boolean
  configuration?: Record<string, unknown>
  configurationType?: string | null
}

export interface IntegrationResolverOptions {
  registry: IntegrationRegistry
  client: Client
}

export class IntegrationResolver {
  private readonly registry: IntegrationRegistry
  private readonly client: Client

  constructor(opts: IntegrationResolverOptions) {
    this.registry = opts.registry
    this.client = opts.client
  }

  toDependencyEntry(cloud: CloudIntegration): IntegrationDependencyEntry {
    const entry: IntegrationDependencyEntry = {
      name: cloud.name ?? '',
      version: cloud.version ?? '0.0.0',
      enabled: Boolean(cloud.enabled),
      config: cloud.configuration ?? {},
    }
    // Persist the active configuration variant from Cloud (WS0). "default" is the
    // implicit variant — omit it so the snapshot stays clean for the common case.
    if (
      typeof cloud.configurationType === 'string' &&
      cloud.configurationType &&
      cloud.configurationType !== 'default'
    ) {
      entry.configurationType = cloud.configurationType
    }
    return entry
  }

  async applyToCloud(opts: { botId: string; alias: string; entry: IntegrationDependencyEntry }): Promise<void> {
    // Resolve integrationId from the registry spec. IntegrationDefinition extends Integration which has `.id`.
    const spec = await this.registry.getSpec(opts.entry.name, opts.entry.version)
    const integrationId = spec.id
    if (!integrationId) {
      throw new DependencyError({
        code: 'INTEGRATION_NOT_FOUND',
        message: `Could not resolve integrationId for ${opts.entry.name}@${opts.entry.version}`,
      })
    }

    await this.client.updateBot({
      id: opts.botId,
      integrations: {
        [opts.alias]: {
          integrationId,
          enabled: opts.entry.enabled,
          configuration: opts.entry.config as Record<string, unknown>,
        },
      },
    })
  }

  async removeFromCloud(opts: { botId: string; alias: string }): Promise<void> {
    await this.client.updateBot({
      id: opts.botId,
      integrations: { [opts.alias]: null },
    })
  }
}
