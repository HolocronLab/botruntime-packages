import { Client, ClientInputs } from '@holocronlab/botruntime-client'
import type { AgentConfigDiff, SyncCallbacks } from './types.js'
import type { AgentConfig } from '../agent-project/types.js'

export type Bot = Omit<ClientInputs['updateBot'], 'id'>

export interface AgentConfigSyncOptions extends SyncCallbacks {}

export class AgentConfigSyncManager {
  private client: Client

  constructor(client: Client) {
    this.client = client
  }

  private async performSync(botId: string, updates: Partial<Bot>, options?: AgentConfigSyncOptions): Promise<boolean> {
    if (Object.keys(updates).length === 0) {
      return false
    }

    try {
      options?.onProgress?.('Updating bot configuration...')
      await this.client.updateBot({ id: botId, ...updates })
      options?.onSuccess?.('Bot configuration updated')
      return true
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      options?.onError?.(`Failed to sync agent config: ${errorMsg}`)
      throw error
    }
  }

  // Sync agent config from project config object (used by adk-deploy)
  async syncFromConfig(
    botId: string,
    config: Partial<AgentConfig>,
    options?: AgentConfigSyncOptions
  ): Promise<boolean> {
    const updates: Partial<Bot> = {}

    if (config.name !== undefined) {
      updates.name = config.name
    }
    if (config.maxExecutionTime !== undefined) {
      updates.maxExecutionTime = config.maxExecutionTime
    }
    return this.performSync(botId, updates, options)
  }

  // Sync agent config from preflight changes (used by adk-dev)
  async syncFromChanges(
    botId: string,
    configChanges: AgentConfigDiff[],
    options?: AgentConfigSyncOptions
  ): Promise<boolean> {
    if (!configChanges || configChanges.length === 0) {
      return false
    }

    const updates: Partial<Bot> = {}

    for (const change of configChanges) {
      switch (change.field) {
        case 'name':
          updates.name = change.newValue as string
          break
        case 'maxExecutionTime':
          updates.maxExecutionTime = change.newValue as number
          break
        default:
          options?.onProgress?.(`Warning: Unknown config field '${change.field}' - skipping sync`)
      }
    }

    return this.performSync(botId, updates, options)
  }
}
