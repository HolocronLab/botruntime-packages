import { AdkError } from '@holocronlab/botruntime-analytics'
import type { Agent0CatalogModel, Agent0Warning, Agent0ProviderCatalogEntry } from '../types.js'
import {
  fetchBotpressCognitiveModels,
  toCognitiveModelKey,
  type BotpressCognitiveModelsFetch,
} from '../../cognitive/models.js'
import { listAgent0ProviderCatalog } from './catalog.js'

const DEFAULT_MODELS_DEV_API_URL = 'https://models.dev/api.json'
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000
const DEFAULT_MODELS_DEV_FETCH_TIMEOUT_MS = 10_000

export interface Agent0ProviderCatalogSourceListOptions {
  refresh?: boolean
}

export interface Agent0ProviderCatalogSourceModelResult {
  models: Agent0CatalogModel[]
  warnings: Agent0Warning[]
}

export interface Agent0ProviderCatalogSource {
  readonly id?: string
  listProviders(): Promise<Agent0ProviderCatalogEntry[]>
  listModels(options?: Agent0ProviderCatalogSourceListOptions): Promise<Agent0CatalogModel[]>
  listModelsWithStatus?(
    options?: Agent0ProviderCatalogSourceListOptions
  ): Promise<Agent0ProviderCatalogSourceModelResult>
  refresh?(): Promise<void>
}

export interface Agent0CompositeProviderCatalogSourceOptions {
  sources: Agent0ProviderCatalogSource[]
}

export interface Agent0CognitiveAuth {
  token?: string
  botId?: string
  apiUrl?: string
}

export interface Agent0CognitiveCatalogSourceOptions {
  auth?: Agent0CognitiveAuth
  resolveAuth?: () => Promise<Agent0CognitiveAuth | undefined>
  fetch?: BotpressCognitiveModelsFetch
  now?: () => number
  cacheTtlMs?: number
  timeoutMs?: number
}

export interface Agent0DefaultProviderCatalogSourceOptions {
  cognitive?: Agent0CognitiveCatalogSourceOptions
  modelsDev?: Agent0ModelsDevCatalogSourceOptions
}

export interface Agent0ModelsDevFetchResponse {
  ok: boolean
  status: number
  text(): Promise<string>
}

export type Agent0ModelsDevFetch = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal }
) => Promise<Agent0ModelsDevFetchResponse>

export interface Agent0ModelsDevCatalogSourceOptions {
  url?: string
  fetch?: Agent0ModelsDevFetch
  now?: () => number
  cacheTtlMs?: number
  timeoutMs?: number
  userAgent?: string
}

/**
 * The provider catalog comes from an external service (models.dev); fetch,
 * parse, and shape failures are all environment conditions — callers fall
 * back to the bundled static catalog.
 */
export class Agent0ProviderCatalogSourceError extends AdkError<'AGENT0_PROVIDER_CATALOG_UNAVAILABLE'> {
  constructor(message: string, cause?: unknown) {
    super({ code: 'AGENT0_PROVIDER_CATALOG_UNAVAILABLE', message, expected: true, cause })
  }
}

export class Agent0CompositeProviderCatalogSource implements Agent0ProviderCatalogSource {
  readonly id = 'agent0-composite'
  private readonly sources: Agent0ProviderCatalogSource[]

  constructor(options: Agent0CompositeProviderCatalogSourceOptions) {
    this.sources = options.sources
  }

  async listProviders(): Promise<Agent0ProviderCatalogEntry[]> {
    return listAgent0ProviderCatalog()
  }

  async listModels(options: Agent0ProviderCatalogSourceListOptions = {}): Promise<Agent0CatalogModel[]> {
    return (await this.listModelsWithStatus(options)).models
  }

  async listModelsWithStatus(
    options: Agent0ProviderCatalogSourceListOptions = {}
  ): Promise<Agent0ProviderCatalogSourceModelResult> {
    const results = await Promise.all(this.sources.map((source) => listSourceModelsWithStatus(source, options)))
    return {
      models: results.flatMap((result) => result.models),
      warnings: results.flatMap((result) => result.warnings),
    }
  }

  async refresh(): Promise<void> {
    await this.listModels({ refresh: true })
  }
}

