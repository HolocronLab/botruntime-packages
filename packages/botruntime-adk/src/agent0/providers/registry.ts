import { AdkError } from '@holocronlab/botruntime-analytics'
import type {
  Agent0AvailableModel,
  Agent0CatalogModel,
  Agent0Warning,
  Agent0ModelListResult,
  Agent0ProviderApiKeyAuth,
  Agent0ProviderCatalogEntry,
  Agent0ProviderConnection,
  Agent0ProviderConnectionRedacted,
  Agent0ProviderListResult,
  Agent0ProviderId,
  Agent0ProviderView,
  Agent0Config,
} from '../types.js'
import { Agent0ConfigError, Agent0ConfigStore } from '../config/store.js'
import { createDefaultAgent0Config } from '../config/schema.js'
import { hasAgent0ProviderAuth, redactAgent0Config } from '../config/secrets.js'
import { listAgent0ProviderCatalog, requireAgent0ProviderCatalogEntry, toAgent0AvailableModel } from './catalog.js'
import {
  createAgent0DefaultProviderCatalogSource,
  type Agent0DefaultProviderCatalogSourceOptions,
  type Agent0ProviderCatalogSource,
} from './source.js'

export interface Agent0ProviderRegistryOptions {
  store?: Agent0ConfigStore
  catalogSource?: Agent0ProviderCatalogSource
  catalogSourceOptions?: Agent0DefaultProviderCatalogSourceOptions
  now?: () => Date
}

export interface Agent0ProviderAuthInput {
  apiKey: string
  baseURL?: string
  enabled?: boolean
}

export class Agent0ProviderRegistry {
  private readonly store: Agent0ConfigStore
  private readonly catalogSource: Agent0ProviderCatalogSource
  private readonly now: () => Date

  constructor(options: Agent0ProviderRegistryOptions = {}) {
    this.store = options.store ?? new Agent0ConfigStore()
    this.catalogSource = options.catalogSource ?? createAgent0DefaultProviderCatalogSource(options.catalogSourceOptions)
    this.now = options.now ?? (() => new Date())
  }

  async listProviders(): Promise<Agent0ProviderView[]> {
    return (await this.listProvidersWithStatus()).providers
  }

  async listProvidersWithStatus(): Promise<Agent0ProviderListResult> {
    const [configResult, catalog, modelResult] = await Promise.all([
      this.readConfigWithStatus(),
      this.listCatalogProviders(),
      this.listCatalogModelsWithStatus(),
    ])
    const { config } = configResult
    const redacted = redactAgent0Config(config)
    const modelCounts = countModelsByProvider(modelResult.models)

    const providers = catalog.map((entry) => {
      const connection = redacted.providers[entry.id]
      const stored = config.providers[entry.id]
      const connected = entry.auth.type === 'none' || hasAgent0ProviderAuth(stored)
      const enabled = connection?.enabled ?? entry.enabledByDefault

      return {
        id: entry.id,
        name: entry.name,
        displayName: entry.displayName,
        description: entry.description,
        firstParty: entry.firstParty,
        status: entry.status,
        enabled,
        connected,
        auth: entry.auth,
        connection,
        modelCount: modelCounts.get(entry.id) ?? 0,
      }
    })

    return { providers, warnings: [...configResult.warnings, ...modelResult.warnings] }
  }

  async listModels(): Promise<Agent0AvailableModel[]> {
    return (await this.listModelsWithStatus()).models
  }

  async listModelsWithStatus(): Promise<Agent0ModelListResult> {
    const [configResult, catalog, catalogModelResult] = await Promise.all([
      this.readConfigWithStatus(),
      this.listCatalogProviders(),
      this.listCatalogModelsWithStatus(),
    ])
    const { config } = configResult
    const entries = new Map(catalog.map((entry) => [entry.id, entry]))
    const models: Agent0AvailableModel[] = []

    for (const model of catalogModelResult.models) {
      const entry = entries.get(model.providerId)
      if (!entry) continue
      if (!this.isProviderUsable(entry, config.providers[entry.id])) continue
      models.push(toAgent0AvailableModel(entry, model))
    }

    return { models, warnings: [...configResult.warnings, ...catalogModelResult.warnings] }
  }

