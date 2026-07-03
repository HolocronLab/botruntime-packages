import { AssetFile } from './types.js';
export interface AssetsCacheEntry {
    path: string;
    localHash: string;
    remoteHash: string;
    metadata: AssetFile;
    lastUpdated: string;
}
export interface AssetsCache {
    version: string;
    entries: Record<string, AssetsCacheEntry>;
}
export declare class AssetsCacheManager {
    private projectPath;
    private cachePath;
    private cache;
    constructor(projectPath: string);
    load(): Promise<AssetsCache>;
    save(): Promise<void>;
    getEntry(assetPath: string): Promise<AssetsCacheEntry | null>;
    setEntry(assetPath: string, localHash: string, remoteHash: string, metadata: AssetFile): Promise<void>;
    isStale(assetPath: string): Promise<boolean>;
    removeEntry(assetPath: string): Promise<void>;
    clear(): Promise<void>;
    getAllEntries(): Promise<AssetsCacheEntry[]>;
}
//# sourceMappingURL=cache.d.ts.map