export class Agent0CognitiveCatalogSource implements Agent0ProviderCatalogSource {
  readonly id = 'cognitive'
  private readonly auth: Agent0CognitiveAuth | undefined
  private readonly resolveAuth: (() => Promise<Agent0CognitiveAuth | undefined>) | undefined
  private readonly fetchImpl: BotpressCognitiveModelsFetch | undefined
  private readonly now: () => number
  private readonly cacheTtlMs: number
  private readonly timeoutMs: number | undefined
  private cache: { authKey: string; expiresAt: number; models: Agent0CatalogModel[] } | undefined

  constructor(options: Agent0CognitiveCatalogSourceOptions = {}) {
    this.auth = options.auth
    this.resolveAuth = options.resolveAuth
    this.fetchImpl = options.fetch
    this.now = options.now ?? (() => Date.now())
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.timeoutMs = options.timeoutMs
  }

  async listProviders(): Promise<Agent0ProviderCatalogEntry[]> {
    return listAgent0ProviderCatalog()
  }

  async listModels(options: Agent0ProviderCatalogSourceListOptions = {}): Promise<Agent0CatalogModel[]> {
    return (await this.listModelsWithStatus(options)).models
  }

  async listModelsWithStatus(
    options: Agent0ProviderCatalogSourceListOptions = {}
  ): Promise<Agent0ProviderCatalogSourceModelResult> {
    const auth = await this.getAuth()
    if (!auth?.token || !auth.botId) {
      return { models: [], warnings: [] }
    }
    const cognitiveAuth = { ...auth, token: auth.token, botId: auth.botId }
    const authKey = getCognitiveAuthCacheKey(cognitiveAuth)
    if (!options.refresh && this.cache?.authKey === authKey && this.cache.expiresAt > this.now()) {
      return { models: cloneModels(this.cache.models), warnings: [] }
    }

    const models = await fetchBotpressCognitiveModels({
      token: cognitiveAuth.token,
      botId: cognitiveAuth.botId,
      apiUrl: cognitiveAuth.apiUrl,
      fetch: this.fetchImpl,
      timeoutMs: this.timeoutMs,
    })

    if (!models) {
      return {
        models: [],
        warnings: [
          {
            code: 'CATALOG_SOURCE_UNAVAILABLE',
            source: this.id,
            message: 'Botpress Cognitive model catalog is unavailable',
          },
        ],
      }
    }

    const mapped = models.map((model) => ({
      providerId: 'cognitive',
      modelId: toCognitiveModelKey(model.id),
      name: model.name,
      contextWindow: model.input?.maxTokens,
      outputLimit: model.output?.maxTokens,
      inputCostPer1MTokens: model.input?.costPer1MTokens,
      outputCostPer1MTokens: model.output?.costPer1MTokens,
      tags: model.tags ? [...model.tags] : undefined,
    }))
    this.cache = {
      authKey,
      expiresAt: this.now() + this.cacheTtlMs,
      models: mapped,
    }

    return {
      models: cloneModels(mapped),
      warnings: [],
    }
  }

  async refresh(): Promise<void> {
    await this.listModels({ refresh: true })
  }

  private async getAuth(): Promise<Agent0CognitiveAuth | undefined> {
    try {
      return this.auth ?? (await this.resolveAuth?.())
    } catch {
      return undefined
    }
  }
}

export class Agent0ModelsDevCatalogSource implements Agent0ProviderCatalogSource {
  readonly id = 'models.dev'
  private readonly url: string
  private readonly fetchImpl: Agent0ModelsDevFetch
  private readonly now: () => number
  private readonly cacheTtlMs: number
  private readonly timeoutMs: number
  private readonly userAgent: string
  private cache: { expiresAt: number; models: Agent0CatalogModel[] } | undefined

  constructor(options: Agent0ModelsDevCatalogSourceOptions = {}) {
    this.url = options.url ?? DEFAULT_MODELS_DEV_API_URL
    this.fetchImpl = options.fetch ?? ((url, init) => fetch(url, init))
    this.now = options.now ?? (() => Date.now())
    this.cacheTtlMs = options.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS
    this.timeoutMs = options.timeoutMs ?? DEFAULT_MODELS_DEV_FETCH_TIMEOUT_MS
    this.userAgent = options.userAgent ?? '@holocronlab/botruntime-adk-agent0'
  }

  async listProviders(): Promise<Agent0ProviderCatalogEntry[]> {
    return listAgent0ProviderCatalog()
  }

