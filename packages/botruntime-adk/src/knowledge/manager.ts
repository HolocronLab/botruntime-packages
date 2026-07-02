import crypto from 'crypto'
import path from 'path'
import fs from 'fs/promises'
import { glob } from 'glob'
import type { Client } from '@holocronlab/botruntime-client'
import { DataSource } from '@holocronlab/botruntime-runtime'
import { AdkError } from '@holocronlab/botruntime-analytics'

import { getProjectClient, type Credentials } from '../auth/index.js'
import { AgentProject } from '../agent-project/agent-project.js'
import {
  LocalKnowledgeBase,
  KBSyncPlan,
  KBSyncResult,
  KBSyncItem,
  KBSyncOperation,
  KBSyncOptions,
  SyncOutput,
  FileChanges,
  SourceSyncStatus,
  OrphanedSource,
  OrphanedSourceStatus,
} from './types.js'

type RemoteKnowledgeBase = Pick<
  Awaited<ReturnType<Client['listKnowledgeBases']>>['knowledgeBases'][number],
  'id' | 'name' | 'tags'
>

export interface KnowledgeManagerOptions {
  project: AgentProject
  botId?: string
  credentials?: Credentials
}

// Well-known tags for KB files (must match runtime constants)
const WellKnownTags = {
  KNOWLEDGE: 'source',
  KNOWLEDGE_BASE_ID: 'kbId',
  KNOWLEDGE_BASE_NAME: 'kbName',
  KNOWLEDGE_SOURCE_ID: 'dsId',
  KNOWLEDGE_SOURCE_TYPE: 'dsType',
}

// Per-source sync tracking stored in KB tags
// Format: source<dsId><field> (alphanumeric only, must start with lowercase letter)
function sourceTag(dsId: string, field: 'hash' | 'lastupdatedat'): string {
  // Sanitize dsId to be alphanumeric only (remove underscores, dashes, etc.)
  const sanitizedId = dsId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
  return `source${sanitizedId}${field}`
}

const WellKnownMetadata = {
  TITLE: 'title',
}

type FileMetadata = {
  hash: string
  dsId: string
  dsType: string
  relPath: string
  [key: string]: string
}

/**
 * Type guard for FileMetadata - validates metadata from API responses
 */
function isFileMetadata(metadata: unknown): metadata is FileMetadata {
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    'hash' in metadata &&
    typeof metadata.hash === 'string' &&
    'relPath' in metadata &&
    typeof metadata.relPath === 'string'
  )
}

type LocalFile = {
  abs: string
  rel: string
  name: string
}

/**
 * Manages knowledge base synchronization for ADK projects
 */
export class KnowledgeManager {
  private client?: Client
  private botId?: string
  private project: AgentProject
  private credentials?: Credentials
  /** Cache of file hashes by directory path to avoid recalculating */
  private fileHashCache: Map<string, Record<string, string>> = new Map()
  private remoteKbsPromise: Promise<RemoteKnowledgeBase[]> | null = null

  constructor(options: KnowledgeManagerOptions) {
    this.botId = options.botId
    this.project = options.project
    this.credentials = options.credentials
  }

  /**
   * Clear the file hash cache (call before a new sync operation)
   */
  clearHashCache(): void {
    this.fileHashCache.clear()
  }

  private async getClient(): Promise<Client> {
    if (!this.client) {
      this.assertBotId('initialize client')
      this.client = await getProjectClient({
        project: this.project,
        credentials: this.credentials,
        botId: this.botId,
        headers: {
          'x-multiple-integrations': 'true',
        },
      })
    }
    return this.client
  }

  private assertBotId(operation: string): void {
    if (!this.botId) {
      throw new AdkError({
        code: 'BOT_ID_REQUIRED',
        expected: true,
        message:
          `Operation "${operation}" requires a bot ID. ` +
          'Please deploy your agent first or create agent.json with botId and workspaceId.',
        suggestion: 'Deploy your agent first or create agent.json with botId and workspaceId.',
      })
    }
  }

  /**
   * Format an error for display, including API response data if available
   */
  private formatError(error: unknown): string {
    if (!(error instanceof Error)) {
      return String(error)
    }

    let message = error.message

    // Check for axios-style API errors with response data
    if (
      'response' in error &&
      error.response !== null &&
      typeof error.response === 'object' &&
      'data' in error.response
    ) {
      message += ` - API: ${JSON.stringify(error.response.data)}`
    }

    return message
  }

  /**
   * Get all knowledge bases from the project
   */
  getLocalKnowledgeBases(): LocalKnowledgeBase[] {
    const kbs: LocalKnowledgeBase[] = []

    for (const kbRef of this.project.knowledge) {
      const definition = kbRef.definition

      kbs.push({
        name: definition.name,
        description: definition.description,
        sourceCount: definition.sources?.length || 0,
      })
    }

    return kbs
  }

