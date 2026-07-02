import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { auth } from './index.js'

interface BpCliCredentials {
  token: string
  workspaceId: string
  apiUrl: string
  botId?: string
}

export class BpCliImporter {
  private bpCachePath: string

  constructor() {
    // BP CLI stores credentials in ~/.botpress/global.cache.json
    this.bpCachePath = path.join(os.homedir(), '.botpress', 'global.cache.json')
  }

  async hasBpCliCredentials(): Promise<boolean> {
    try {
      await fs.access(this.bpCachePath)
      return true
    } catch {
      return false
    }
  }

  async getBpCliCredentials(): Promise<BpCliCredentials | null> {
    try {
      const data = await fs.readFile(this.bpCachePath, 'utf-8')
      const credentials = JSON.parse(data) as BpCliCredentials

      // Validate required fields
      if (!credentials.token || !credentials.workspaceId || !credentials.apiUrl) {
        return null
      }

      return credentials
    } catch {
      return null
    }
  }

  async importFromBpCli(profileName: string = 'default'): Promise<boolean> {
    const bpCredentials = await this.getBpCliCredentials()
    if (!bpCredentials) {
      return false
    }

    try {
      // Login with BP CLI credentials
      await auth.login(bpCredentials.token, {
        profile: profileName,
        apiUrl: bpCredentials.apiUrl,
      })

      // The login process will have saved basic credentials
      // Now we need to update them with the workspace ID from BP CLI
      // We'll do this by creating a new CredentialsManager instance
      const credentialsManager = new (await import('./credentials.js')).CredentialsManager()

      // Read current credentials
      const store = await credentialsManager['readCredentials']()

      if (store.profiles[profileName]) {
        store.profiles[profileName].workspaceId = bpCredentials.workspaceId
        if (bpCredentials.botId) {
          store.profiles[profileName].botId = bpCredentials.botId
        }
        await credentialsManager['writeCredentials'](store)
      }

      return true
    } catch {
      return false
    }
  }
}

export const bpCliImporter = new BpCliImporter()
