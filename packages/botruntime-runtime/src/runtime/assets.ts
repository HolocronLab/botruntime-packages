import { Asset } from '../_types/assets'

/**
 * Internal storage for asset metadata
 */
let assetsMap: Record<string, Asset> = {}

/**
 * Internal storage for local hashes from cache
 */
let localHashes: Record<string, string> = {}

/**
 * Track warned assets to avoid spamming warnings
 */
const warnedAssets = new Set<string>()

/**
 * Lazy URL refresh state. Botpress file URLs are presigned and expire; in dev sessions
 * that outlive the TTL we re-fetch fresh URLs on demand and cache them.
 *
 * `lastSuccessfulRefreshAt` advances only on success — after a transient failure we want
 * the next caller to retry quickly, not wait the full 30-minute window. `lastAttemptAt`
 * + `RETRY_BACKOFF_MS` keeps a short floor between retries so a hard outage doesn't
 * hammer the API.
 */
const REFRESH_THRESHOLD_MS = 30 * 60 * 1000
const RETRY_BACKOFF_MS = 60 * 1000
type Refresher = () => Promise<Record<string, Partial<Asset>>>
let refresher: Refresher | null = null
let lastSuccessfulRefreshAt = 0
let lastAttemptAt = 0
let refreshInFlight: Promise<void> | null = null

async function maybeRefreshUrls(): Promise<void> {
  if (!refresher) return
  const now = Date.now()
  if (now - lastSuccessfulRefreshAt < REFRESH_THRESHOLD_MS) return
  if (now - lastAttemptAt < RETRY_BACKOFF_MS) return
  if (refreshInFlight) return refreshInFlight
  lastAttemptAt = now
  const r = refresher
  refreshInFlight = (async () => {
    try {
      const updates = await r()
      assets._updateMetadata(updates)
      lastSuccessfulRefreshAt = Date.now()
    } catch (err) {
      console.warn('[assets] URL refresh failed:', err)
    } finally {
      refreshInFlight = null
    }
  })()
  return refreshInFlight
}

/**
 * Check if an asset is stale (local hash differs from remote)
 */
function isAssetStale(path: string): boolean {
  const localHash = localHashes[path]
  const asset = assetsMap[path]
  return !!(localHash && asset && localHash !== asset.hash)
}

/**
 * Check if an asset URL is a placeholder
 */
function isPlaceholderUrl(url: string): boolean {
  return url.startsWith('__PLACEHOLDER_URL_') && url.endsWith('__')
}

/**
 * The global assets object that provides runtime access to assets
 */
export const assets = {
  /**
   * Get an asset by its path
   * @param path - The relative path to the asset
   * @returns The asset metadata
   * @throws Error if asset is not found
   */
  async get<T extends string>(path: T): Promise<Asset> {
    if (!assetsMap[path]) {
      throw new Error(`Asset not found: ${path}`)
    }

    await maybeRefreshUrls()

    const asset = assetsMap[path]

    // Check if we should warn about the asset
    if (!warnedAssets.has(path)) {
      if (isPlaceholderUrl(asset.url)) {
        warnedAssets.add(path)
        console.warn(
          `⚠️  Asset "${path}" has never been synced with Botpress.\n` +
            `   The asset will not be accessible until you run "adk deploy" to upload it.\n` +
            `   To sync assets without deploying, run "adk assets sync".`
        )
      } else if (isAssetStale(path)) {
        warnedAssets.add(path)
        const localHash = localHashes[path]
        console.warn(
          `⚠️  Asset "${path}" is out of sync with your local file.\n` +
            `   Local file has changed (hash: ${localHash?.substring(0, 8)}...) but the synced version is being used.\n` +
            `   Run "adk assets sync" to upload the latest version.`
        )
      }
    }

    return asset
  },

  /**
   * List all available assets
   * @returns Array of all asset metadata
   */
  list(): Asset[] {
    return Object.values(assetsMap)
  },

  /**
   * Check sync status of all assets
   * @returns Detailed sync status for all assets
   */
  getSyncStatus(): {
    synced: boolean
    neverSynced: string[]
    stale: string[]
    upToDate: string[]
  } {
    const neverSynced: string[] = []
    const stale: string[] = []
    const upToDate: string[] = []

    for (const [path, asset] of Object.entries(assetsMap)) {
      if (isPlaceholderUrl(asset.url)) {
        neverSynced.push(path)
      } else if (isAssetStale(path)) {
        stale.push(path)
      } else {
        upToDate.push(path)
      }
    }

    return {
      synced: neverSynced.length === 0 && stale.length === 0,
      neverSynced,
      stale,
      upToDate,
    }
  },

  /**
   * Internal method for ADK to update asset URLs after deployment
   * @internal
   */
  _updateMetadata(updates: Record<string, Partial<Asset>>) {
    for (const [path, update] of Object.entries(updates)) {
      if (assetsMap[path]) {
        Object.assign(assetsMap[path], update)

        // Clear warning for this asset if URL is no longer a placeholder
        if (update.url && !isPlaceholderUrl(update.url)) {
          warnedAssets.delete(path)
        }
      }
    }
  },

  /**
   * Internal method to reset warnings (useful for testing)
   * @internal
   */
  _resetWarnings() {
    warnedAssets.clear()
  },
}

/**
 * Initialize the assets runtime with metadata
 * This is called by the generated .adk/assets-runtime.ts file
 *
 * @param globalObj - The global object to patch (globalThis, global, window, etc.)
 * @param metadata - The asset metadata map
 * @param hashes - Optional local hash information from cache
 * @param options - Optional configuration. Pass `refresher` in dev to enable lazy URL refresh.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- accepts any global object (globalThis, window, etc.)
export function initAssets(
  globalObj: any,
  metadata: Record<string, Asset>,
  hashes?: Record<string, string>,
  options?: { refresher?: Refresher }
): void {
  // Set the internal metadata
  assetsMap = metadata

  // Set local hashes if provided
  if (hashes) {
    localHashes = hashes
  }

  refresher = options?.refresher ?? null
  lastSuccessfulRefreshAt = 0
  lastAttemptAt = 0
  refreshInFlight = null

  // Patch the global object
  if (globalObj && typeof globalObj === 'object') {
    globalObj.assets = assets
  }
}

/**
 * Get the current assets metadata (for testing/debugging)
 * @internal
 */
export function getAssetsMetadata(): Record<string, Asset> {
  return { ...assetsMap }
}
