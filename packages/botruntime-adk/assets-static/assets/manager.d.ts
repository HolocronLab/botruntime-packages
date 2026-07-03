import { type Credentials } from '../auth/index.js';
import { AssetFile, LocalAssetFile, AssetSyncPlan, AssetSyncResult, AssetSyncOptions, AssetsIndex } from './types.js';
export interface AssetManagerOptions {
    projectPath: string;
    botId?: string;
    credentials?: Credentials;
}
export declare class AssetsManager {
    private projectPath;
    private assetsPath;
    private client?;
    private botId?;
    private credentials?;
    private cacheManager;
    constructor(options: AssetManagerOptions);
    private getClient;
    private assertBotId;
    /**
     * Check if assets directory exists
     */
    hasAssetsDirectory(): Promise<boolean>;
    /**
     * Get all local asset files with their metadata
     */
    getLocalAssets(): Promise<LocalAssetFile[]>;
    /**
     * Get all remote asset files from Botpress
     */
    getRemoteAssets(): Promise<AssetFile[]>;
    /**
     * Create a sync plan comparing local and remote assets
     */
    createSyncPlan(): Promise<AssetSyncPlan>;
    /**
     * Execute a sync plan
     */
    executeSync(plan: AssetSyncPlan, options?: AssetSyncOptions): Promise<AssetSyncResult>;
    /**
     * Upload a local asset to Botpress
     */
    private uploadAsset;
    /**
     * Generate TypeScript types for assets
     */
    generateTypes(): Promise<string>;
    /**
     * Create an assets index file
     */
    createAssetsIndex(): Promise<AssetsIndex>;
    /**
     * Get enriched local assets with remote metadata when available
     * Uses cache to avoid unnecessary API calls
     */
    getEnrichedLocalAssets(): Promise<AssetFile[]>;
    private scanDirectory;
    private calculateHash;
    private getMimeType;
}
//# sourceMappingURL=manager.d.ts.map