import { Client } from '@holocronlab/botruntime-client'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { resolveWorkspaceCredentials } from '../../auth/index.js'
import type { IntegrationDefinition, IntegrationRef } from '../../integrations/types.js'
import type { HubCacheEntry } from '../../integrations/hub-cache.js'
import {
  collectCatalogSearchResult,
  getSortedCatalogSearchResults,
  getSortedVersions,
  type RankedCatalogEntry,
} from '../../utils/search-ranking.js'
import { CatalogClientFactory } from './client-factory.js'
import type { CatalogSource, ResolvedSpec } from './catalog-service.js'

/**
 * Cloud-fetch logic for integrations (private workspace first, then public hub),
 * plus hub search / interface-implementer lookup / version listing. Moved verbatim
 * from the old IntegrationManager; the cache orchestration now lives in
 * {@link CatalogService}.
 */
export class IntegrationCatalogSource implements CatalogSource<IntegrationDefinition, IntegrationRef> {
  readonly cacheConfig = { cacheType: 'integrations', idField: 'integrationId' }

  constructor(private readonly clientFactory: CatalogClientFactory) {}

  async fetchByRef(ref: IntegrationRef): Promise<ResolvedSpec<IntegrationDefinition>> {
    const client = await this.clientFactory.getClient()

    const integration = await this._findPrivateOrPublicIntegration(client, ref)
    if (!integration) {
      throw await this._buildIntegrationNotFoundError(client, ref)
    }
    return { id: integration.id, updatedAt: integration.updatedAt, definition: integration }
  }

  /** Search public integrations in the Botpress hub. */
  async search(query: string, limit: number = 20): Promise<HubCacheEntry[]> {
    const client = await this.clientFactory.getClient()
    const results = new Map<string, RankedCatalogEntry<HubCacheEntry>>()
    const scanLimit = Math.max(limit * 5, 50)

    for await (const integration of client.list.publicIntegrations({
      name: query,
      sortBy: 'updatedAt',
      direction: 'desc',
    })) {
      collectCatalogSearchResult(results, toHubCacheEntry(integration), query)
    }

    let scanned = 0
    for await (const integration of client.list.publicIntegrations({
      search: query,
      sortBy: 'popularity',
      direction: 'desc',
      limit: scanLimit,
    })) {
      collectCatalogSearchResult(results, toHubCacheEntry(integration), query)
      scanned += 1
      if (scanned >= scanLimit) break
    }

    return getSortedCatalogSearchResults(results, limit)
  }

  /**
   * Find public integrations that implement a given interface (by interface name).
   * Returns the latest version per integration name, ranked by Cloud's popularity.
   */
  async findImplementersOfInterface(interfaceName: string, limit: number = 10): Promise<HubCacheEntry[]> {
    const client = await this.clientFactory.getClient()
    const seen = new Map<string, HubCacheEntry>()
    for await (const integration of client.list.publicIntegrations({
      interfaceName,
      sortBy: 'popularity',
      direction: 'desc',
      limit,
    })) {
      const entry = toHubCacheEntry(integration)
      if (!seen.has(entry.name)) seen.set(entry.name, entry)
      if (seen.size >= limit) break
    }
    return [...seen.values()]
  }

  /** List known public versions for an integration name. */
  async listVersions(name: string): Promise<string[]> {
    const client = await this.clientFactory.getClient()
    const versions = new Set<string>()

    for await (const integration of client.list.publicIntegrations({
      name,
      sortBy: 'updatedAt',
      direction: 'desc',
    })) {
      versions.add(integration.version)
    }

    return getSortedVersions(versions)
  }

  private async _findPrivateOrPublicIntegration(
    client: Client,
    ref: IntegrationRef
  ): Promise<IntegrationDefinition | undefined> {
    const privateIntegration = await this._findPrivateIntegration(client, ref)
    if (privateIntegration) {
      return privateIntegration
    }
    const publicIntegration = await this._findPublicIntegration(client, ref)
    if (publicIntegration) {
      return publicIntegration
    }
    return undefined
  }

  private async _findPrivateIntegration(
    client: Client,
    ref: IntegrationRef
  ): Promise<IntegrationDefinition | undefined> {
    try {
      // For workspace integrations, always use "latest" as they don't support version pinning
      const version = ref.workspace && ref.version !== 'latest' ? 'latest' : ref.version

      const response = await client.getIntegrationByName({
        name: ref.fullName,
        version,
      })
      return response.integration
    } catch (error) {
      if (this._isResourceNotFoundError(error)) {
        return undefined
      }
      throw error
    }
  }

