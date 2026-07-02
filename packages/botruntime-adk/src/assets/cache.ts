import fs from 'fs/promises'
import path from 'path'
import { AssetFile } from './types.js'
import { defaultAdkFolder } from '../const.js'

export interface AssetsCacheEntry {
  path: string
  localHash: string
  remoteHash: string
  metadata: AssetFile
  lastUpdated: string
}

export interface AssetsCache {
  version: string
  entries: Record<string, AssetsCacheEntry>
}

export class AssetsCacheManager {
  private cachePath: string
  private cache: AssetsCache | null = null

  constructor(private projectPath: string) {
    this.cachePath = path.join(projectPath, defaultAdkFolder, 'assets-cache.json')
  }

  async load(): Promise<AssetsCache> {
    if (this.cache) {
      return this.cache
    }

    try {
      const content = await fs.readFile(this.cachePath, 'utf-8')
      this.cache = JSON.parse(content)
      return this.cache!
    } catch {
      // Cache doesn't exist or is invalid, create new one
      this.cache = {
        version: '1.0',
        entries: {},
      }
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
    this.cache = {
      version: '1.0',
      entries: {},
    }
    await this.save()
  }

  async getAllEntries(): Promise<AssetsCacheEntry[]> {
    const cache = await this.load()
    return Object.values(cache.entries)
  }
}