  async putProviderAuth(
    providerId: Agent0ProviderId,
    input: Agent0ProviderAuthInput
  ): Promise<Agent0ProviderConnectionRedacted> {
    const entry = requireAgent0ProviderCatalogEntry(providerId)
    if (entry.auth.type !== 'api_key') {
      throw new AdkError({
        code: 'AGENT0_PROVIDER_KEY_UNSUPPORTED',
        message: `Agent(0) provider ${providerId} does not support API-key authentication`,
        expected: true,
      })
    }

    const now = this.now().toISOString()
    const config = await this.store.update((draft) => {
      const existing = draft.providers[providerId]
      draft.providers[providerId] = {
        providerId,
        enabled: input.enabled ?? existing?.enabled ?? true,
        auth: compactAuth({
          type: 'api_key',
          apiKey: input.apiKey,
          baseURL: input.baseURL,
        }),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
    })

    return redactAgent0Config(config).providers[providerId]!
  }

  async removeProviderAuth(providerId: Agent0ProviderId): Promise<Agent0ProviderConnectionRedacted | undefined> {
    requireAgent0ProviderCatalogEntry(providerId)
    const now = this.now().toISOString()
    const config = await this.store.update((draft) => {
      const existing = draft.providers[providerId]
      if (!existing) return
      draft.providers[providerId] = {
        ...existing,
        auth: undefined,
        updatedAt: now,
      }
    })

    return redactAgent0Config(config).providers[providerId]
  }

  async setProviderEnabled(providerId: Agent0ProviderId, enabled: boolean): Promise<Agent0ProviderConnectionRedacted> {
    const entry = requireAgent0ProviderCatalogEntry(providerId)
    if (enabled && entry.status !== 'available') {
      throw new AdkError({
        code: 'AGENT0_PROVIDER_UNAVAILABLE',
        message: `Agent(0) provider ${providerId} is not available yet`,
        expected: true,
      })
    }
    const current = await this.store.read()
    if (enabled && entry.auth.type === 'api_key' && !hasAgent0ProviderAuth(current.providers[providerId])) {
      throw new AdkError({
        code: 'AGENT0_PROVIDER_NOT_CONNECTED',
        message: `Agent(0) provider ${providerId} must be connected before it can be enabled`,
        expected: true,
        suggestion: `Connect the ${providerId} provider before enabling it.`,
      })
    }

    const now = this.now().toISOString()
    const config = await this.store.update((draft) => {
      const existing = draft.providers[providerId]
      draft.providers[providerId] = {
        providerId,
        enabled,
        auth: existing?.auth,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
    })

    return redactAgent0Config(config).providers[providerId]!
  }

  private isProviderUsable(
    entry: Agent0ProviderCatalogEntry,
    connection: Agent0ProviderConnection | undefined
  ): boolean {
    if (entry.status !== 'available') return false
    const enabled = connection?.enabled ?? entry.enabledByDefault
    if (!enabled) return false
    if (entry.auth.type === 'none') return true
    return hasAgent0ProviderAuth(connection)
  }

  private async listCatalogProviders(): Promise<Agent0ProviderCatalogEntry[]> {
    try {
      return await this.catalogSource.listProviders()
    } catch {
      return listAgent0ProviderCatalog()
    }
  }

  private async readConfigWithStatus(): Promise<{ config: Agent0Config; warnings: Agent0Warning[] }> {
    try {
      return { config: await this.store.read(), warnings: [] }
    } catch (error) {
      if (!(error instanceof Agent0ConfigError)) throw error
      return {
        config: createDefaultAgent0Config(this.now()),
        warnings: [
          {
            code: 'CONFIG_UNAVAILABLE',
            source: 'agent0-config',
            message: 'Saved Agent(0) provider settings are unavailable.',
          },
        ],
      }
    }
  }

  private async listCatalogModelsWithStatus(): Promise<{
    models: Agent0CatalogModel[]
    warnings: Agent0Warning[]
  }> {
    try {
      if (this.catalogSource.listModelsWithStatus) {
        return await this.catalogSource.listModelsWithStatus()
      }
      return { models: await this.catalogSource.listModels(), warnings: [] }
    } catch (error) {
      return {
        models: [],
        warnings: [
          {
            code: 'CATALOG_SOURCE_UNAVAILABLE',
            source: this.catalogSource.id ?? 'unknown',
            message: error instanceof Error ? error.message : 'Provider model catalog source is unavailable',
          },
        ],
      }
    }
  }
}

function compactAuth(auth: Agent0ProviderApiKeyAuth): Agent0ProviderApiKeyAuth {
  const baseURL = auth.baseURL?.trim()
  return {
    type: auth.type,
    apiKey: auth.apiKey,
    ...(baseURL ? { baseURL } : {}),
  }
}

function countModelsByProvider(models: { providerId: Agent0ProviderId }[]): Map<Agent0ProviderId, number> {
  const counts = new Map<Agent0ProviderId, number>()
  for (const model of models) {
    counts.set(model.providerId, (counts.get(model.providerId) ?? 0) + 1)
  }
  return counts
}