  private async _findPublicIntegration(
    client: Client,
    ref: IntegrationRef
  ): Promise<IntegrationDefinition | undefined> {
    try {
      const response = await client.getPublicIntegration({
        name: ref.fullName,
        version: ref.version,
      })
      return response.integration
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

  private async _buildIntegrationNotFoundError(client: Client, ref: IntegrationRef): Promise<AdkError> {
    // If a specific version was requested, retry with 'latest' to disambiguate
    // "integration doesn't exist" from "this version doesn't exist".
    if (ref.version !== 'latest') {
      const latestExists = await this._findPrivateOrPublicIntegration(client, { ...ref, version: 'latest' })
      if (latestExists) {
        const scope = ref.workspace ? `workspace "${ref.workspace}"` : 'the official Botpress hub'
        return new AdkError({
          code: 'INTEGRATION_NOT_FOUND',
          message:
            `Integration "${ref.name}" version "${ref.version}" not found in ${scope} ` +
            `(latest is ${latestExists.version}). Run 'adk integrations info ${ref.fullName}' to see available versions.`,
          expected: true,
        })
      }
    }

    if (!ref.workspace) {
      return new AdkError({
        code: 'INTEGRATION_NOT_FOUND',
        message: `Integration "${ref.name}" not found in the official Botpress hub`,
        expected: true,
      })
    }

    let currentWorkspaceHandle: string | undefined
    let workspaceId: string | undefined
    try {
      const credentials = await resolveWorkspaceCredentials({
        project: this.clientFactory.options.project,
        credentials: this.clientFactory.options.credentials,
        apiUrl: this.clientFactory.options.apiUrl,
        workspaceId: this.clientFactory.options.workspaceId,
      })
      workspaceId = credentials.workspaceId

      if (workspaceId) {
        const currentWorkspace = await client.getWorkspace({ id: workspaceId })
        currentWorkspaceHandle = currentWorkspace?.handle
      }
    } catch {
      return new AdkError({
        code: 'INTEGRATION_NOT_FOUND',
        message: `Integration "${ref.name}" not found in workspace "${ref.workspace}"`,
        expected: true,
      })
    }

    // Case 1: Trying to install from the same workspace
    if (currentWorkspaceHandle === ref.workspace) {
      return new AdkError({
        code: 'INTEGRATION_NOT_FOUND',
        message:
          `Integration "${ref.name}" not found in workspace "${ref.workspace}" (workspaceId: ${workspaceId}). ` +
          `Are you sure you published the integration? ` +
          `Run 'adk deploy' to publish it to your workspace.`,
        expected: true,
        suggestion: "Are you sure you published the integration? Run 'adk deploy' to publish it to your workspace.",
      })
    }

    // Case 2: Trying to install from a different workspace (likely private)
    return new AdkError({
      code: 'INTEGRATION_NOT_FOUND',
      message:
        `Integration "${ref.name}" not found in workspace "${ref.workspace}" (current workspaceId: ${workspaceId}). ` +
        `This integration may be private. Private integrations can only be installed in the same workspace. ` +
        `If you want to share this integration with other workspaces, deploy it with --visibility="unlisted" or --visibility="public".`,
      expected: true,
    })
  }
}

function toHubCacheEntry(integration: {
  id: string
  name: string
  version: string
  updatedAt: string
  createdAt: string
  title?: string
  description?: string
  iconUrl?: string
  public: boolean
  visibility: 'public' | 'private' | 'unlisted'
  ownerWorkspace?: { id: string; name: string }
  verificationStatus?: 'unapproved' | 'approved' | 'pending' | 'rejected'
}): HubCacheEntry {
  return {
    id: integration.id,
    name: integration.name,
    version: integration.version,
    updatedAt: integration.updatedAt,
    createdAt: integration.createdAt,
    title: integration.title,
    description: integration.description,
    iconUrl: integration.iconUrl,
    public: integration.public,
    visibility: integration.visibility,
    ownerWorkspace: integration.ownerWorkspace
      ? { id: integration.ownerWorkspace.id, name: integration.ownerWorkspace.name }
      : undefined,
    verificationStatus: integration.verificationStatus,
  }
}
