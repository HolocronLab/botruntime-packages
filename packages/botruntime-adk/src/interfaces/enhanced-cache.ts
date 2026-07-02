import { ResolutionCache } from '../dependencies/catalog/resolution-cache.js'
import { InterfaceDefinition } from './types.js'

interface VersionResolution {
  interfaceId: string
  updatedAt: string
  cachedAt: string
}

/**
 * Two-level interface cache. Since WS4 this is a thin shim over the unified
 * {@link ResolutionCache}; the on-disk layout (`~/.adk/cache/interfaces/…`), key
 * sanitization, 5-min resolution TTL, and the `interfaceId` resolution field are
 * preserved byte-for-byte. Kept as a public export for compatibility.
 */
export class EnhancedInterfaceCache {
  private readonly cache: ResolutionCache<InterfaceDefinition>

  constructor(noCache: boolean = false) {
    this.cache = new ResolutionCache<InterfaceDefinition>({ cacheType: 'interfaces', idField: 'interfaceId' }, noCache)
  }

  async getResolution(name: string, version: string, workspace?: string): Promise<VersionResolution | null> {
    const resolution = await this.cache.getResolution(name, version, workspace)
    if (!resolution) return null
    return { interfaceId: resolution.id, updatedAt: resolution.updatedAt, cachedAt: resolution.cachedAt }
  }

  async setResolution(
    name: string,
    version: string,
    workspace: string | undefined,
    interfaceId: string,
    updatedAt: string
  ): Promise<void> {
    await this.cache.setResolution(name, version, workspace, interfaceId, updatedAt)
  }

  async getDefinition(interfaceId: string, updatedAt: string): Promise<InterfaceDefinition | null> {
    return this.cache.getDefinition(interfaceId, updatedAt)
  }

  async setDefinition(interfaceId: string, updatedAt: string, definition: InterfaceDefinition): Promise<void> {
    await this.cache.setDefinition(interfaceId, updatedAt, definition)
  }

  async clear(): Promise<void> {
    await this.cache.clear()
  }

  async getStats(): Promise<{
    resolutions: { count: number; sizeBytes: number }
    definitions: { count: number; sizeBytes: number }
  }> {
    return this.cache.getStats()
  }
}
