import { Client } from '@holocronlab/botruntime-client'
import { AdkError } from '@holocronlab/botruntime-analytics'
import type { PluginDefinition, PluginRef } from '../../plugins/types.js'
import {
  collectCatalogSearchResult,
  getSortedCatalogSearchResults,
  getSortedVersions,
  type RankedCatalogEntry,
} from '../../utils/search-ranking.js'
import { CatalogClientFactory } from './client-factory.js'
import type { CatalogSource, ResolvedSpec } from './catalog-service.js'

export interface PluginSearchResult {
  id: string
  name: string
  version: string
  createdAt: string
  updatedAt: string
  title: string
  description: string
  iconUrl: string
  readmeUrl: string
  public: boolean
  visibility: 'public' | 'private' | 'unlisted'
  lifecycleStatus: 'published' | 'deprecated'
}

/**
 * Cloud-fetch logic for plugins (public Botpress Hub only), plus hub search and
 * version listing. Moved verbatim from the old PluginManager; cache orchestration
 * now lives in {@link CatalogService}.
 */
export class PluginCatalogSource implements CatalogSource<PluginDefinition, PluginRef> {
  readonly cacheConfig = { cacheType: 'plugins', idField: 'pluginId' }

  constructor(private readonly clientFactory: CatalogClientFactory) {}

  async fetchByRef(ref: PluginRef): Promise<ResolvedSpec<PluginDefinition>> {
    const client = await this.clientFactory.getClient()
    const plugin = await this._findPublicPlugin(client, ref)

    if (!plugin) {
      throw new AdkError({
        code: 'PLUGIN_NOT_FOUND',
        expected: true,
        message: await this._buildPluginNotFoundMessage(client, ref),
      })
    }

    return { id: plugin.id, updatedAt: plugin.updatedAt, definition: plugin }
  }

  /**
   * Search public plugins in the Botpress hub.
   *
   * The public plugin list API does not expose server-side search yet, so this
   * filters the catalog client-side. The catalog is small, and callers cap
   * results to keep CLI output compact.
   */
  async search(query: string, limit: number = 20): Promise<PluginSearchResult[]> {
    const client = await this.clientFactory.getClient()
    const results = new Map<string, RankedCatalogEntry<PluginSearchResult>>()

    for await (const plugin of client.list.publicPlugins({})) {
      collectCatalogSearchResult(results, plugin, query)
    }

    return getSortedCatalogSearchResults(results, limit)
  }

  /** List known public versions for a plugin name. */
  async listVersions(name: string): Promise<string[]> {
    const client = await this.clientFactory.getClient()
    const versions = new Set<string>()

    for await (const plugin of client.list.publicPlugins({ name })) {
      versions.add(plugin.version)
    }

    return getSortedVersions(versions)
  }

  /**
   * Distinguish "plugin doesn't exist" from "this version doesn't exist",
   * mirroring the integration source's not-found error.
   */
  private async _buildPluginNotFoundMessage(client: Client, ref: PluginRef): Promise<string> {
    if (ref.version !== 'latest') {
      const latest = await this._findPublicPlugin(client, { ...ref, version: 'latest' })
      if (latest) {
        return `Plugin "${ref.name}" version "${ref.version}" not found on the Botpress Hub (latest is ${latest.version}).`
      }
    }
    return `Plugin "${ref.name}" not found on the Botpress Hub`
  }

  private async _findPublicPlugin(client: Client, ref: PluginRef): Promise<PluginDefinition | undefined> {
    try {
      const response = await client.getPublicPlugin({
        name: ref.name,
        version: ref.version,
      })
      return response.plugin
    } catch (error) {
      if (this._isResourceNotFoundError(error)) {
        return undefined
      }
      throw error
    }
  }

  private _isResourceNotFoundError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'type' in error) {
      return (error as { type: unknown }).type === 'ResourceNotFound'
    }
    return false
  }
}
