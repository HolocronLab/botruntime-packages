import path from 'path'
import { createFile } from '../utils/fs.js'
import { defaultAdkFolder } from '../const.js'
import { AssetFile } from './types.js'

/**
 * Updates the assets runtime file with actual deployed metadata
 * This is called after assets are uploaded to Botpress
 */
export async function updateAssetsRuntime(projectPath: string, deployedAssets: AssetFile[]): Promise<void> {
  // Create a map of deployed assets by path
  const assetsMap: Record<string, AssetFile> = {}
  for (const asset of deployedAssets) {
    assetsMap[asset.path] = asset
  }

  // Generate the updated runtime code with real metadata
  const runtimeCode = `
// Auto-generated assets metadata
import { Asset, initAssets } from '@holocronlab/botruntime-runtime/runtime';

// Static asset metadata (populated at deploy time)
export const assetsMetadata: Record<string, Asset> = ${JSON.stringify(assetsMap, null, 2)};

// Initialize the assets runtime with metadata
// The global object should be passed by the agent initialization code
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
  await createFile(runtimePath, runtimeCode)
}
