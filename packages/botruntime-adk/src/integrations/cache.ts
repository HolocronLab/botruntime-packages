import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { IntegrationDefinition, CachedIntegration } from './types.js'

export class IntegrationCache {
  private cacheDir: string
  private integrationsDir: string

  constructor() {
    // Global cache in ~/.adk/cache
    this.cacheDir = path.join(os.homedir(), '.adk', 'cache')
    this.integrationsDir = path.join(this.cacheDir, 'integrations')
  }

  private async ensureCacheDir(): Promise<void> {
    await fs.mkdir(this.integrationsDir, { recursive: true })
  }

  private getCacheKey(integrationId: string, updatedAt: string): string {
    // Cache key format: integrationId@updatedAt
    // Remove any special characters that might cause filesystem issues
    const sanitizedId = integrationId.replace(/[^a-zA-Z0-9_-]/g, '_')
    const sanitizedDate = updatedAt.replace(/[^a-zA-Z0-9_-]/g, '_')
    return `${sanitizedId}@${sanitizedDate}.json`
  }

  async get(integrationId: string, updatedAt: string): Promise<IntegrationDefinition | null> {
    try {
      const cacheKey = this.getCacheKey(integrationId, updatedAt)
      const cachePath = path.join(this.integrationsDir, cacheKey)

      const data = await fs.readFile(cachePath, 'utf-8')
      const cached: CachedIntegration = JSON.parse(data)

      // Check if cache is expired
      if (cached.expiresAt) {
        const expiryDate = new Date(cached.expiresAt)
        if (expiryDate < new Date()) {
          // Cache expired, remove it
          await this.remove(integrationId, updatedAt)
          return null
        }
      }

      return cached.definition
    } catch {
      // Cache miss or error
      return null
    }
  }

  async set(
    integrationId: string,
    updatedAt: string,
    definition: IntegrationDefinition,
    ttlHours: number = 24 * 7 // Default 1 week
  ): Promise<void> {
    await this.ensureCacheDir()

    const cacheKey = this.getCacheKey(integrationId, updatedAt)
    const cachePath = path.join(this.integrationsDir, cacheKey)

    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + ttlHours)

    const cacheEntry: CachedIntegration = {
      definition,
      cachedAt: new Date().toISOString(),
      expiresAt: expiresAt.toISOString(),
    }

    await fs.writeFile(cachePath, JSON.stringify(cacheEntry, null, 2))
  }

  async remove(integrationId: string, updatedAt: string): Promise<void> {
    try {
      const cacheKey = this.getCacheKey(integrationId, updatedAt)
      const cachePath = path.join(this.integrationsDir, cacheKey)
      await fs.unlink(cachePath)
    } catch {
      // Ignore errors if file doesn't exist
    }
  }

  async clear(): Promise<void> {
    try {
      const files = await fs.readdir(this.integrationsDir)
      await Promise.all(files.map((file) => fs.unlink(path.join(this.integrationsDir, file))))
    } catch {
      // Ignore errors if directory doesn't exist
    }
  }

  async getStats(): Promise<{ count: number; sizeBytes: number }> {
    try {
      const files = await fs.readdir(this.integrationsDir)
      let totalSize = 0

      for (const file of files) {
        const stats = await fs.stat(path.join(this.integrationsDir, file))
        totalSize += stats.size
      }

      return {
        count: files.length,
        sizeBytes: totalSize,
      }
    } catch {
      return { count: 0, sizeBytes: 0 }
    }
  }
}
