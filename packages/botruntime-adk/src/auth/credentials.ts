import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { resolveAgent } from '../agent-project/agent-resolver.js'

export interface Credentials {
  token: string
  apiUrl: string
  workspaceId?: string
  workspaceName?: string
  botId?: string
}

export interface Profile {
  name: string
  credentials: Credentials
  apiUrl: string
  lastUsed: string
  email?: string
  displayName?: string
  accountId?: string
  createdAt?: string
}

export interface ProfileMetadata {
  lastUsed: string
  accountId?: string
  email?: string
  displayName?: string
  createdAt?: string
}

export interface CredentialsStore {
  profiles: Record<string, Credentials>
  profileMetadata: Record<string, ProfileMetadata>
  currentProfile: string
}

export class CredentialsManager {
  private credentialsPath: string
  private configDir: string
  private profileOverride: string | undefined

  constructor() {
    // Store credentials in ~/.adk/credentials
    this.configDir = path.join(os.homedir(), '.adk')
    this.credentialsPath = path.join(this.configDir, 'credentials')
  }

  /**
   * Set a profile override that takes precedence over the stored current profile.
   * This is used by the CLI's global --profile flag.
   */
  setProfileOverride(profile: string | undefined): void {
    this.profileOverride = profile
  }

  private async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true })
    } catch {
      // Directory might already exist, that's fine
    }
  }

  private async readCredentials(): Promise<CredentialsStore> {
    try {
      const data = await fs.readFile(this.credentialsPath, 'utf-8')
      return JSON.parse(data)
    } catch {
      // If file doesn't exist or is invalid, return empty store
      return {
        profiles: {},
        profileMetadata: {},
        currentProfile: 'default',
      }
    }
  }

  private async writeCredentials(store: CredentialsStore): Promise<void> {
    await this.ensureConfigDir()
    await fs.writeFile(this.credentialsPath, JSON.stringify(store, null, 2))
    // Set restrictive permissions (read/write for owner only)
    await fs.chmod(this.credentialsPath, 0o600)
  }

  async saveCredentials(
    profileName: string,
    credentials: Credentials,
    userInfo?: Partial<ProfileMetadata>
  ): Promise<void> {
    const store = await this.readCredentials()
    store.profiles[profileName] = credentials

    // Initialize metadata if it doesn't exist
    if (!store.profileMetadata) {
      store.profileMetadata = {}
    }

    // Update metadata with user info
    store.profileMetadata[profileName] = {
      lastUsed: new Date().toISOString(),
      ...userInfo,
    }

    // If this is the first profile, make it current
    if (Object.keys(store.profiles).length === 1) {
      store.currentProfile = profileName
    }

    await this.writeCredentials(store)
  }

  async getCredentials(profileName?: string): Promise<Credentials | null> {
    const store = await this.readCredentials()
    const profile = profileName || store.currentProfile

    if (!store.profiles[profile]) {
      return null
    }

    return store.profiles[profile]
  }

  async listProfiles(): Promise<Profile[]> {
    const store = await this.readCredentials()

    // Initialize metadata if it doesn't exist
    if (!store.profileMetadata) {
      store.profileMetadata = {}
    }

    return Object.entries(store.profiles).map(([name, credentials]) => {
      const metadata = store.profileMetadata[name] || ({} as ProfileMetadata)
      return {
        name,
        credentials,
        apiUrl: credentials.apiUrl,
        lastUsed: metadata.lastUsed || new Date().toISOString(),
        email: metadata.email,
        displayName: metadata.displayName,
        accountId: metadata.accountId,
        createdAt: metadata.createdAt,
      }
    })
  }

  async getCurrentProfile(): Promise<string> {
    const store = await this.readCredentials()
    return store.currentProfile || 'default'
  }

  async getCurrentProfileDetails(): Promise<Profile | null> {
    const store = await this.readCredentials()
    const currentProfileName = store.currentProfile || 'default'

    if (!store.profiles[currentProfileName]) {
      return null
    }

    const credentials = store.profiles[currentProfileName]
    const metadata = store.profileMetadata?.[currentProfileName] || ({} as ProfileMetadata)

    return {
      name: currentProfileName,
      credentials,
      apiUrl: credentials.apiUrl,
      lastUsed: metadata.lastUsed || new Date().toISOString(),
      email: metadata.email,
      displayName: metadata.displayName,
      accountId: metadata.accountId,
      createdAt: metadata.createdAt,
    }
  }

  async setCurrentProfile(profileName: string): Promise<void> {
    const store = await this.readCredentials()

    if (!store.profiles[profileName]) {
      throw new AdkError({
        code: 'PROFILE_NOT_FOUND',
        message: `Profile '${profileName}' not found`,
        expected: true,
      })
    }

    // Initialize metadata if it doesn't exist
    if (!store.profileMetadata) {
      store.profileMetadata = {}
    }

    // Update last used time while preserving other metadata
    store.profileMetadata[profileName] = {
      ...store.profileMetadata[profileName], // Preserve existing metadata
      lastUsed: new Date().toISOString(),
    }

    store.currentProfile = profileName
    await this.writeCredentials(store)
  }

  async deleteProfile(profileName: string): Promise<void> {
    const store = await this.readCredentials()

    if (!store.profiles[profileName]) {
      throw new AdkError({
        code: 'PROFILE_NOT_FOUND',
        message: `Profile '${profileName}' not found`,
        expected: true,
      })
    }

    delete store.profiles[profileName]
    delete store.profileMetadata?.[profileName]

    // If we deleted the current profile, switch to another one
    if (store.currentProfile === profileName) {
      const remainingProfiles = Object.keys(store.profiles)
      store.currentProfile = remainingProfiles.length > 0 ? remainingProfiles[0]! : 'default'
    }

    await this.writeCredentials(store)
  }

  async getActiveCredentials(): Promise<Credentials> {
    // Priority: 1) profileOverride (--profile flag), 2) stored currentProfile
    const profileName = this.profileOverride

    const credentials = await this.getCredentials(profileName)

    if (!credentials) {
      const displayName = profileName || 'default'
      throw new AdkError({
        code: 'NOT_AUTHENTICATED',
        message: `No credentials found for profile '${displayName}'. ` + `Please run 'adk login' to authenticate.`,
        expected: true,
        suggestion: "Run 'adk login' to authenticate.",
      })
    }

    return credentials
  }

  /**
   * Find a profile whose apiUrl matches the given URL.
   * Returns the credentials of the first matching profile, or null if none match.
   * Accepts a pre-loaded store to avoid redundant file reads.
   */
  private findProfileByApiUrl(store: CredentialsStore, apiUrl: string): Credentials | null {
    const normalizedUrl = apiUrl.replace(/\/+$/, '') // strip trailing slashes

    for (const [, credentials] of Object.entries(store.profiles)) {
      if (!credentials.apiUrl) continue
      const profileUrl = credentials.apiUrl.replace(/\/+$/, '')
      if (profileUrl === normalizedUrl) {
        return credentials
      }
    }

    return null
  }

  /**
   * Get credentials for agent-specific operations
   * This will prioritize workspaceId and apiUrl from agent.json over credentials file.
   * When no explicit profile is specified, it auto-selects the profile whose apiUrl
   * matches the agent.json apiUrl.
   *
   * @param agentPath - Path to the agent project directory
   * @throws Error if agent.json is missing or doesn't contain workspaceId
   */
  async getAgentCredentials(agentPath: string): Promise<Credentials> {
    // Resolve agent.json first to determine the target API URL
    const agentInfo = await resolveAgent(agentPath, {
      required: true,
      requireWorkspace: true,
    })

    // agentInfo is guaranteed to be non-null and have workspaceId due to options above
    // apiUrl is also guaranteed by resolveAgent which defaults it to DEFAULT_API_URL
    const agentApiUrl = agentInfo!.apiUrl!

    // Determine base credentials:
    // If user explicitly specified a profile (--profile flag), honor that.
    // Otherwise, try to find a profile that matches the agent's API URL.
    let baseCredentials: Credentials

    const hasExplicitProfile = !!this.profileOverride

    if (hasExplicitProfile) {
      baseCredentials = await this.getActiveCredentials()
    } else {
      // Read the store once and reuse it for both the profile lookup and the fallback
      const store = await this.readCredentials()
      const matchingCredentials = this.findProfileByApiUrl(store, agentApiUrl)
      if (matchingCredentials) {
        baseCredentials = matchingCredentials
      } else {
        // Fall back to the active profile from the same store read
        const profileName = store.currentProfile || 'default'
        const activeCredentials = store.profiles[profileName]
        if (!activeCredentials) {
          throw new AdkError({
            code: 'NOT_AUTHENTICATED',
            message: `No credentials found for profile '${profileName}'. ` + `Please run 'adk login' to authenticate.`,
            expected: true,
            suggestion: "Run 'adk login' to authenticate.",
          })
        }
        baseCredentials = activeCredentials
      }
    }

    return {
      ...baseCredentials,
      apiUrl: agentApiUrl,
      workspaceId: agentInfo!.workspaceId,
      botId: agentInfo!.botId,
    }
  }
}
