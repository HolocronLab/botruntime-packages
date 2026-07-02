import type { Client } from '@holocronlab/botruntime-client'
import type { PluginRegistry } from '../registry/plugin-registry.js'
import type { IntegrationRegistry } from '../registry/integration-registry.js'
import type { DependencyStateData, PluginDependencyEntry } from '../types.js'
import { DependencyError } from '../errors.js'

interface CloudPlugin {
  name?: string
  version?: string
  enabled?: boolean
  configuration?: Record<string, unknown>
  interfaces?: Record<string, { integrationAlias?: string; integrationInterfaceAlias?: string }>
}

interface PluginSpec {
  name: string
  version?: string
  dependencies?: { interfaces?: Record<string, { name: string }> }
}

export interface PluginResolverOptions {
  registry: PluginRegistry
  integrationRegistry: IntegrationRegistry
  client: Client
}

export class PluginResolver {
  private readonly registry: PluginRegistry
  private readonly integrationRegistry: IntegrationRegistry
  private readonly client: Client

  constructor(opts: PluginResolverOptions) {
    this.registry = opts.registry
    this.integrationRegistry = opts.integrationRegistry
    this.client = opts.client
  }

  toDependencyEntry(cloud: CloudPlugin): PluginDependencyEntry {
    const dependencies: Record<string, { integrationAlias: string }> = {}
    for (const [ifaceAlias, dep] of Object.entries(cloud.interfaces ?? {})) {
      if (dep.integrationAlias) {
        dependencies[ifaceAlias] = { integrationAlias: dep.integrationAlias }
      }
    }
    return {
      name: cloud.name ?? '',
      version: cloud.version ?? '0.0.0',
      enabled: cloud.enabled ?? true,
      config: cloud.configuration ?? {},
      dependencies,
    }
  }

  async applyToCloud(opts: {
    botId: string
    alias: string
    entry: PluginDependencyEntry
    state: DependencyStateData
  }): Promise<void> {
    const pluginSpec = (await this.registry.getSpec(opts.entry.name, opts.entry.version)) as PluginSpec & {
      id?: string
    }
    const requiredInterfaces = pluginSpec.dependencies?.interfaces ?? {}
    const resolvedInterfaces: Record<
      string,
      { integrationId: string; integrationAlias: string; integrationInterfaceAlias: string }
    > = {}

    for (const [pluginIfaceAlias, requirement] of Object.entries(requiredInterfaces)) {
      const dep = opts.entry.dependencies[pluginIfaceAlias]
      if (!dep) {
        throw new DependencyError({
          code: 'MISSING_DEPENDENCY',
          message: `Plugin '${opts.alias}' is missing dependency '${pluginIfaceAlias}' (needs an integration implementing '${requirement.name}')`,
          details: { plugin: opts.alias, pluginInterfaceAlias: pluginIfaceAlias, interfaceName: requirement.name },
        })
      }
      const integration = opts.state.integrations[dep.integrationAlias]
      if (!integration) {
        throw new DependencyError({
          code: 'MISSING_DEPENDENCY',
          message: `Plugin '${opts.alias}' references integration alias '${dep.integrationAlias}' which is not installed`,
          details: { plugin: opts.alias, integrationAlias: dep.integrationAlias },
          suggestion: `Run: adk integrations add ${dep.integrationAlias}`,
        })
      }
      const integrationSpec = await this.integrationRegistry.getSpec(integration.name, integration.version)
      const integrationIfaceAlias = Object.entries(integrationSpec.interfaces ?? {}).find(
        ([, def]) => def.name === requirement.name
      )?.[0]
      if (!integrationIfaceAlias) {
        throw new DependencyError({
          code: 'INTERFACE_NOT_IMPLEMENTED',
          message: `Integration '${integration.name}' does not implement interface '${requirement.name}' required by plugin '${opts.alias}'`,
          details: { integration: integration.name, interfaceName: requirement.name },
        })
      }
      resolvedInterfaces[pluginIfaceAlias] = {
        integrationId: integrationSpec.id,
        integrationAlias: dep.integrationAlias,
        integrationInterfaceAlias: integrationIfaceAlias,
      }
    }

    const pluginId = pluginSpec.id
    if (!pluginId) {
      throw new DependencyError({
        code: 'PLUGIN_NOT_FOUND',
        message: `Could not resolve plugin id for ${opts.entry.name}@${opts.entry.version}`,
      })
    }

    await this.client.updateBot({
      id: opts.botId,
      plugins: {
        [opts.alias]: {
          id: pluginId,
          enabled: opts.entry.enabled,
          configuration: opts.entry.config as Record<string, unknown>,
          interfaces: resolvedInterfaces,
        },
      },
    })
  }

  async removeFromCloud(opts: { botId: string; alias: string }): Promise<void> {
    await this.client.updateBot({ id: opts.botId, plugins: { [opts.alias]: null } })
  }
}