  /**
   * Calculate content hash from individual file hashes
   * This creates a deterministic hash of all file contents
   */
  private computeContentHash(fileHashes: Record<string, string>): string {
    // Sort keys for deterministic ordering
    const sortedEntries = Object.entries(fileHashes).sort(([a], [b]) => a.localeCompare(b))
    const combined = sortedEntries.map(([filePath, hash]) => `${filePath}:${hash}`).join('\n')
    return crypto.createHash('sha256').update(combined).digest('hex')
  }

  /**
   * List all remote knowledge bases
   */
  private async listRemoteKnowledgeBases(): Promise<RemoteKnowledgeBase[]> {
    if (!this.remoteKbsPromise) {
      this.remoteKbsPromise = (async () => {
        const client = await this.getClient()
        const kbs: RemoteKnowledgeBase[] = []
        let nextToken: string | undefined

        do {
          const response = await client.listKnowledgeBases({ nextToken })
          kbs.push(...response.knowledgeBases)
          nextToken = response.meta.nextToken
        } while (nextToken)

        return kbs
      })().catch((err) => {
        this.remoteKbsPromise = null
        throw err
      })
    }
    return this.remoteKbsPromise
  }

  private invalidateRemoteKbsCache(): void {
    this.remoteKbsPromise = null
  }

  /**
   * Find remote KB by name
   */
  private async findRemoteKB(name: string): Promise<RemoteKnowledgeBase | undefined> {
    const kbs = await this.listRemoteKnowledgeBases()
    return kbs.find((kb) => kb.name === name)
  }

  /**
   * Create a new knowledge base
   */
  async createKnowledgeBase(name: string): Promise<RemoteKnowledgeBase> {
    const client = await this.getClient()
    await client.createKnowledgeBase({ name })
    this.invalidateRemoteKbsCache()
    const created = await this.findRemoteKB(name)
    if (!created) {
      throw new AdkError({
        code: 'KB_CREATE_VERIFY_FAILED',
        message: `Failed to find KB "${name}" after creation`,
      })
    }
    return created
  }

  /**
   * Get remote KBs that don't exist locally (orphaned)
   */
  async getOrphanedKBs(): Promise<RemoteKnowledgeBase[]> {
    const localKbNames = this.getLocalKnowledgeBases().map((kb) => kb.name)
    const remoteKbs = await this.listRemoteKnowledgeBases()
    return remoteKbs.filter((kb) => !localKbNames.includes(kb.name))
  }

  /**
   * Get orphaned sources for a KB by listing files and extracting unique dsIds from tags
   * Returns sources that exist in remote files but not in local definition
   */
  async getOrphanedSources(kbName: string, localDsIds: string[]): Promise<OrphanedSource[]> {
    const client = await this.getClient()

    // List ALL files for this KB using raw client to get full file data including tags
    const tags = {
      [WellKnownTags.KNOWLEDGE]: 'knowledge-base',
      [WellKnownTags.KNOWLEDGE_BASE_NAME]: kbName,
    }

    const files: Array<{ tags?: Record<string, string>; metadata?: Record<string, unknown> }> = []
    let nextToken: string | undefined
    do {
      const response = await client.listFiles({ tags, nextToken })
      files.push(...response.files)
      nextToken = response.meta.nextToken
    } while (nextToken)

    // Group files by dsId from tags (more reliable than metadata for website sources)
    const filesByDsId = new Map<string, number>()
    for (const file of files) {
      // Try to get dsId from tags first (works for all source types)
      const dsId = file.tags?.[WellKnownTags.KNOWLEDGE_SOURCE_ID] || (file.metadata?.dsId as string | undefined)
      if (dsId) {
        filesByDsId.set(dsId, (filesByDsId.get(dsId) || 0) + 1)
      }
    }

    // Find orphaned sources (exist in remote but not in local)
    const orphaned: OrphanedSource[] = []
    for (const [dsId, fileCount] of filesByDsId) {
      if (!localDsIds.includes(dsId)) {
        orphaned.push({ dsId, fileCount })
      }
    }

    return orphaned
  }

  /**
   * Delete all files belonging to an orphaned source using direct dsId tag query
   */
  async deleteOrphanedSource(kbName: string, dsId: string): Promise<{ deletedFiles: number; errors: string[] }> {
    const client = await this.getClient()

    // Query files directly by dsId tag
    const tags = {
      [WellKnownTags.KNOWLEDGE]: 'knowledge-base',
      [WellKnownTags.KNOWLEDGE_BASE_NAME]: kbName,
      [WellKnownTags.KNOWLEDGE_SOURCE_ID]: dsId,
    }
    const files = await this.listExistingFiles(client, tags)

    console.log(`     Deleting ${files.length} files from orphaned source "${dsId}"...`)

    // Delete all files in parallel
    const results = await Promise.allSettled(files.map((f) => client.deleteFile({ id: f.id })))

    const deletedFiles = results.filter((r) => r.status === 'fulfilled').length
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map((r) => String(r.reason))

    return { deletedFiles, errors }
  }

