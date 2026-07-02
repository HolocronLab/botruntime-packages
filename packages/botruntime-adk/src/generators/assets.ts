import { createFile } from '../utils/fs.js'
import { defaultAdkFolder } from '../const.js'
import path from 'path'
import { AssetsManager, AssetsCacheManager } from '../assets/index.js'

export async function generateAssetsTypes(projectPath: string): Promise<void> {
  const assetsManager = new AssetsManager({ projectPath })

  // Generate TypeScript types for assets
  const typesCode = await assetsManager.generateTypes()

  // Write to the types directory
  const typesPath = path.join(projectPath, defaultAdkFolder, 'assets.d.ts')
  await createFile(typesPath, typesCode)
}

export async function generateAssetsRuntime(
  projectPath: string,
  botId?: string,
  options?: { dev?: boolean }
): Promise<void> {
  const assetsManager = new AssetsManager({ projectPath, botId })
  const dev = options?.dev ?? false

  // Get enriched assets with remote metadata when available
  const enrichedAssets = await assetsManager.getEnrichedLocalAssets()

  // Generate hardcoded asset metadata
  const assetsMap: Record<string, unknown> = {}
  const localHashesMap: Record<string, string> = {}

  // Read cache to get local hashes
  const cacheManager = new AssetsCacheManager(projectPath)
  const cache = await cacheManager.load()

  for (const asset of enrichedAssets) {
    assetsMap[asset.path] = asset
    const cacheEntry = cache.entries[asset.path]
    if (cacheEntry) {
      localHashesMap[asset.path] = cacheEntry.localHash
    }
  }

  // In dev, inject a refresher that re-fetches signed URLs from the file API on demand.
  // Production deploys keep baked URLs (no background work in shipped agents).
  const initCall = dev
    ? `const refresher = async (): Promise<Record<string, Partial<Asset>>> => {
  const updates: Record<string, Partial<Asset>> = {};
  let nextToken: string | undefined;
  do {
    const { files, meta } = await client.listFiles({
      tags: { adk: 'true', type: 'asset' },
      nextToken,
    });
    for (const f of files) {
      const p = f.tags?.path;
      if (p) {
        updates[p] = { url: f.url, fileId: f.id, updatedAt: f.updatedAt };
      }
    }
    nextToken = meta?.nextToken;
  } while (nextToken);
  return updates;
};
initAssets(globalObj, assetsMetadata, localHashes, { refresher });`
    : `initAssets(globalObj, assetsMetadata, localHashes);`

  const imports = dev
    ? `import { Asset, initAssets, client } from '@holocronlab/botruntime-runtime/runtime';`
    : `import { Asset, initAssets } from '@holocronlab/botruntime-runtime/runtime';`

  // Generate minimal runtime code that only exports metadata
  const runtimeCode = `
// Auto-generated assets metadata
${imports}

// Static asset metadata (populated at build time)
export const assetsMetadata: Record<string, Asset> = ${JSON.stringify(assetsMap, null, 2)};

// Local hashes from cache
export const localHashes: Record<string, string> = ${JSON.stringify(localHashesMap, null, 2)};

// Initialize the assets runtime with metadata and local hashes
// The global object should be passed by the agent initialization code
export function initializeAssets(globalObj: any = globalThis) {
  ${initCall}
}

// Auto-initialize if running in a supported environment
if (typeof globalThis !== 'undefined') {
  initializeAssets(globalThis);
} else if (typeof global !== 'undefined') {
  initializeAssets(global);
}
`

  const runtimePath = path.join(projectPath, defaultAdkFolder, 'assets-runtime.ts')
  await createFile(runtimePath, runtimeCode)
}

export async function initAssets(projectPath: string, botId?: string, options?: { dev?: boolean }): Promise<void> {
  const assetsManager = new AssetsManager({ projectPath, botId })

  if (await assetsManager.hasAssetsDirectory()) {
    await generateAssetsTypes(projectPath)
    await generateAssetsRuntime(projectPath, botId, options)
  } else {
    // Generate empty types if no assets directory exists
    const emptyTypesCode = `// No assets directory found
import { Asset } from '@holocronlab/botruntime-runtime';

export type AssetPaths = never;

export interface AssetPathMap {}

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

    const typesPath = path.join(projectPath, defaultAdkFolder, 'assets.d.ts')
    await createFile(typesPath, emptyTypesCode)

    // Generate empty runtime
    const emptyRuntimeCode = `
// No assets available
import { Asset, initAssets } from '@holocronlab/botruntime-runtime/runtime';

// Empty asset metadata
export const assetsMetadata: Record<string, Asset> = {};

// Initialize with empty metadata
export function initializeAssets(globalObj: any = globalThis) {
  initAssets(globalObj, assetsMetadata);
}

// Auto-initialize if running in a supported environment
if (typeof globalThis !== 'undefined') {
  initializeAssets(globalThis);
} else if (typeof global !== 'undefined') {
  initializeAssets(global);
}
`

    const runtimePath = path.join(projectPath, defaultAdkFolder, 'assets-runtime.ts')
    await createFile(runtimePath, emptyRuntimeCode)
  }
}
