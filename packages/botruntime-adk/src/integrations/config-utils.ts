import type { Client } from '@holocronlab/botruntime-client'
import { getProjectClient } from '../auth/index.js'
import type { AgentProject } from '../agent-project/agent-project.js'

/**
 * Merges integration configuration for API calls.
 * - If no local config is defined (undefined), preserves server-side config entirely.
 * - If local config is defined, merges it on top of server-side config (local wins per-key).
 */
export function mergeIntegrationConfig(
  current: Record<string, unknown> | undefined,
  desired: Record<string, unknown> | undefined
): Record<string, unknown> {
  if (desired === undefined) {
    return current || {}
  }
  return { ...(current || {}), ...desired }
}

export interface FetchServerConfigsResult {
  configs: Record<string, Record<string, unknown>>
  enabledStates: Record<string, boolean>
  /**
   * Per-integration *authorization* state on the target bot, from `getBot`: `true` when the
   * cloud integration has an `identifier` (the OAuth/connection flow was completed). Distinct
   * from `enabledStates`: a managed-OAuth integration can be `enabled` yet unauthorized
   * (toggled on, never connected), which Cloud's `register` hook hard-fails on. Codegen uses
   * this to leave an unauthorized auth-gated integration inert (`enabled: false`) instead of
   * letting the whole `bp` deploy/dev boot abort. A missing alias means the integration is not
   * on the cloud bot yet (treated as unauthorized). Mirrors `bp`'s own
   * `isAuthorized = !!integration.identifier`.
   */
  authorizedStates: Record<string, boolean>
  fetched: boolean
  skipped: boolean
  error?: string
}

/**
 * Fetches current integration configurations from the server for a given bot.
 *
 * When `targetBotId` is provided, fetches from that specific bot (used during
 * deploy/build to fetch from the production bot). Otherwise falls back to
 * devId → botId resolution (used during adk dev to fetch from the dev bot).
 */
export async function fetchServerIntegrationConfigs(
  project: AgentProject,
  targetBotId?: string
): Promise<FetchServerConfigsResult> {
  const { devId, botId } = project.agentInfo ?? {}
  const targetId = targetBotId || devId || botId
  if (!targetId) {
    return { configs: {}, enabledStates: {}, authorizedStates: {}, fetched: false, skipped: true }
  }

  try {
    const client = await getProjectClient({
      project,
      headers: { 'x-multiple-integrations': 'true' },
    })

    try {
      return await fetchBotConfigs(client, targetId)
    } catch (err) {
      // If explicit target was given, don't fall back
      if (targetBotId) {
        throw err
      }
      // If devId fetch failed and a separate botId exists, fall back to production bot
      if (devId && botId && devId !== botId) {
        return await fetchBotConfigs(client, botId)
      }
      throw err
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      configs: {},
      enabledStates: {},
      authorizedStates: {},
      fetched: false,
      skipped: false,
      error: message,
    }
  }
}

async function fetchBotConfigs(client: Client, botId: string): Promise<FetchServerConfigsResult> {
  const { bot } = await client.getBot({ id: botId })
  const configs: Record<string, Record<string, unknown>> = {}
  const enabledStates: Record<string, boolean> = {}
  const authorizedStates: Record<string, boolean> = {}

  for (const [alias, integration] of Object.entries(bot.integrations || {})) {
    if (integration.configuration && Object.keys(integration.configuration).length > 0) {
      configs[alias] = integration.configuration
    }
    enabledStates[alias] = integration.enabled
    authorizedStates[alias] = !!integration.identifier
  }

  return { configs, enabledStates, authorizedStates, fetched: true, skipped: false }
}

export type FetchServerPluginConfigsResult = {
  configs: Record<string, Record<string, unknown>>
  fetched: boolean
  skipped: boolean
  error?: string
}

export async function fetchServerPluginConfigs(
  project: AgentProject,
  targetBotId?: string
): Promise<FetchServerPluginConfigsResult> {
  const { devId, botId } = project.agentInfo ?? {}
  const targetId = targetBotId || devId || botId
  if (!targetId) {
    return { configs: {}, fetched: false, skipped: true }
  }

  try {
    const client = await getProjectClient({
      project,
      headers: { 'x-multiple-integrations': 'true' },
    })

    try {
      return await fetchBotPluginConfigs(client, targetId)
    } catch (err) {
      if (targetBotId) {
        throw err
      }
      if (devId && botId && devId !== botId) {
        return await fetchBotPluginConfigs(client, botId)
      }
      throw err
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { configs: {}, fetched: false, skipped: false, error: message }
  }
}

async function fetchBotPluginConfigs(client: Client, botId: string): Promise<FetchServerPluginConfigsResult> {
  const { bot } = await client.getBot({ id: botId })
  const configs: Record<string, Record<string, unknown>> = {}

  for (const [alias, plugin] of Object.entries(bot.plugins || {})) {
    if (plugin.configuration && Object.keys(plugin.configuration).length > 0) {
      configs[alias] = plugin.configuration
    }
  }

  return { configs, fetched: true, skipped: false }
}
