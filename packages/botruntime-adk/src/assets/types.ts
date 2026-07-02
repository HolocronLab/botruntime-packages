export interface AssetFile {
  path: string
  name: string
  size: number
  mime: string
  hash: string
  createdAt: string
  updatedAt: string
  fileId?: string
  url?: string
}

export interface LocalAssetFile {
  relativePath: string
  absolutePath: string
  name: string
  size: number
  mime: string
  hash: string
  stats: {
    mtime: Date
    size: number
  }
}

export enum AssetSyncOperation {
  Create = 'create',
  Update = 'update',
  Delete = 'delete',
  None = 'none',
}

export interface AssetSyncItem {
  operation: AssetSyncOperation
  localFile?: LocalAssetFile
  remoteFile?: AssetFile
  reason: string
}

export interface AssetSyncPlan {
  items: AssetSyncItem[]
  totalCreate: number
  totalUpdate: number
  totalDelete: number
  hasChanges: boolean
}

export interface AssetSyncResult {
  applied: boolean
  success: AssetSyncItem[]
  skipped: AssetSyncItem[]
  failed: Array<{
    item: AssetSyncItem
    error: Error
  }>
  summary: {
    created: number
    updated: number
    deleted: number
    skipped: number
    failed: number
  }
}

export interface AssetSyncOptions {
  dryRun?: boolean
  confirmDestructive?: boolean
  bailOnFailure?: boolean
  force?: boolean
}

export interface AssetPaths {
  [key: string]: string
}

export interface AssetsIndex {
  files: AssetFile[]
  generatedAt: string
  totalFiles: number
  totalSize: number
}