  /**
   * Clean up source tags from KB after deleting orphaned source
   * Note: Botpress API merges tags, so we set to empty string to "delete" them
   */
  private async cleanupSourceTags(
    kbId: string,
    kbName: string,
    dsIds: string[],
    existingTags: Record<string, string>
  ): Promise<void> {
    const client = await this.getClient()
    const newTags = { ...existingTags }

    for (const dsId of dsIds) {
      // Sanitize dsId the same way sourceTag() does
      const sanitizedId = dsId.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
      // Set to empty string to clear (API merges tags, delete doesn't work)
      newTags[`source${sanitizedId}hash`] = ''
      newTags[`source${sanitizedId}lastupdatedat`] = ''
    }

    await client.updateKnowledgeBase({ id: kbId, name: kbName, tags: newTags })
  }

  /**
   * Delete a KB and all its associated files
   */
  async deleteKnowledgeBase(kbId: string, kbName: string): Promise<{ deletedFiles: number }> {
    this.invalidateRemoteKbsCache()
    const client = await this.getClient()

    const tags = {
      [WellKnownTags.KNOWLEDGE]: 'knowledge-base',
      [WellKnownTags.KNOWLEDGE_BASE_NAME]: kbName,
    }
    console.log(`     Listing files for KB "${kbName}"...`)
    const files = await this.listExistingFiles(client, tags)
    console.log(`     Found ${files.length} files to delete`)

    // Delete all files in parallel
    const results = await Promise.allSettled(files.map((file) => client.deleteFile({ id: file.id })))
    const deletedFiles = results.filter((r) => r.status === 'fulfilled').length

    // Then delete the KB itself
    console.log(`     Deleting KB "${kbName}"...`)
    await client.deleteKnowledgeBase({ id: kbId })

    return { deletedFiles }
  }

  /**
   * Get stored hash for a specific source from KB tags
   */
  private getRemoteSourceHash(kb: RemoteKnowledgeBase, dsId: string): string | undefined {
    return kb.tags?.[sourceTag(dsId, 'hash')]
  }

  /**
   * Update source hash in KB tags after sync
   */
  private async updateSourceHash(
    kbId: string,
    kbName: string,
    dsId: string,
    hash: string,
    existingTags?: Record<string, string>
  ): Promise<void> {
    const client = await this.getClient()

    await client.updateKnowledgeBase({
      id: kbId,
      name: kbName,
      tags: {
        ...existingTags,
        [sourceTag(dsId, 'hash')]: hash,
        [sourceTag(dsId, 'lastupdatedat')]: new Date().toISOString(),
      },
    })
  }

  /**
   * Compute config hash for a data source (used for website sources)
   */
  private computeConfigHash(config: Record<string, unknown>): string {
    // Sort keys for deterministic ordering
    const sortedConfig = JSON.stringify(config, Object.keys(config).sort())
    return crypto.createHash('sha256').update(sortedConfig).digest('hex')
  }

  /**
   * Trigger website source sync by creating the builtin_knowledge_indexing workflow.
   * For dev bots, this requires adk dev to be running. For prod bots, runs in Botpress Cloud.
   */
  async syncWebsiteSource(kbName: string, kbId: string, force: boolean): Promise<{ workflowId: string }> {
    const client = await this.getClient()

    const response = await client.createWorkflow({
      name: 'builtin_knowledge_indexing',
      input: { kbName, kbId, force },
      status: 'pending',
      timeoutAt: new Date(Date.now() + 180 * 60 * 1000).toISOString(), // 180 minutes (matches workflow timeout)
    })

    return { workflowId: response.workflow.id }
  }

  /**
   * Detect legacy website source files (old tag format)
   * Legacy files have: knowledge: 'true' (old format)
   * Returns count of legacy files found
   */
  async detectLegacyWebsiteFiles(kbName: string, sourceId: string): Promise<number> {
    const client = await this.getClient()

    // Legacy tag format used before migration
    const legacyTags = {
      knowledge: 'true',
      sourceId: sourceId,
      kbName: kbName,
    }

    const legacyFiles = await this.listExistingFiles(client, legacyTags)
    return legacyFiles.length
  }

