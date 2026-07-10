import crypto from 'crypto'
import fs from 'fs/promises'
import path from 'path'
import { AssetFile } from './types.js'
import { defaultAdkFolder } from '../const.js'

export interface AssetsCacheScope {
  environment: 'dev' | 'prod'
  botId?: string
  /** Non-secret server authority used to isolate equal bot IDs across stacks. */
  apiUrl?: string
  workspaceId?: string
}

export interface AssetsCacheManagerOptions {
  scope?: AssetsCacheScope
}

export interface AssetsCacheEntry {
  path: string
  localHash: string
  remoteHash: string
  metadata: AssetFile
  lastUpdated: string
}

export interface AssetsCache {
  version: string
  scope?: AssetsCacheScope
  entries: Record<string, AssetsCacheEntry>
}

export class AssetsCacheManager {
  private cachePath: string
  private cache: AssetsCache | null = null
  private scope?: AssetsCacheScope

  constructor(private projectPath: string, options: AssetsCacheManagerOptions = {}) {
    this.scope = normalizeScope(options.scope)
    this.cachePath = this.scope
      ? path.join(
          projectPath,
          defaultAdkFolder,
          'assets-cache',
          this.scope.environment,
          `${scopeTargetName(this.scope)}.json`
        )
      : path.join(projectPath, defaultAdkFolder, 'assets-cache.json')
  }

  async load(): Promise<AssetsCache> {
    if (this.cache) {
      return this.cache
    }

    try {
      const content = await fs.readFile(this.cachePath, 'utf-8')
      const parsed = JSON.parse(content) as AssetsCache
      if (!parsed || typeof parsed.entries !== 'object' || !this.matchesScope(parsed.scope)) {
        throw new Error('Invalid asset cache')
      }
      this.cache = parsed
      return this.cache!
    } catch {
      // Cache doesn't exist or is invalid, create new one
      this.cache = this.emptyCache()
      return this.cache
    }
  }

  async save(): Promise<void> {
    if (!this.cache) {
      return
    }

    const cacheDir = path.dirname(this.cachePath)
    await fs.mkdir(cacheDir, { recursive: true })
    await fs.writeFile(this.cachePath, JSON.stringify(this.cache, null, 2), 'utf-8')
  }

  async getEntry(assetPath: string): Promise<AssetsCacheEntry | null> {
    const cache = await this.load()
    return cache.entries[assetPath] || null
  }

  async setEntry(assetPath: string, localHash: string, remoteHash: string, metadata: AssetFile): Promise<void> {
    const cache = await this.load()
    cache.entries[assetPath] = {
      path: assetPath,
      localHash,
      remoteHash,
      metadata,
      lastUpdated: new Date().toISOString(),
    }
    await this.save()
  }

  async isStale(assetPath: string): Promise<boolean> {
    const entry = await this.getEntry(assetPath)
    if (!entry) return false
    return entry.localHash !== entry.remoteHash
  }

  async removeEntry(assetPath: string): Promise<void> {
    const cache = await this.load()
    delete cache.entries[assetPath]
    await this.save()
  }

  async clear(): Promise<void> {
    this.cache = this.emptyCache()
    await this.save()
  }

  async getAllEntries(): Promise<AssetsCacheEntry[]> {
    const cache = await this.load()
    return Object.values(cache.entries)
  }

  private emptyCache(): AssetsCache {
    return {
      version: this.scope ? '2.0' : '1.0',
      ...(this.scope ? { scope: this.scope } : {}),
      entries: {},
    }
  }

  private matchesScope(cacheScope?: AssetsCacheScope): boolean {
    if (!this.scope) {
      return cacheScope === undefined
    }

    const normalizedCacheScope = normalizeScope(cacheScope)
    return (
      normalizedCacheScope?.environment === this.scope.environment &&
      normalizedCacheScope.botId === this.scope.botId &&
      normalizedCacheScope.apiUrl === this.scope.apiUrl &&
      normalizedCacheScope.workspaceId === this.scope.workspaceId
    )
  }
}

function normalizeScope(scope?: AssetsCacheScope): AssetsCacheScope | undefined {
  if (!scope) {
    return undefined
  }

  if (scope.environment !== 'dev' && scope.environment !== 'prod') {
    throw new Error(`Unsupported asset cache environment: ${String(scope.environment)}`)
  }

  const botId = scope.botId?.trim() || undefined
  const apiUrl = scope.apiUrl?.replace(/\/+$/, '') || undefined
  const workspaceId = scope.workspaceId?.trim() || undefined
  if (scope.environment === 'prod' && !botId) {
    throw new Error('Production asset cache scope requires a bot ID')
  }
  if ((apiUrl && !workspaceId) || (!apiUrl && workspaceId)) {
    throw new Error('Asset cache authority requires both apiUrl and workspaceId')
  }

  return {
    environment: scope.environment,
    ...(botId ? { botId } : {}),
    ...(apiUrl && workspaceId ? { apiUrl, workspaceId } : {}),
  }
}

function scopeTargetName(scope: AssetsCacheScope): string {
  const authority = scope.apiUrl && scope.workspaceId ? { apiUrl: scope.apiUrl, workspaceId: scope.workspaceId } : undefined
  if (!scope.botId) {
    if (!authority) return 'bootstrap'
    const digest = crypto.createHash('sha256').update(JSON.stringify(authority)).digest('hex').slice(0, 32)
    return `bootstrap-${digest}`
  }

  const digest = crypto
    .createHash('sha256')
    .update(JSON.stringify({ botId: scope.botId, ...authority }))
    .digest('hex')
    .slice(0, 32)
  return `bot-${digest}`
}
