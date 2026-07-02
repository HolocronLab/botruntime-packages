import { Client } from '@holocronlab/botruntime-client'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { CredentialsManager, Credentials, Profile } from './credentials.js'
import { AuthService, type AuthResult } from './service.js'
import type { AgentInfo } from '../agent-project/types.js'
import { resolveAgent } from '../agent-project/agent-resolver.js'

export interface LoginOptions {
  profile?: string
  apiUrl?: string
}

export interface AuthAPI {
  login(token: string, options?: LoginOptions): Promise<void>
  logout(profile?: string): Promise<void>
  listProfiles(): Promise<Profile[]>
  getCurrentProfile(): Promise<string>
  getCurrentProfileDetails(): Promise<Profile | null>
  setCurrentProfile(profileName: string): Promise<void>
  setProfileOverride(profile: string | undefined): void
  getActiveCredentials(): Promise<Credentials>
  getAgentCredentials(agentPath: string): Promise<Credentials>
  validateToken(token: string, apiUrl?: string): Promise<boolean>
}

class Auth implements AuthAPI {
  private credentialsManager: CredentialsManager

  constructor() {
    this.credentialsManager = new CredentialsManager()
  }

  async login(token: string, options: LoginOptions = {}): Promise<void> {
    const apiUrl = options.apiUrl ?? 'https://api.botpress.cloud'

    // Validate the token first
    const authService = new AuthService(apiUrl)
    const authResult = await authService.validateToken(token)

    const autoResolved = options.profile == null
    const profile = options.profile ?? (await this.resolveProfileName(authResult))

    // Set account preference to indicate ADK CLI is connected (best effort, don't fail login)
    try {
      const client = new Client({ apiUrl, token })
      await client.setAccountPreference({ key: 'adkCliConnected', value: true })
    } catch {
      // Silently ignore - this is a non-critical operation
    }

    // Save credentials with user info
    await this.credentialsManager.saveCredentials(
      profile,
      {
        token,
        apiUrl,
        workspaceId: authResult.workspaceId,
        workspaceName: authResult.workspaceName,
        botId: authResult.botId,
      },
      {
        email: authResult.email,
        displayName: authResult.displayName,
        accountId: authResult.accountId,
        createdAt: authResult.createdAt,
      }
    )

    // Switch to the new profile when auto-resolved (dev console "Add profile" flow).
    // When the caller provides an explicit profile name (CLI), don't change the active profile.
    if (autoResolved) {
      await this.credentialsManager.setCurrentProfile(profile)
    }

    clearProjectClientCache()
  }

  private async resolveProfileName(authResult: AuthResult): Promise<string> {
    const profiles = await this.credentialsManager.listProfiles()

    if (profiles.length === 0) {
      return 'default'
    }

    // Reuse existing profile for the same account
    if (authResult.accountId) {
      const existing = profiles.find((p) => p.accountId === authResult.accountId)
      if (existing) {
        return existing.name
      }
    }

    // New account — derive a unique name from the email
    if (authResult.email) {
      const baseName = authResult.email.split('@')[0] || 'profile'
      const existingNames = new Set(profiles.map((p) => p.name))
      if (!existingNames.has(baseName)) {
        return baseName
      }
      let i = 2
      while (existingNames.has(`${baseName}-${i}`)) {
        i++
      }
      return `${baseName}-${i}`
    }

    const existingNames = new Set(profiles.map((p) => p.name))
    let i = profiles.length + 1
    while (existingNames.has(`profile-${i}`)) {
      i++
    }
    return `profile-${i}`
  }

  async logout(profile?: string): Promise<void> {
    if (profile) {
      await this.credentialsManager.deleteProfile(profile)
    } else {
      // Delete current profile
      const currentProfile = await this.credentialsManager.getCurrentProfile()
      await this.credentialsManager.deleteProfile(currentProfile)
    }
    clearProjectClientCache()
  }

  async listProfiles(): Promise<Profile[]> {
    return this.credentialsManager.listProfiles()
  }

  async getCurrentProfile(): Promise<string> {
    return this.credentialsManager.getCurrentProfile()
  }

  async getCurrentProfileDetails(): Promise<Profile | null> {
    return this.credentialsManager.getCurrentProfileDetails()
  }

  async setCurrentProfile(profileName: string): Promise<void> {
    await this.credentialsManager.setCurrentProfile(profileName)
    clearProjectClientCache()
  }

  setProfileOverride(profile: string | undefined): void {
    this.credentialsManager.setProfileOverride(profile)
    clearProjectClientCache()
  }

  async getActiveCredentials(): Promise<Credentials> {
    return this.credentialsManager.getActiveCredentials()
  }

  async getAgentCredentials(agentPath: string): Promise<Credentials> {
    return this.credentialsManager.getAgentCredentials(agentPath)
  }