  /**
   * Delete legacy website source files (old tag format)
   * Called during executeSync when legacy files were detected
   */
  async deleteLegacyWebsiteFiles(kbName: string, sourceId: string): Promise<{ deletedFiles: number }> {
    const client = await this.getClient()

    // Legacy tag format used before migration
    const legacyTags = {
      knowledge: 'true',
      sourceId: sourceId,
      kbName: kbName,
    }

    const legacyFiles = await this.listExistingFiles(client, legacyTags)
    if (legacyFiles.length === 0) {
      return { deletedFiles: 0 }
    }

    console.log(`  Found ${legacyFiles.length} legacy website files to migrate`)

    const results = await Promise.allSettled(legacyFiles.map((f) => client.deleteFile({ id: f.id })))

    const deletedFiles = results.filter((r) => r.status === 'fulfilled').length
    console.log(`  ✅ Deleted ${deletedFiles} legacy website files`)

    return { deletedFiles }
  }

  /**
   * Check if a KB has any website sources
   */
  hasWebsiteSources(kbName: string): boolean {
    const kbRef = this.project.knowledge.find((k) => k.definition.name === kbName)
    if (!kbRef) return false
    return kbRef.definition.sources?.some((s) => DataSource.isWebsite(s)) || false
  }

  /**
   * Get list of KB names that have website sources
   */
  getKBsWithWebsiteSources(): string[] {
    return this.project.knowledge
      .filter((k) => k.definition.sources?.some((s) => DataSource.isWebsite(s)))
      .map((k) => k.definition.name)
  }

  /**
   * Compute content hash for a single directory source
   */
  private async computeDirectorySourceHash(
    directoryPath: string,
    filterFn?: (filePath: string) => boolean
  ): Promise<string> {
    const fileHashes = await this.scanLocalFileHashes(directoryPath, filterFn)
    return this.computeContentHash(fileHashes)
  }

  /**
   * Create a sync plan comparing local sources vs remote KB tags
   * Uses per-source hashes stored in KB tags
   */
  async createSyncPlan(): Promise<KBSyncPlan> {
    const localKbs = this.getLocalKnowledgeBases()
    const remoteKbs = await this.listRemoteKnowledgeBases()
    const items: KBSyncItem[] = []

    for (const kb of localKbs) {
      const kbRef = this.project.knowledge.find((k) => k.definition.name === kb.name)
      if (!kbRef) continue

      // Find matching remote KB by name
      const remoteKb = remoteKbs.find((r) => r.name === kb.name)

      if (!remoteKb) {
        // KB doesn't exist remotely yet - needs creation and sync of all sources
        const sources: SourceSyncStatus[] = (kbRef.definition.sources || []).map((source) => ({
          dsId: source.id,
          dsType: DataSource.isDirectory(source) ? ('document' as const) : ('web-page' as const),
          needsSync: true,
          reason: 'New KB',
        }))

        items.push({
          operation: KBSyncOperation.Sync,
          kb,
          reason: 'Knowledge base not found remotely',
          needsCreation: true,
          sources,
        })
        continue
      }

      // Check each source individually
      const sources: SourceSyncStatus[] = []
      let hasChanges = false

      for (const source of kbRef.definition.sources || []) {
        const remoteHash = this.getRemoteSourceHash(remoteKb, source.id)

        if (DataSource.isDirectory(source)) {
          // Directory source: compute content hash
          const localHash = await this.computeDirectorySourceHash(source.directoryPath, source.filterFn)

          if (!remoteHash) {
            sources.push({
              dsId: source.id,
              dsType: 'document',
              needsSync: true,
              reason: 'First-time sync',
            })
            hasChanges = true
          } else if (localHash !== remoteHash) {
            // Get detailed file changes for this source
            const fileChanges = await this.detectDirectorySourceChanges(kb.name, source)
            sources.push({
              dsId: source.id,
              dsType: 'document',
              needsSync: true,
              reason: 'Content changed',
              fileChanges,
            })
            hasChanges = true
          } else {
            sources.push({
              dsId: source.id,
              dsType: 'document',
              needsSync: false,
              reason: 'No changes',
            })
          }
        } else if (DataSource.isWebsite(source)) {
          // Website source: compute config hash
          const config = source.getConfig()
          const localHash = this.computeConfigHash(config)

          if (!remoteHash) {
            sources.push({
              dsId: source.id,
              dsType: 'web-page',
              needsSync: true,
              reason: 'First-time crawl',
            })
            hasChanges = true
          } else if (localHash !== remoteHash) {
            sources.push({
              dsId: source.id,
              dsType: 'web-page',
              needsSync: true,
              reason: 'Config changed - needs recrawl',
            })
            hasChanges = true
          } else {
            // Config unchanged - check if legacy files need migration
            const legacyFileCount = await this.detectLegacyWebsiteFiles(kb.name, source.id)
            if (legacyFileCount > 0) {
              sources.push({
                dsId: source.id,
                dsType: 'web-page',
                needsSync: true,
                reason: `${legacyFileCount} legacy files to migrate`,
                legacyFileCount,
              })
              hasChanges = true
            } else {
              const mode = source.getConfig().mode as string
              const hint =
                mode === 'sitemap' || mode === 'llms-txt'
                  ? 'No config changes — run with --force to pick up new sitemap/llms.txt content'
                  : 'No config changes'
              sources.push({
                dsId: source.id,
                dsType: 'web-page',
                needsSync: false,
                reason: hint,
              })
            }
          }
        }
      }

      // Detect orphaned sources (exist remotely but not in local definition)
      const localDsIds = (kbRef.definition.sources || []).map((s) => s.id)
      const orphaned = await this.getOrphanedSources(kb.name, localDsIds)
      const orphanedSourceStatuses: OrphanedSourceStatus[] = orphaned.map((o) => ({
        dsId: o.dsId,
        fileCount: o.fileCount,
        willDelete: true,
      }))
      const hasOrphanedSources = orphanedSourceStatuses.length > 0

      items.push({
        operation: hasChanges || hasOrphanedSources ? KBSyncOperation.Sync : KBSyncOperation.Skip,
        kb,
        reason: hasOrphanedSources
          ? hasChanges
            ? 'Sources need sync and orphaned sources to remove'
            : 'Orphaned sources to remove'
          : hasChanges
            ? 'Sources need sync'
            : 'No changes',
        sources,
        orphanedSources: hasOrphanedSources ? orphanedSourceStatuses : undefined,
      })
    }

    const toSync = items.filter((i) => i.operation === KBSyncOperation.Sync).length
    const toSkip = items.filter((i) => i.operation === KBSyncOperation.Skip).length

    // Count sources
    let sourcesToSync = 0
    let sourcesToSkip = 0
    let orphanedSourcesToDelete = 0
    for (const item of items) {
      for (const source of item.sources || []) {
        if (source.needsSync) {
          sourcesToSync++
        } else {
          sourcesToSkip++
        }
      }
      orphanedSourcesToDelete += item.orphanedSources?.length || 0
    }

    return {
      items,
      toSync,
      toSkip,
      hasChanges: toSync > 0,
      sourcesToSync,
      sourcesToSkip,
      orphanedSourcesToDelete,
    }
  }

