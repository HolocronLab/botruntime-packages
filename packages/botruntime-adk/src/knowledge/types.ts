/**
 * Sync output from KB indexing workflow
 * Mirrors the SyncOutput from runtime
 */
export interface SyncOutputItem {
  file: string
  name: string
  hash: string
  size: number
}

export interface SyncErrorItem {
  file: string
  error: string
}

export interface SyncOutput {
  processed: number
  added: SyncOutputItem[]
  updated: SyncOutputItem[]
  deleted: SyncOutputItem[]
  errors: SyncErrorItem[]
}

/**
 * Local knowledge base representation from project
 */
export interface LocalKnowledgeBase {
  name: string
  description?: string
  sourceCount: number
}

/**
 * Sync operation type for knowledge bases
 */
export enum KBSyncOperation {
  Sync = 'sync',
  Skip = 'skip',
}

/**
 * File changes detected during sync planning
 */
export interface FileChanges {
  added: string[]
  modified: string[]
  deleted: string[]
}

/**
 * Sync status for a single data source
 */
export interface SourceSyncStatus {
  dsId: string
  dsType: 'document' | 'web-page'
  needsSync: boolean
  reason: string
  /** For document sources, detailed file changes */
  fileChanges?: FileChanges
  /** For web-page sources, count of legacy files needing migration */
  legacyFileCount?: number
}

/**
 * Represents an orphaned source (exists remotely but not in local definition)
 */
export interface OrphanedSource {
  dsId: string
  fileCount: number
}

/**
 * Status for orphaned sources in the sync plan
 */
export interface OrphanedSourceStatus {
  dsId: string
  fileCount: number
  willDelete: boolean
}

/**
 * Individual KB sync plan item
 */
export interface KBSyncItem {
  operation: KBSyncOperation
  kb: LocalKnowledgeBase
  reason: string
  /** Whether the KB needs to be created remotely first */
  needsCreation?: boolean
  /** Per-source sync status */
  sources?: SourceSyncStatus[]
  /** Orphaned sources that exist remotely but not in local definition */
  orphanedSources?: OrphanedSourceStatus[]
}

/**
 * Sync plan for all knowledge bases
 */
export interface KBSyncPlan {
  items: KBSyncItem[]
  toSync: number
  toSkip: number
  hasChanges: boolean
  /** Source-level counts */
  sourcesToSync: number
  sourcesToSkip: number
  /** Number of orphaned sources to delete */
  orphanedSourcesToDelete: number
}

/**
 * Options for KB sync execution
 */
export interface KBSyncOptions {
  /** Force sync even if config hash matches */
  force?: boolean
  /** Timeout in ms for waiting for workflow completion (default: 300000 = 5 min) */
  timeout?: number
  /** Allow deletion of orphaned sources. When false, orphaned sources are skipped. */
  confirmDestructive?: boolean
}

/**
 * Website sync workflow info
 */
export interface WebsiteSyncInfo {
  kbName: string
  workflowId: string
}

/**
 * Result of KB sync execution
 */
export interface KBSyncResult {
  synced: Array<{ name: string; result: SyncOutput }>
  skipped: Array<{ name: string; reason: string }>
  failed: Array<{ name: string; error: string }>
  /** Website sync workflows triggered (run asynchronously in bot runtime) */
  websiteSyncs?: WebsiteSyncInfo[]
}