  async validateToken(token: string, apiUrl?: string): Promise<boolean> {
    const authService = new AuthService(apiUrl)
    return authService.testConnection(token)
  }
}

// Export singleton instance
export const auth = new Auth()

export interface ProjectCredentialsContext {
  path?: string
  agentInfo?: AgentInfo | null
}

export interface ResolveProjectCredentialsOptions {
  project?: ProjectCredentialsContext
  credentials?: Credentials
  apiUrl?: string
  workspaceId?: string
  botId?: string
}

export type WorkspaceCredentials = Credentials & { workspaceId: string }
export type BotCredentials = WorkspaceCredentials & { botId: string }

export async function resolveProjectCredentials(options: ResolveProjectCredentialsOptions = {}): Promise<Credentials> {
  const { project, credentials: providedCredentials } = options

  const agentInfo = project?.agentInfo ?? (project?.path ? await resolveAgent(project.path) : undefined)
  const baseCredentials =
    providedCredentials ||
    (project?.path && agentInfo?.workspaceId
      ? await auth.getAgentCredentials(project.path)
      : await auth.getActiveCredentials())
  const workspaceId = options.workspaceId || agentInfo?.workspaceId || baseCredentials.workspaceId
  const botId = options.botId || agentInfo?.botId || baseCredentials.botId

  return {
    ...baseCredentials,
    apiUrl: options.apiUrl || agentInfo?.apiUrl || baseCredentials.apiUrl,
    ...(workspaceId ? { workspaceId } : {}),
    ...(botId ? { botId } : {}),
  }
}

export async function resolveWorkspaceCredentials(
  options: ResolveProjectCredentialsOptions = {}
): Promise<WorkspaceCredentials> {
  const credentials = await resolveProjectCredentials(options)

  if (!credentials.workspaceId) {
    throw new AdkError({
      code: 'WORKSPACE_ID_MISSING',
      message: 'No workspace ID found. Please login again with "adk login" or link your agent first.',
      expected: true,
      suggestion: 'Login again with "adk login" or link your agent first.',
    })
  }

  return {
    ...credentials,
    workspaceId: credentials.workspaceId,
  }
}

export async function resolveBotCredentials(options: ResolveProjectCredentialsOptions = {}): Promise<BotCredentials> {
  const credentials = await resolveWorkspaceCredentials(options)

  if (!credentials.botId) {
    throw new AdkError({
      code: 'BOT_ID_MISSING',
      message: 'No bot ID found. Please link your agent first.',
      expected: true,
      suggestion: 'Link your agent first.',
    })
  }

  return {
    ...credentials,
    botId: credentials.botId,
  }
}

export interface GetProjectClientOptions extends ResolveProjectCredentialsOptions {
  integrationId?: string
  integrationAlias?: string
  headers?: Record<string, string | string[]>
}

const projectClientCache = new Map<string, Client>()
const MAX_PROJECT_CLIENT_CACHE_ENTRIES = 32

const stableStringify = (value: unknown): string => {
  if (value === undefined) {
    return 'undefined'
  }

  if (!value || typeof value !== 'object') {
    return JSON.stringify(value)!
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const record = value as Record<string, unknown>
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`
}

export async function getProjectClient(options: GetProjectClientOptions = {}): Promise<Client> {
  const credentials = await resolveWorkspaceCredentials(options)
  const botId = options.botId
  const headers = {
    'x-multiple-integrations': 'true',
    ...(options.headers ?? {}),
  }
  const cacheKey = stableStringify({
    token: credentials.token,
    apiUrl: credentials.apiUrl,
    workspaceId: credentials.workspaceId,
    botId,
    integrationId: options.integrationId,
    integrationAlias: options.integrationAlias,
    headers,
  })

  const cached = projectClientCache.get(cacheKey)
  if (cached) {
    projectClientCache.delete(cacheKey)
    projectClientCache.set(cacheKey, cached)
    return cached
  }

  const client = new Client({
    token: credentials.token,
    apiUrl: credentials.apiUrl,
    workspaceId: credentials.workspaceId,
    ...(botId ? { botId } : {}),
    ...(options.integrationId ? { integrationId: options.integrationId } : {}),
    ...(options.integrationAlias ? { integrationAlias: options.integrationAlias } : {}),
    headers,
  })

  if (projectClientCache.size >= MAX_PROJECT_CLIENT_CACHE_ENTRIES) {
    const oldestKey = projectClientCache.keys().next().value
    if (oldestKey) {
      projectClientCache.delete(oldestKey)
    }
  }

  projectClientCache.set(cacheKey, client)
  return client
}

export function clearProjectClientCache(): void {
  projectClientCache.clear()
}

// Export types
export type { Credentials, Profile } from './credentials.js'
export type { AuthResult } from './service.js'

// Export classes
export { CredentialsManager } from './credentials.js'

// Export BP CLI importer
export { bpCliImporter } from './bp-cli-import.js'
