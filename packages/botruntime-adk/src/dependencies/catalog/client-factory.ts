import { Client } from '@holocronlab/botruntime-client'
import { getProjectClient, type Credentials, type ProjectCredentialsContext } from '../../auth/index.js'

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

  constructor(public readonly options: CatalogClientOptions = {}) {}

  async getClient(): Promise<Client> {
    if (this.client) return this.client

    const { project, workspaceId, credentials, apiUrl } = this.options
    const hasProjectScope = !!(project || workspaceId)

    if (hasProjectScope) {
      this.client = await getProjectClient({
        project,
        credentials,
        apiUrl,
        workspaceId,
        headers: { ...CATALOG_HEADERS },
      })
    } else if (credentials) {
      this.client = new Client({
        token: credentials.token,
        apiUrl: apiUrl || credentials.apiUrl,
        ...(credentials.workspaceId ? { workspaceId: credentials.workspaceId } : {}),
        headers: { ...CATALOG_HEADERS },
      })
    } else {
      this.client = await getProjectClient({ headers: { ...CATALOG_HEADERS } })
    }

    return this.client
  }
}
