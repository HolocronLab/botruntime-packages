import { Client } from '@holocronlab/botruntime-client'
import { auth } from '../auth/index.js'
import type { Credentials } from '../auth/index.js'

interface WorkspaceInfo {
  id: string
  name: string
  fetchedAt: number
}

class WorkspaceCache {
  private cache: Map<string, WorkspaceInfo> = new Map()
  private readonly CACHE_TTL = 60 * 60 * 1000 // 1 hour

  async getWorkspaceName(workspaceId: string, credentials?: Credentials): Promise<string | undefined> {
    const resolvedCredentials = credentials ?? (await auth.getActiveCredentials())
    const apiUrl = resolvedCredentials.apiUrl ?? 'https://api.botpress.cloud'
    const cacheKey = `${apiUrl.replace(/\/+$/, '')}:${workspaceId}`

    // Check cache first
    const cached = this.cache.get(cacheKey)
    if (cached && Date.now() - cached.fetchedAt < this.CACHE_TTL) {
      return cached.name
    }

    try {
      const client = new Client({
        apiUrl,
        token: resolvedCredentials.token,
        headers: {
          'x-multiple-integrations': 'true',
        },
      })

      // Fetch all workspaces and find the one with matching ID
      const { workspaces } = await client.listWorkspaces({})
      const workspace = workspaces.find((ws) => ws.id === workspaceId)

      if (!workspace) {
        return undefined
      }

      // Cache the result
      this.cache.set(cacheKey, {
        id: workspaceId,
        name: workspace.name,
        fetchedAt: Date.now(),
      })

      return workspace.name
    } catch {
      return undefined
    }
  }

  clear(): void {
    this.cache.clear()
  }
}

// Export singleton instance
export const workspaceCache = new WorkspaceCache()