  /**
   * Detect file changes for a single directory source
   */
  private async detectDirectorySourceChanges(kbName: string, source: DataSource.DirectorySource): Promise<FileChanges> {
    const client = await this.getClient()

    const added: string[] = []
    const deleted: string[] = []
    const modified: string[] = []

    // Get remote files for this source (new tag format)
    const tags = {
      [WellKnownTags.KNOWLEDGE]: 'knowledge-base',
      [WellKnownTags.KNOWLEDGE_SOURCE_ID]: source.id,
      [WellKnownTags.KNOWLEDGE_BASE_NAME]: kbName,
    }
    const remoteFiles = await this.listExistingFiles(client, tags)

    // Also check for legacy files (old tag format) that need migration
    const legacyTags = {
      knowledge: 'true', // Old tag format
      sourceId: source.id, // Old tag name
      kbName: kbName,
    }
    const legacyFiles = await this.listExistingFiles(client, legacyTags)

    // Build map of remote file hashes by relPath (new format only)
    const remoteHashes: Record<string, string> = {}
    for (const file of remoteFiles) {
      if (isFileMetadata(file.metadata)) {
        remoteHashes[file.metadata.relPath] = file.metadata.hash
      }
    }

    // Get local file hashes
    const localHashes = await this.scanLocalFileHashes(source.directoryPath, source.filterFn)

    // Check for added/modified files
    for (const [relPath, hash] of Object.entries(localHashes)) {
      if (!remoteHashes[relPath]) {
        added.push(relPath)
      } else if (remoteHashes[relPath] !== hash) {
        modified.push(relPath)
      }
    }

    // Check for deleted files
    for (const relPath of Object.keys(remoteHashes)) {
      if (!localHashes[relPath]) {
        deleted.push(relPath)
      }
    }

    // If there are legacy files, they need to be migrated (deleted and re-uploaded)
    if (legacyFiles.length > 0) {
      for (const file of legacyFiles) {
        const meta = file.metadata as FileMetadata | undefined
        const relPath = meta?.relPath
        if (relPath) {
          // Mark legacy file for deletion
          if (!deleted.includes(`${relPath} (legacy)`)) {
            deleted.push(`${relPath} (legacy)`)
          }
          // Mark corresponding local file for re-upload if it exists and isn't already in new format
          if (localHashes[relPath] && !added.includes(relPath) && !remoteHashes[relPath]) {
            added.push(relPath)
          }
        }
      }
    }

    return { added, deleted, modified }
  }