  async listModels(options: Agent0ProviderCatalogSourceListOptions = {}): Promise<Agent0CatalogModel[]> {
    if (!options.refresh && this.cache && this.cache.expiresAt > this.now()) {
      return cloneModels(this.cache.models)
    }

    const data = await this.fetchModelsDevCatalog()
    const models = mapModelsDevCatalog(data, await this.listProviders())
    this.cache = {
      expiresAt: this.now() + this.cacheTtlMs,
      models,
    }
    return cloneModels(models)
  }

  async refresh(): Promise<void> {
    await this.listModels({ refresh: true })
  }

  private async fetchModelsDevCatalog(): Promise<unknown> {
    let text: string
    try {
      const init: { headers: Record<string, string>; signal?: AbortSignal } = {
        headers: {
          Accept: 'application/json',
          'User-Agent': this.userAgent,
        },
      }
      if (this.timeoutMs > 0) init.signal = AbortSignal.timeout(this.timeoutMs)

      const response = await this.fetchImpl(this.url, init)
      if (!response.ok) {
        throw new Error(`models.dev responded with HTTP ${response.status}`)
      }
      text = await response.text()
    } catch (error) {
      throw new Agent0ProviderCatalogSourceError('Failed to fetch Agent(0) provider models', error)
    }

    try {
      return JSON.parse(text)
    } catch (error) {
      throw new Agent0ProviderCatalogSourceError('Failed to parse Agent(0) provider models', error)
    }
  }
}

export function mapModelsDevCatalog(
  data: unknown,
  providers: Agent0ProviderCatalogEntry[] = listAgent0ProviderCatalog()
): Agent0CatalogModel[] {
  if (!isRecord(data)) {
    throw new Agent0ProviderCatalogSourceError('models.dev catalog must be an object')
  }

  const models: Agent0CatalogModel[] = []
  for (const provider of providers) {
    if (provider.modelSource?.type !== 'models.dev') continue

    const source = data[provider.modelSource.providerId ?? provider.id]
    if (!isRecord(source)) continue

    const sourceModels = source.models
    if (!isRecord(sourceModels)) continue

    for (const [key, value] of Object.entries(sourceModels)) {
      if (!isRecord(value)) continue
      if (value.status === 'deprecated') continue

      const modelId = nonEmptyString(value.id) ?? key
      const limit = isRecord(value.limit) ? value.limit : undefined
      const cost = isRecord(value.cost) ? value.cost : undefined
      const tags = value.reasoning === true ? ['reasoning'] : undefined

      models.push({
        providerId: provider.id,
        modelId,
        name: nonEmptyString(value.name) ?? modelId,
        contextWindow: finiteNumber(limit?.context),
        outputLimit: finiteNumber(limit?.output),
        inputCostPer1MTokens: finiteNumber(cost?.input),
        outputCostPer1MTokens: finiteNumber(cost?.output),
        tags,
      })
    }
  }

  return models
}

function cloneModels(models: Agent0CatalogModel[]): Agent0CatalogModel[] {
  return models.map((model) => ({
    ...model,
    tags: model.tags ? [...model.tags] : undefined,
  }))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

async function listSourceModelsWithStatus(
  source: Agent0ProviderCatalogSource,
  options: Agent0ProviderCatalogSourceListOptions
): Promise<Agent0ProviderCatalogSourceModelResult> {
  try {
    if (source.listModelsWithStatus) return await source.listModelsWithStatus(options)
    return {
      models: await source.listModels(options),
      warnings: [],
    }
  } catch (error) {
    return {
      models: [],
      warnings: [toSourceUnavailableWarning(source, error)],
    }
  }
}

function getCognitiveAuthCacheKey(auth: Agent0CognitiveAuth & { token: string; botId: string }) {
  return JSON.stringify({
    apiUrl: auth.apiUrl ?? '',
    botId: auth.botId,
    token: auth.token,
  })
}

function toSourceUnavailableWarning(source: Agent0ProviderCatalogSource, error: unknown): Agent0Warning {
  return {
    code: 'CATALOG_SOURCE_UNAVAILABLE',
    source: source.id ?? 'unknown',
    message: error instanceof Error ? error.message : 'Provider model catalog source is unavailable',
  }
}

export function createAgent0DefaultProviderCatalogSource(
  options: Agent0DefaultProviderCatalogSourceOptions = {}
): Agent0ProviderCatalogSource {
  return new Agent0CompositeProviderCatalogSource({
    sources: [new Agent0CognitiveCatalogSource(options.cognitive), new Agent0ModelsDevCatalogSource(options.modelsDev)],
  })
}
