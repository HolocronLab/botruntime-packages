import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

export interface CatalogCacheAuthority {
  apiUrl: string
  workspaceId: string
}

/**
 * A resolved (name@version) → (id, updatedAt) mapping. The on-disk field that
 * holds the id is type-specific (`integrationId` / `interfaceId` / `pluginId`)
 * for byte-compatibility with caches written by the pre-WS4 managers; callers
 * always see the uniform `id`.
 */
export interface VersionResolution {
  id: string
  updatedAt: string
  cachedAt: string
}

export interface ResolutionCacheConfig {
  /** Subdirectory under the cache root — `integrations` | `interfaces` | `plugins`. */
  cacheType: string
  /**
   * Field name the resolution value is stored under on disk. Kept type-specific
   * (e.g. `integrationId`) so the unified cache reads/writes byte-identically to
   * the three separate caches it replaces — no cache invalidation on upgrade.
   */
  idField: string
  /**
   * Cache root directory. Defaults to `~/.adk/cache` (the production path the
   * pre-WS4 caches used); overridable only so tests can run against a temp dir
   * without mocking `os.homedir()`.
   */
  cacheRoot?: string
  /** Explicit non-secret server authority. Scoped caches never read legacy data. */
  authority?: CatalogCacheAuthority
  /** Disable both reads and writes when no safe cache authority exists. */
  disabled?: boolean
}

/** Resolution entries are a short-lived perf hint; definitions are immutable. */
const RESOLUTION_TTL_MINUTES = 5

interface CachedDefinition<TDef> {
  definition: TDef
  cachedAt: string
}

/**
 * Generic two-level on-disk catalog cache, unifying the three byte-identical
 * `Enhanced{Integration,Interface,Plugin}Cache` classes.
 *
 * - **Resolution cache** (`resolutions/`): `name@version[+workspace]` →
 *   `{ id, updatedAt }`, {@link RESOLUTION_TTL_MINUTES}-minute TTL (checked on
 *   read; stale entries silently miss).
 * - **Definition cache** (`definitions/`): `id+updatedAt` → full definition, no
 *   expiry — the `(id, updatedAt)` tuple is content-addressed (same tuple ⇒ same
 *   spec), so it is immutable by contract.
 *
 * Paths, key sanitization (`[^a-zA-Z0-9_-] → _`), TTL, and compact JSON
 * serialization match the pre-WS4 caches exactly. `noCache` disables reads (and,
 * matching the old behavior, still allows writes through `set*`).
 */
export class ResolutionCache<TDef> {
  private readonly cacheDir: string
  private readonly resolutionsDir: string
  private readonly definitionsDir: string
  private readonly idField: string
  private readonly noCache: boolean
  private readonly disabled: boolean

  constructor(config: ResolutionCacheConfig, noCache: boolean = false) {
    this.idField = config.idField
    this.noCache = noCache
    this.disabled = config.disabled ?? false
    const cacheRoot = config.cacheRoot ?? path.join(os.homedir(), '.adk', 'cache')
    const authority = normalizeAuthority(config.authority)
    this.cacheDir = authority
      ? path.join(cacheRoot, config.cacheType, 'authorities', authorityKey(authority))
      : path.join(cacheRoot, config.cacheType)
    this.resolutionsDir = path.join(this.cacheDir, 'resolutions')
    this.definitionsDir = path.join(this.cacheDir, 'definitions')
  }

  private async ensureCacheDirs(): Promise<void> {
    await fs.mkdir(this.resolutionsDir, { recursive: true })
    await fs.mkdir(this.definitionsDir, { recursive: true })
  }

  /**
   * @param allowStale when true, ignore the {@link RESOLUTION_TTL_MINUTES} TTL and
   *   return an expired entry. Used by the cloud-failure fallback so a stale-but-
   *   present resolution can recover a cached definition instead of hard-failing.
   */
  async getResolution(
    name: string,
    version: string,
    workspace?: string,
    options?: { allowStale?: boolean }
  ): Promise<VersionResolution | null> {
    if (this.noCache || this.disabled) {
      return null
    }

    try {
      const key = this.getResolutionKey(name, version, workspace)
      const cachePath = path.join(this.resolutionsDir, `${key}.json`)

      const data = await fs.readFile(cachePath, 'utf-8')
      const raw = JSON.parse(data) as Record<string, string>

      if (!options?.allowStale) {
        const cachedAt = new Date(raw.cachedAt!)
        const ageMinutes = (Date.now() - cachedAt.getTime()) / (1000 * 60)
        if (ageMinutes > RESOLUTION_TTL_MINUTES) {
          return null
        }
      }

      const id = raw[this.idField]
      if (!id) {
        return null
      }
      return { id, updatedAt: raw.updatedAt!, cachedAt: raw.cachedAt! }
    } catch {
      return null
    }
  }