  /**
   * Scan local files for a directory source and return their hashes
   */
  private async scanLocalFileHashes(
    directoryPath: string,
    filterFn?: (filePath: string) => boolean
  ): Promise<Record<string, string>> {
    const projectDir = this.project.path
    const directory = path.resolve(projectDir, directoryPath)

    // Check cache first
    if (this.fileHashCache.has(directory)) {
      return this.fileHashCache.get(directory)!
    }

    const files = glob
      .sync(directory + '/**/*.*', { absolute: true, nodir: true })
      .filter((file) => !filterFn || filterFn(file))

    const hashes: Record<string, string> = {}
    for (const file of files) {
      const relPath = path.relative(directory, file)
      const content = await fs.readFile(file)
      hashes[relPath] = crypto.createHash('sha256').update(content).digest('hex')
    }

    // Store in cache
    this.fileHashCache.set(directory, hashes)

    return hashes
  }

  /**
   * Execute KB sync based on plan
   * Directly uploads files to Botpress without requiring a running bot.
   * For website sources that need sync, triggers the builtin_knowledge_indexing workflow.
   */
  async executeSync(plan: KBSyncPlan, options: KBSyncOptions = {}): Promise<KBSyncResult> {
    this.assertBotId('sync knowledge bases')

    const client = await this.getClient()
    const result: KBSyncResult = {
      synced: [],
      skipped: [],
      failed: [],
      websiteSyncs: [],
    }

    for (const item of plan.items) {
      if (item.operation === KBSyncOperation.Skip && !options.force) {
        result.skipped.push({ name: item.kb.name, reason: item.reason })
        continue
      }

      try {
        console.log(`Syncing KB "${item.kb.name}"...`)

        // Find the KB definition in the project
        const kbRef = this.project.knowledge.find((k) => k.definition.name === item.kb.name)
        if (!kbRef) {
          throw new AdkError({
            code: 'KB_NOT_FOUND',
            expected: true,
            message: `KB "${item.kb.name}" not found in project`,
          })
        }

        // Find or create the remote KB
        let remoteKb = await this.findRemoteKB(item.kb.name)
        if (!remoteKb) {
          console.log(`  Creating KB "${item.kb.name}"...`)
          remoteKb = await this.createKnowledgeBase(item.kb.name)
        }

        if (item.orphanedSources && item.orphanedSources.length > 0 && options.confirmDestructive) {
          console.log(`  Removing ${item.orphanedSources.length} orphaned source(s)...`)

          const deletedSourceIds: string[] = []
          for (const orphaned of item.orphanedSources) {
            const { deletedFiles, errors } = await this.deleteOrphanedSource(item.kb.name, orphaned.dsId)
            console.log(`     ✕ ${orphaned.dsId}: ${deletedFiles} files deleted`)

            if (errors.length === 0) {
              deletedSourceIds.push(orphaned.dsId)
            } else {
              console.warn(`     Warning: ${errors.length} errors during deletion`)
            }
          }

          // Clean up KB tags for successfully deleted sources
          if (deletedSourceIds.length > 0) {
            // Fetch fresh KB tags to avoid overwriting with stale data
            const freshKb = await this.findRemoteKB(item.kb.name)
            if (freshKb) {
              await this.cleanupSourceTags(freshKb.id, item.kb.name, deletedSourceIds, freshKb.tags || {})
              // Update remoteKb reference with fresh tags for subsequent operations
              remoteKb = freshKb
            }
          }
        }

        const syncOutput: SyncOutput = {
          processed: 0,
          added: [],
          updated: [],
          deleted: [],
          errors: [],
        }

        // Get sources that need syncing from the plan
        const sourcesToSync = options.force ? item.sources || [] : (item.sources || []).filter((s) => s.needsSync)

        // Separate document and web-page sources
        const directorySourcesToSync = sourcesToSync.filter((s) => s.dsType === 'document')
        const websiteSourcesToSync = sourcesToSync.filter((s) => s.dsType === 'web-page')

        // Accumulate tags in-memory so multiple updateSourceHash calls on the same KB
        // don't overwrite each other's entries (Bug B: stale remoteKb.tags snapshot).
        // Must be initialized after the remoteKb = freshKb reassignment above.
        let currentTags = { ...(remoteKb.tags ?? {}) }

        // Sync directory sources directly (CLI uploads files)
        for (const sourceStatus of directorySourcesToSync) {
          const source = kbRef.definition.sources?.find((s) => s.id === sourceStatus.dsId)
          if (!source || !DataSource.isDirectory(source)) continue

          console.log(`  Syncing directory source "${source.id}"...`)
          const sourceOutput = await this.syncDirectorySource(
            client,
            item.kb.name,
            remoteKb.id,
            source.id,
            source.directoryPath,
            source.filterFn,
            options.force || false
          )

          // Merge output
          syncOutput.processed += sourceOutput.processed
          syncOutput.added.push(...sourceOutput.added)
          syncOutput.updated.push(...sourceOutput.updated)
          syncOutput.deleted.push(...sourceOutput.deleted)
          syncOutput.errors.push(...sourceOutput.errors)

          // Update source hash after successful sync, using accumulated tags (Bug B fix)
          const sourceHash = await this.computeDirectorySourceHash(source.directoryPath, source.filterFn)
          await this.updateSourceHash(remoteKb.id, item.kb.name, source.id, sourceHash, currentTags)
          currentTags = {
            ...currentTags,
            [sourceTag(source.id, 'hash')]: sourceHash,
            [sourceTag(source.id, 'lastupdatedat')]: new Date().toISOString(),
          }
        }

        // Sync website sources directly (CLI fetches and uploads locally)
        for (const sourceStatus of websiteSourcesToSync) {
          const source = kbRef.definition.sources?.find((s) => s.id === sourceStatus.dsId)
          if (!source || !DataSource.isWebsite(source)) continue

          // All four modes (urls, sitemap, llms-txt, website) and both fetch
          // strategies (node:fetch, integration:browser) are supported here. The
          // CLI's authenticated client routes browser-integration calls through
          // `client.callAction('browser:browsePages' | 'browser:discoverUrls')`,
          // the same path the runtime uses. The cloud's response is the source
          // of truth for whether the integration is installed and enabled.
          const config = source.getConfig()

          // Delete legacy files before syncing (only when we will actually re-upload)
          await this.deleteLegacyWebsiteFiles(item.kb.name, sourceStatus.dsId)

          try {
            this.assertBotId('sync website source')

            console.log(`  Syncing website source "${source.id}" locally...`)
            const sourceOutput = await source.syncDirect(client, this.botId!, {
              dsId: source.id,
              kbName: item.kb.name,
              kbId: remoteKb.id,
              force: options.force || false,
            })

            // Merge output (map runtime string[] errors to manager SyncErrorItem[])
            syncOutput.processed += sourceOutput.processed
            syncOutput.added.push(...sourceOutput.added)
            syncOutput.updated.push(...sourceOutput.updated)
            syncOutput.deleted.push(...sourceOutput.deleted)
            syncOutput.errors.push(
              ...sourceOutput.errors.map((e) => (typeof e === 'string' ? { file: source.id, error: e } : e))
            )

            // Only update hash if URLs were discovered AND all fetches succeeded.
            // - processed = 0: discovery failed (sitemap unreachable, filter matched nothing) → retry next sync
            // - errors.length > 0: some pages failed to fetch → leave hash unset so syncDirect retries
            //   only the failed URLs on the next run (it deduplicates against existing remote files)
            if (sourceOutput.processed > 0 && sourceOutput.errors.length === 0) {
              const configHash = this.computeConfigHash(config)
              await this.updateSourceHash(remoteKb.id, item.kb.name, source.id, configHash, currentTags)
              currentTags = {
                ...currentTags,
                [sourceTag(source.id, 'hash')]: configHash,
                [sourceTag(source.id, 'lastupdatedat')]: new Date().toISOString(),
              }
            }
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error)
            console.error(`  Failed to sync website source "${source.id}": ${errorMsg}`)
            syncOutput.errors.push({ file: source.id, error: errorMsg })
          }
        }

        result.synced.push({ name: item.kb.name, result: syncOutput })
      } catch (error) {
        const errorMessage = this.formatError(error)
        console.error(`Failed to sync KB "${item.kb.name}": ${errorMessage}`)
        result.failed.push({ name: item.kb.name, error: errorMessage })
      }
    }

