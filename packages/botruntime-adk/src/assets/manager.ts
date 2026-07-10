import fs from 'fs/promises'
import path from 'path'
import crypto from 'crypto'
import type { Client } from '@holocronlab/botruntime-client'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { assertCompleteCredentials, getProjectClient, type Credentials } from '../auth/index.js'
import {
  AssetFile,
  LocalAssetFile,
  AssetSyncPlan,
  AssetSyncResult,
  AssetSyncItem,
  AssetSyncOperation,
  AssetSyncOptions,
  AssetsIndex,
} from './types.js'
import { AssetsCacheManager, type AssetsCacheScope } from './cache.js'

export interface AssetManagerOptions {
  projectPath: string
  botId?: string
  credentials?: Credentials
  cacheScope?: AssetsCacheScope
  failOnRemoteFetchError?: boolean
}

export class AssetsManager {
  private projectPath: string
  private assetsPath: string
  private client?: Client
  private botId?: string
  private credentials?: Credentials & { workspaceId: string }
  private failOnRemoteFetchError: boolean
  private cacheManager: AssetsCacheManager
  private cacheEnabled: boolean

  constructor(options: AssetManagerOptions) {
    const targetBotId = options.botId?.trim() || undefined
    const scopedBotId = options.cacheScope?.botId?.trim() || undefined
    if (options.cacheScope && targetBotId !== scopedBotId) {
      throw new AdkError({
        code: 'INVALID_ASSET_CACHE_SCOPE',
        message: 'Asset cache scope botId must exactly match the remote asset target botId.',
        expected: true,
      })
    }
    if (options.credentials) {
      assertCompleteCredentials(options.credentials, 'Explicit asset credentials')
    }
    if (options.cacheScope?.environment === 'prod' && options.failOnRemoteFetchError === false) {
      throw new AdkError({
        code: 'INVALID_ASSET_FETCH_POLICY',
        message: 'Production asset generation is fail-closed; remote fetch errors cannot be tolerated.',
        expected: true,
      })
    }
    const scopedAuthority = options.cacheScope?.apiUrl && options.cacheScope.workspaceId
    if (scopedAuthority) {
      const credentials = options.credentials
      if (
        !credentials?.workspaceId ||
        credentials.apiUrl.replace(/\/+$/, '') !== options.cacheScope!.apiUrl!.replace(/\/+$/, '') ||
        credentials.workspaceId !== options.cacheScope!.workspaceId
      ) {
        throw new AdkError({
          code: 'INVALID_ASSET_CACHE_SCOPE',
          message: 'An authority-scoped remote asset cache requires matching explicit credentials.',
          expected: true,
        })
      }
    }
    this.projectPath = options.projectPath
    this.assetsPath = path.join(this.projectPath, 'assets')
    this.botId = targetBotId
    this.credentials = options.credentials as (Credentials & { workspaceId: string }) | undefined
    this.failOnRemoteFetchError =
      options.failOnRemoteFetchError ?? options.cacheScope?.environment === 'prod'
    // Explicit remote credentials without a complete authority scope may still
    // fetch safely, but must not read/write the legacy cross-stack cache.
    this.cacheEnabled = Boolean(scopedAuthority)
    this.cacheManager = new AssetsCacheManager(this.projectPath, { scope: options.cacheScope })
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      if (!this.botId) {
        throw new AdkError({
          code: 'BOT_ID_REQUIRED',
          message:
            'Bot ID is required for asset operations. Please deploy your agent first or create agent.json with botId and workspaceId.',
          expected: true,
          suggestion: 'Deploy your agent first or create agent.json with botId and workspaceId.',
        })
      }

      const headers = { 'x-multiple-integrations': 'true' }
      this.client = this.credentials
        ? await getProjectClient({
            credentials: this.credentials,
            apiUrl: this.credentials.apiUrl,
            workspaceId: this.credentials.workspaceId,
            botId: this.botId,
            headers,
          })
        : await getProjectClient({
            project: { path: this.projectPath },
            credentials: this.credentials,
            botId: this.botId,
            headers,
          })
    }
    return this.client
  }

  private assertBotId(operation: string): void {
    if (!this.botId) {
      throw new AdkError({
        code: 'BOT_ID_REQUIRED',
        message:
          `Operation "${operation}" requires a bot ID. ` +
          'Please deploy your agent first or create agent.json with botId and workspaceId.',
        expected: true,
        suggestion: 'Deploy your agent first or create agent.json with botId and workspaceId.',
      })
    }
  }

  /**
   * Check if assets directory exists
   */
  async hasAssetsDirectory(): Promise<boolean> {
    try {
      const stats = await fs.stat(this.assetsPath)
      return stats.isDirectory()
    } catch {
      return false
    }
  }

  /**
   * Get all local asset files with their metadata
   */
  async getLocalAssets(): Promise<LocalAssetFile[]> {
    if (!(await this.hasAssetsDirectory())) {
      return []
    }

    const files = await this.scanDirectory(this.assetsPath)
    const assets: LocalAssetFile[] = []

    for (const filePath of files) {
      try {
        const stats = await fs.stat(filePath)
        if (stats.isFile()) {
          const relativePath = path.relative(this.assetsPath, filePath)
          const content = await fs.readFile(filePath)
          const hash = this.calculateHash(content)
          const mime = this.getMimeType(filePath)

          assets.push({
            relativePath,
            absolutePath: filePath,
            name: path.basename(filePath),
            size: stats.size,
            mime,
            hash,
            stats: {
              mtime: stats.mtime,
              size: stats.size,
            },
          })
        }
      } catch (error) {
        // Skip files that can't be read
        console.warn(`Warning: Could not read asset file ${filePath}:`, error)
      }
    }

    return assets
  }

  /**
   * Get all remote asset files from Botpress
   */
  async getRemoteAssets(): Promise<AssetFile[]> {
    this.assertBotId('get remote assets')

    const client = await this.getClient()

    try {
      // List files with ADK asset tags (botId is automatically scoped by client)
      const response = await client.listFiles({
        tags: {
          type: 'asset',
          adk: 'true',
        },
      })

      return response.files.map((file) => ({
        path: file.tags?.path || file.key,
        name: path.basename(file.tags?.path || file.key),
        size: file.size || 0,
        mime: file.contentType,
        hash: file.tags?.hash || '',
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        fileId: file.id,
        url: file.url || '',
      }))
    } catch (error) {
      throw new AdkError({
        code: 'ASSET_FETCH_FAILED',
        message: `Failed to fetch remote assets: ${error}`,
        expected: true,
        cause: error,
      })
    }
  }

  /**
   * Create a sync plan comparing local and remote assets
   */
  async createSyncPlan(): Promise<AssetSyncPlan> {
    const [localAssets, remoteAssets] = await Promise.all([this.getLocalAssets(), this.getRemoteAssets()])

    const items: AssetSyncItem[] = []
    const remoteMap = new Map<string, AssetFile>()

    // Map remote assets by path
    for (const remote of remoteAssets) {
      remoteMap.set(remote.path, remote)
    }

    // Check local files against remote
    for (const local of localAssets) {
      const remote = remoteMap.get(local.relativePath)

      if (!remote) {
        // Local file doesn't exist remotely - needs to be created
        items.push({
          operation: AssetSyncOperation.Create,
          localFile: local,
          reason: 'New local file',
        })
      } else if (local.hash !== remote.hash) {
        // File exists but content is different - needs to be updated
        items.push({
          operation: AssetSyncOperation.Update,
          localFile: local,
          remoteFile: remote,
          reason: 'Content changed',
        })
      } else {
        // Files are identical - no operation needed
        items.push({
          operation: AssetSyncOperation.None,
          localFile: local,
          remoteFile: remote,
          reason: 'Up to date',
        })
      }

      // Remove from remote map so we can find orphaned remote files
      remoteMap.delete(local.relativePath)
    }

    // Remaining remote files don't have local counterparts - need to be deleted
    for (const [, remote] of remoteMap) {
      items.push({
        operation: AssetSyncOperation.Delete,
        remoteFile: remote,
        reason: 'Local file deleted',
      })
    }

    // Calculate totals
    const totalCreate = items.filter((i) => i.operation === AssetSyncOperation.Create).length
    const totalUpdate = items.filter((i) => i.operation === AssetSyncOperation.Update).length
    const totalDelete = items.filter((i) => i.operation === AssetSyncOperation.Delete).length
    const hasChanges = totalCreate > 0 || totalUpdate > 0 || totalDelete > 0

    return {
      items,
      totalCreate,
      totalUpdate,
      totalDelete,
      hasChanges,
    }
  }

  /**
   * Execute a sync plan
   */
  async executeSync(plan: AssetSyncPlan, options: AssetSyncOptions = {}): Promise<AssetSyncResult> {
    this.assertBotId('sync assets')

    if (options.dryRun) {
      return {
        applied: false,
        success: [],
        skipped: [],
        failed: [],
        summary: {
          created: 0,
          updated: 0,
          deleted: 0,
          skipped: 0,
          failed: 0,
        },
      }
    }

    const client = await this.getClient()
    const success: AssetSyncItem[] = []
    const skipped: AssetSyncItem[] = []
    const failed: Array<{ item: AssetSyncItem; error: Error }> = []

    for (const item of plan.items) {
      if (item.operation === AssetSyncOperation.None) {
        success.push(item)
        continue
      }

      try {
        switch (item.operation) {
          case AssetSyncOperation.Create:
          case AssetSyncOperation.Update:
            if (item.localFile) {
              await this.uploadAsset(client, item.localFile)
              success.push(item)
            }
            break

          case AssetSyncOperation.Delete:
            if (item.remoteFile?.fileId) {
              if (!options.confirmDestructive) {
                skipped.push(item)
                continue
              }
              await client.deleteFile({ id: item.remoteFile.fileId })
              success.push(item)
            }
            break
        }
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error))
        failed.push({ item, error: err })

        if (options.bailOnFailure) {
          break
        }
      }
    }

    return {
      applied: true,
      success,
      skipped,
      failed,
      summary: {
        created: success.filter((i) => i.operation === AssetSyncOperation.Create).length,
        updated: success.filter((i) => i.operation === AssetSyncOperation.Update).length,
        deleted: success.filter((i) => i.operation === AssetSyncOperation.Delete).length,
        skipped: skipped.length,
        failed: failed.length,
      },
    }
  }

  /**
   * Upload a local asset to Botpress
   */
  private async uploadAsset(client: Client, localFile: LocalAssetFile): Promise<void> {
    const content = await fs.readFile(localFile.absolutePath)

    await client.uploadFile({
      key: localFile.relativePath,
      content,
      contentType: localFile.mime,
      tags: {
        type: 'asset',
        adk: 'true',
        path: localFile.relativePath,
        hash: localFile.hash,
        name: localFile.name,
        size: localFile.size.toString(),
      },
      index: false, // Assets are static files, not knowledge — never index
    })
  }

  /**
   * Generate TypeScript types for assets
   */
  async generateTypes(): Promise<string> {
    const localAssets = await this.getLocalAssets()

    // Generate union type of all asset paths
    const pathUnion = localAssets.map((asset) => `"${asset.relativePath}"`).join(' | ')

    const paths = localAssets.map((asset) => `  "${asset.relativePath}": "${asset.relativePath}";`).join('\n')

    return `// Auto-generated asset types
import { Asset } from '@holocronlab/botruntime-runtime';

export type AssetPaths = ${pathUnion || 'never'};

export interface AssetPathMap {
${paths}
}

// Runtime asset access
declare global {
  const assets: {
    get<T extends AssetPaths>(path: T): Promise<Asset>;
    list(): Asset[];
    getSyncStatus(): {
      synced: boolean;
      neverSynced: string[];
      stale: string[];
      upToDate: string[];
    };
  };
}
`
  }

  /**
   * Create an assets index file
   */
  async createAssetsIndex(): Promise<AssetsIndex> {
    const remoteAssets = await this.getRemoteAssets()

    return {
      files: remoteAssets,
      generatedAt: new Date().toISOString(),
      totalFiles: remoteAssets.length,
      totalSize: remoteAssets.reduce((sum, asset) => sum + asset.size, 0),
    }
  }

  /**
   * Get enriched local assets with remote metadata when available
   * Uses cache to avoid unnecessary API calls
   */
  async getEnrichedLocalAssets(): Promise<AssetFile[]> {
    const localAssets = await this.getLocalAssets()
    const enrichedAssets: AssetFile[] = []

    // Try to get client if credentials are available
    let remoteAssetsMap: Map<string, AssetFile> = new Map()
    let remoteFetchFailed = false
    try {
      if (this.botId) {
        const remoteAssets = await this.getRemoteAssets()
        remoteAssetsMap = new Map(remoteAssets.map((asset) => [asset.path, asset]))
      }
    } catch (error) {
      if (this.failOnRemoteFetchError) {
        throw error
      }
      remoteFetchFailed = true
      console.debug('Could not fetch remote assets:', error)
    }

    for (const localAsset of localAssets) {
      const cachedEntry = this.cacheEnabled ? await this.cacheManager.getEntry(localAsset.relativePath) : null
      const remoteAsset = remoteAssetsMap.get(localAsset.relativePath)

      if (remoteAsset) {
        enrichedAssets.push(remoteAsset)
        if (this.cacheEnabled) {
          await this.cacheManager.setEntry(localAsset.relativePath, localAsset.hash, remoteAsset.hash, remoteAsset)
        }
      } else if (remoteFetchFailed && cachedEntry) {
        enrichedAssets.push(cachedEntry.metadata)
        await this.cacheManager.setEntry(
          localAsset.relativePath,
          localAsset.hash,
          cachedEntry.remoteHash,
          cachedEntry.metadata
        )
      } else {
        // A successful fetch is authoritative: absence means the remote file
        // was deleted, so stale signed URLs/file IDs must not be resurrected.
        if (this.cacheEnabled && cachedEntry) {
          await this.cacheManager.removeEntry(localAsset.relativePath)
        }
        const placeholderAsset: AssetFile = {
          url: `__PLACEHOLDER_URL_${localAsset.relativePath}__`,
          path: localAsset.relativePath,
          size: localAsset.size,
          name: localAsset.name,
          mime: localAsset.mime,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          fileId: `__PLACEHOLDER_ID_${localAsset.relativePath}__`,
          hash: localAsset.hash,
        }
        enrichedAssets.push(placeholderAsset)
      }
    }

    return enrichedAssets
  }

  // Private utility methods

  private async scanDirectory(dir: string, files: string[] = []): Promise<string[]> {
    const items = await fs.readdir(dir)

    for (const item of items) {
      const fullPath = path.join(dir, item)
      const stats = await fs.stat(fullPath)

      if (stats.isDirectory()) {
        await this.scanDirectory(fullPath, files)
      } else {
        files.push(fullPath)
      }
    }

    return files
  }

  private calculateHash(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex')
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase()

    const mimeTypes: Record<string, string> = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf',
      '.txt': 'text/plain',
      '.md': 'text/markdown',
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.zip': 'application/zip',
      '.mp4': 'video/mp4',
      '.webm': 'video/webm',
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.ogg': 'audio/ogg',
    }

    return mimeTypes[ext] || 'application/octet-stream'
  }
}