  async setResolution(
    name: string,
    version: string,
    workspace: string | undefined,
    id: string,
    updatedAt: string
  ): Promise<void> {
    if (this.disabled) return
    await this.ensureCacheDirs()

    const key = this.getResolutionKey(name, version, workspace)
    const cachePath = path.join(this.resolutionsDir, `${key}.json`)

    // Store the id under the type-specific field name for byte-compatibility.
    const resolution: Record<string, string> = {
      [this.idField]: id,
      updatedAt,
      cachedAt: new Date().toISOString(),
    }

    await fs.writeFile(cachePath, JSON.stringify(resolution))
  }

  async getDefinition(id: string, updatedAt: string): Promise<TDef | null> {
    if (this.noCache || this.disabled) {
      return null
    }

    try {
      const key = this.getDefinitionKey(id, updatedAt)
      const cachePath = path.join(this.definitionsDir, `${key}.json`)

      const data = await fs.readFile(cachePath, 'utf-8')
      const cached = JSON.parse(data) as CachedDefinition<TDef>

      return cached.definition
    } catch {
      return null
    }
  }

  async setDefinition(id: string, updatedAt: string, definition: TDef): Promise<void> {
    if (this.disabled) return
    await this.ensureCacheDirs()

    const key = this.getDefinitionKey(id, updatedAt)
    const cachePath = path.join(this.definitionsDir, `${key}.json`)

    const cached: CachedDefinition<TDef> = {
      definition,
      cachedAt: new Date().toISOString(),
    }

    await fs.writeFile(cachePath, JSON.stringify(cached))
  }

  async clear(): Promise<void> {
    try {
      const resolutionFiles = await fs.readdir(this.resolutionsDir)
      await Promise.all(resolutionFiles.map((file) => fs.unlink(path.join(this.resolutionsDir, file))))

      const definitionFiles = await fs.readdir(this.definitionsDir)
      await Promise.all(definitionFiles.map((file) => fs.unlink(path.join(this.definitionsDir, file))))
    } catch {
      // Ignore errors if directories don't exist
    }
  }

  async getStats(): Promise<{
    resolutions: { count: number; sizeBytes: number }
    definitions: { count: number; sizeBytes: number }
  }> {
    const getDirectoryStats = async (dir: string) => {
      try {
        const files = await fs.readdir(dir)
        let totalSize = 0

        for (const file of files) {
          const stats = await fs.stat(path.join(dir, file))
          totalSize += stats.size
        }

        return { count: files.length, sizeBytes: totalSize }
      } catch {
        return { count: 0, sizeBytes: 0 }
      }
    }

    const [resolutions, definitions] = await Promise.all([
      getDirectoryStats(this.resolutionsDir),
      getDirectoryStats(this.definitionsDir),
    ])

    return { resolutions, definitions }
  }

  private getResolutionKey(name: string, version: string, workspace?: string): string {
    const prefix = workspace ? `${workspace}_` : ''
    const key = `${prefix}${name}_${version}`
    return key.replace(/[^a-zA-Z0-9_-]/g, '_')
  }

  private getDefinitionKey(id: string, updatedAt: string): string {
    const key = `${id}_${updatedAt}`
    return key.replace(/[^a-zA-Z0-9_-]/g, '_')
  }
}

function normalizeAuthority(authority?: CatalogCacheAuthority): CatalogCacheAuthority | undefined {
  if (!authority) return undefined
  const apiUrl = authority.apiUrl.replace(/\/+$/, '')
  const workspaceId = authority.workspaceId.trim()
  if (!apiUrl || !workspaceId) return undefined
  return { apiUrl, workspaceId }
}

function authorityKey(authority: CatalogCacheAuthority): string {
  return crypto.createHash('sha256').update(JSON.stringify(authority)).digest('hex').slice(0, 32)
}