    return result
  }

  /**
   * Sync a directory data source by uploading files directly
   */
  private async syncDirectorySource(
    client: Client,
    kbName: string,
    kbId: string,
    dsId: string,
    directoryPath: string,
    filterFn: ((filePath: string) => boolean) | undefined,
    force: boolean
  ): Promise<SyncOutput> {
    const projectDir = this.project.path
    const directory = path.resolve(projectDir, directoryPath)

    // Validate directory is within project
    if (!directory.startsWith(projectDir)) {
      throw new AdkError({
        code: 'PATH_OUTSIDE_PROJECT',
        expected: true,
        message: "Directory path must be within the agent's directory",
      })
    }

    const tags = {
      [WellKnownTags.KNOWLEDGE]: 'knowledge-base',
      [WellKnownTags.KNOWLEDGE_BASE_ID]: kbId,
      [WellKnownTags.KNOWLEDGE_SOURCE_ID]: dsId,
      [WellKnownTags.KNOWLEDGE_SOURCE_TYPE]: 'document',
      [WellKnownTags.KNOWLEDGE_BASE_NAME]: kbName,
    }

    // List local files
    let allFiles = glob
      .sync(directory + '/**/*.*', { absolute: true, nodir: true })
      .filter((file) => {
        if (filterFn) {
          try {
            return filterFn(file)
          } catch {
            return false
          }
        }
        return true
      })
      .map<LocalFile>((f) => ({
        abs: f,
        rel: path.relative(directory, f),
        name: path.basename(f),
      }))

    console.log(`  Found ${allFiles.length} files in ${directoryPath}`)

    // Get cached file hashes (computed earlier during sync plan)
    const cachedHashes = await this.scanLocalFileHashes(directoryPath, filterFn)

    // List existing files in Botpress (new tag format)
    const existingFiles = await this.listExistingFiles(client, tags)
    console.log(`  Found ${existingFiles.length} existing files in Botpress`)

    // Also check for legacy files (old tag format) that need migration
    const legacyTags = {
      knowledge: 'true', // Old tag format
      sourceId: dsId, // Old tag name
      kbName: kbName,
    }
    const legacyFiles = await this.listExistingFiles(client, legacyTags)
    if (legacyFiles.length > 0) {
      console.log(`  Found ${legacyFiles.length} legacy files to migrate`)
    }

    // Calculate diff (only comparing against new-format files)
    const toRemove = existingFiles.filter((f) => !allFiles.find((af) => af.rel === f.metadata?.relPath))
    // Add ALL legacy files to toRemove - they'll be deleted and re-uploaded with new format
    toRemove.push(...legacyFiles)

    const toAdd = allFiles.filter((af) => !existingFiles.find((f) => f.metadata?.relPath === af.rel))
    const toUpdate = allFiles.filter((af) => existingFiles.find((f) => f.metadata?.relPath === af.rel))

    const output: SyncOutput = {
      processed: allFiles.length,
      added: [],
      updated: [],
      deleted: [],
      errors: [],
    }

    // Delete removed files
    for (const file of toRemove) {
      try {
        await client.deleteFile({ id: file.id })
        output.deleted.push({
          file: file.id,
          name: file.key,
          hash: file.metadata?.hash ?? '',
          size: file.size ?? -1,
        })
      } catch (error) {
        output.errors.push({
          file: file.id,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    // Upload new files
    for (const local of toAdd) {
      const result = await this.upsertFile(client, local, dsId, tags, force, cachedHashes[local.rel])
      if (result) {
        output.added.push(result)
      }
    }

    // Update existing files (check hash)
    for (const local of toUpdate) {
      const result = await this.upsertFile(client, local, dsId, tags, force, cachedHashes[local.rel])
      if (result) {
        output.updated.push(result)
      }
    }

    console.log(
      `  Synced: ${output.added.length} added, ${output.updated.length} updated, ${output.deleted.length} deleted`
    )

    return output
  }

  /**
   * List existing files in Botpress with given tags
   */
  private async listExistingFiles(
    client: Client,
    tags: Record<string, string>
  ): Promise<Array<{ id: string; key: string; size: number | null; metadata?: FileMetadata }>> {
    const files: Array<{ id: string; key: string; size: number | null; metadata?: FileMetadata }> = []
    let nextToken: string | undefined

    do {
      const response = await client.listFiles({ tags, nextToken })
      files.push(
        ...response.files.map((f) => ({
          id: f.id,
          key: f.key,
          size: f.size,
          metadata: isFileMetadata(f.metadata) ? f.metadata : undefined,
        }))
      )
      nextToken = response.meta.nextToken
    } while (nextToken)

    return files
  }

  /**
   * Upload or update a file
   */
  private async upsertFile(
    client: Client,
    local: LocalFile,
    dsId: string,
    tags: Record<string, string>,
    force: boolean,
    cachedHash?: string
  ): Promise<{ file: string; hash: string; name: string; size: number } | null> {
    const key = `data_source://document/${dsId}/${local.rel}`

    const content = await fs.readFile(local.abs)
    // Use cached hash if available, otherwise compute
    const hash = cachedHash ?? crypto.createHash('sha256').update(content).digest('hex')

    // Check if file exists and has same hash
    try {
      const { file } = await client.getFile({ id: key })
      if (!force && isFileMetadata(file.metadata) && file.metadata.hash === hash) {
        // File unchanged, skip
        return null
      }
    } catch {
      // File doesn't exist, will be created
    }

    // Extract title from filename
    const title = path.basename(local.name, path.extname(local.name))

    const metadata: FileMetadata = {
      hash,
      dsId: dsId,
      dsType: 'document',
      relPath: local.rel,
      [WellKnownMetadata.TITLE]: title,
    }

    const uploaded = await client.uploadFile({
      key,
      content,
      accessPolicies: [],
      tags,
      index: true,
      metadata,
    })

    return {
      file: uploaded.file.id,
      hash,
      name: key,
      size: uploaded.file.size ?? -1,
    }
  }
}
