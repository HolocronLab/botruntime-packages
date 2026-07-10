import { AdkError } from '@holocronlab/botruntime-analytics'
import {
  ResolutionCache,
  type CatalogCacheAuthority,
  type ResolutionCacheConfig,
} from './resolution-cache.js'

/** A catalog ref always carries a name + version, and optionally a workspace scope. */
export interface CatalogRef {
  name: string
  version: string
  workspace?: string
}

/** The identity + definition a source resolves a ref to. */
export interface ResolvedSpec<TDef> {
  id: string
  updatedAt: string
  definition: TDef
}

/**
 * The per-type cloud-fetch logic (integrations, plugins, interfaces). A source
 * knows how to turn a ref into a definition from cloud and how to build a typed,
 * actionable error when the ref can't be resolved — but it owns no caching. That
 * lives once in {@link CatalogService}.
 */
export interface CatalogSource<TDef, TRef extends CatalogRef = CatalogRef> {
  /** Cache bucket + on-disk id-field name for this resource type. */
  readonly cacheConfig: ResolutionCacheConfig
  /**
   * Resolve a ref to its identity + definition from cloud. MUST throw a typed
   * `AdkError` (not return null) when the ref cannot be resolved, so the caller
   * gets an actionable message.
   */
  fetchByRef(ref: TRef): Promise<ResolvedSpec<TDef>>
}

/**
 * Generic catalog fetch + cache orchestration, unifying the
 * `fetch{Integration,Plugin,Interface}` methods the three managers each
 * duplicated: check the two-level {@link ResolutionCache}, fall through to the
 * source on a miss, then write both cache levels. The type-specific cloud calls
 * and search/list operations live on the concrete {@link CatalogSource}; only the
 * cache-orchestrated definition fetch is generic here.
 */
export class CatalogService<TDef, TRef extends CatalogRef = CatalogRef> {
  readonly cache: ResolutionCache<TDef>

  constructor(
    private readonly source: CatalogSource<TDef, TRef>,
    noCache: boolean = false,
    authority?: CatalogCacheAuthority,
    private readonly validateAuthority?: () => Promise<void>,
    cacheDisabled: boolean = false
  ) {
    this.cache = new ResolutionCache<TDef>({ ...source.cacheConfig, authority, disabled: cacheDisabled }, noCache)
  }

  /** Fetch a definition by ref, preferring the cache (resolution → definition). */
  async getDefinition(ref: TRef): Promise<TDef> {
    await this.validateAuthority?.()
    // Level 1: version-resolution cache (name@version → id + updatedAt).
    const cachedResolution = await this.cache.getResolution(ref.name, ref.version, ref.workspace)
    if (cachedResolution) {
      // Level 2: immutable definition cache (id + updatedAt → definition).
      const cachedDefinition = await this.cache.getDefinition(cachedResolution.id, cachedResolution.updatedAt)
      if (cachedDefinition) {
        return cachedDefinition
      }
    }

    try {
      const { id, updatedAt, definition } = await this.source.fetchByRef(ref)
      await this.cache.setResolution(ref.name, ref.version, ref.workspace, id, updatedAt)
      await this.cache.setDefinition(id, updatedAt, definition)
      return definition
    } catch (err) {
      // Cloud-failure resilience (WS4): a present-but-stale cached definition is a
      // better outcome than failing the build/load on a TRANSIENT outage. But a
      // deliberate, user-actionable failure — the source's typed `*_NOT_FOUND`
      // (an `expected` AdkError) — must surface unmasked: hiding it behind a stale
      // def would let a mutation (resolver → getSpec → here) proceed against a
      // dangling id, and would swallow the clear "not found" message. So only fall
      // back for non-`expected` (transient/unexpected) errors.
      if (!(err instanceof AdkError && err.expected)) {
        const stale = await this.getStaleDefinition(ref)
        if (stale !== null) {
          return stale
        }
      }
      throw err
    }
  }

  /** Read a cached definition ignoring the resolution TTL, or null if none is cached. */
  private async getStaleDefinition(ref: TRef): Promise<TDef | null> {
    const stale = await this.cache.getResolution(ref.name, ref.version, ref.workspace, { allowStale: true })
    if (!stale) return null
    return this.cache.getDefinition(stale.id, stale.updatedAt)
  }

  /** Combined resolution + definition cache stats (matches the managers' getCacheStats). */
  async getCacheStats(): Promise<{ count: number; sizeBytes: number }> {
    const stats = await this.cache.getStats()
    return {
      count: stats.resolutions.count + stats.definitions.count,
      sizeBytes: stats.resolutions.sizeBytes + stats.definitions.sizeBytes,
    }
  }

  async clearCache(): Promise<void> {
    await this.cache.clear()
  }
}
