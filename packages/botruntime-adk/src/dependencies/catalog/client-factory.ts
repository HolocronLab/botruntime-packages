import type { Client } from '@holocronlab/botruntime-client'
import { AdkError } from '@holocronlab/botruntime-analytics'
import {
  assertCompleteCredentials,
  getProjectClient,
  type Credentials,
  type ProjectCredentialsContext,
} from '../../auth/index.js'
import type { CatalogCacheAuthority } from './resolution-cache.js'

/**
 * Connection options shared by every catalog source (integrations, plugins,
 * interfaces). These are the credential/scope fields the three managers used to
 * each carry independently.
 */
export interface CatalogClientOptions {
  project?: ProjectCredentialsContext
  apiUrl?: string
  workspaceId?: string
  credentials?: Credentials
}

/** Header every catalog cloud call carries (the platform multiplexes integration lookups on it). */
const CATALOG_HEADERS = { 'x-multiple-integrations': 'true' } as const

/**
 * Single place that builds the authenticated `@holocronlab/botruntime-client` for catalog
 * lookups. Collapses the byte-for-byte `getClient()` ladder previously copied
 * into IntegrationManager / PluginManager: project-scoped → `getProjectClient`;
 * bare credentials → a direct `Client`; otherwise the ambient project client. The
 * client is built lazily and memoized per factory instance.
 *
 * Note: the old InterfaceManager always routed through `getProjectClient` (it had
 * no bare-credentials branch). Interfaces now use this same 3-branch ladder. This
 * is behavior-equivalent for every current caller (none construct an interface
 * source with credentials-only and no project/workspace scope); a future
 * credentials-only interface caller would take the direct-`Client` branch instead.
 */
export class CatalogClientFactory {
  private client?: Client
  private authorityValidation?: Promise<void>

  constructor(public readonly options: CatalogClientOptions = {}) {
    const credentials = options.credentials
    if (credentials) {
      assertCompleteCredentials(credentials, 'Catalog credentials')
      if (
        (options.apiUrl && options.apiUrl.replace(/\/+$/, '') !== credentials.apiUrl.replace(/\/+$/, '')) ||
        (options.workspaceId && options.workspaceId !== credentials.workspaceId)
      ) {
        throw new AdkError({
          code: 'CREDENTIAL_AUTHORITY_MISMATCH',
          message: 'Catalog API/workspace options do not match the provided credential authority.',
          expected: true,
        })
      }
    }
  }

  get cacheAuthority(): CatalogCacheAuthority | undefined {
    // Mirror resolveProjectCredentials exactly: explicit fields, then provided
    // credential authority, then ambient project material.
    const apiUrl = this.options.apiUrl ?? this.options.credentials?.apiUrl ?? this.options.project?.agentInfo?.apiUrl
    const workspaceId =
      this.options.workspaceId ?? this.options.credentials?.workspaceId ?? this.options.project?.agentInfo?.workspaceId
    if (!apiUrl || !workspaceId) return undefined
    return { apiUrl: apiUrl.replace(/\/+$/, ''), workspaceId }
  }

  get hasCacheAuthority(): boolean {
    return this.cacheAuthority !== undefined
  }

  async validateAuthority(): Promise<void> {
    if (this.options.credentials) return
    this.authorityValidation ??= this.getClient().then(() => undefined)
    await this.authorityValidation
  }

  async getClient(): Promise<Client> {
    if (this.client) return this.client

    const { project, workspaceId, credentials, apiUrl } = this.options
    this.client = await getProjectClient({
      project,
      credentials,
      apiUrl,
      workspaceId,
      headers: { ...CATALOG_HEADERS },
    })

    return this.client
  }
}
