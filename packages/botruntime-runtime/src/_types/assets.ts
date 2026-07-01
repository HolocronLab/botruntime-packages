/**
 * Asset type representing a file asset with metadata
 */
export interface Asset {
  url: string
  path: string
  size: number
  name: string
  mime: string
  createdAt: string
  updatedAt: string
  fileId: string
  hash: string
}

/**
 * Type for the global assets object
 */
export interface AssetsGlobal {
  get<T extends string>(path: T): Promise<Asset>
  list(): Asset[]
  getSyncStatus(): {
    synced: boolean
    neverSynced: string[]
    stale: string[]
    upToDate: string[]
  }
}
