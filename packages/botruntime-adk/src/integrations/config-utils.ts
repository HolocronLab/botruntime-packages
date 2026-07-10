import type { Bot, Client } from '@holocronlab/botruntime-client'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { getProjectClient } from '../auth/index.js'
import type { ServerConnectionCredentials } from '../auth/index.js'
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

export type ServerConfigTarget =
  | {
      environment: 'dev'
      botId?: string
      runtimeBotId?: string
      credentials?: ServerConnectionCredentials
    }
  | {
      environment: 'prod'
      botId: string
      credentials: ServerConnectionCredentials
    }

export type ResolvedDevTargetIdentity = {
  botId: string
  runtimeBotId: string
}

export const DEV_TARGET_BOT_ID_TAG = 'botruntime.devTargetBotId'
const POSITIVE_DECIMAL_ID = /^[1-9][0-9]*$/

function hasCompleteCredentials(value: unknown): value is ServerConnectionCredentials {
  if (!value || typeof value !== 'object') return false
  const credentials = value as Partial<ServerConnectionCredentials>
  return Boolean(credentials.token && credentials.apiUrl && credentials.workspaceId)
}

export function assertServerConfigTarget(target: ServerConfigTarget | undefined): asserts target is ServerConfigTarget {
  if (!target || (target.environment !== 'dev' && target.environment !== 'prod')) {
    throw new AdkError({
      code: 'INVALID_SERVER_CONFIG_TARGET',
      message: 'Generation requires an explicit dev or prod server config target.',
      expected: true,
    })
  }

  if (target.credentials !== undefined && !hasCompleteCredentials(target.credentials)) {
    throw new AdkError({
      code: 'INVALID_SERVER_CONFIG_TARGET',
      message: `${target.environment} server config credentials require token, apiUrl, and workspaceId.`,
      expected: true,
    })
  }

  if (target.environment === 'prod' && (!target.botId || !hasCompleteCredentials(target.credentials))) {
    throw new AdkError({
      code: 'INVALID_SERVER_CONFIG_TARGET',
      message: 'Prod generation requires a canonical botId and authoritative token, apiUrl, and workspaceId.',
      expected: true,
    })
  }

  if (target.environment === 'dev') {
    const hasBotId = target.botId !== undefined
    const hasRuntimeBotId = target.runtimeBotId !== undefined
    if (
      hasBotId !== hasRuntimeBotId ||
      (hasBotId &&
        (!POSITIVE_DECIMAL_ID.test(target.botId!) ||
          target.runtimeBotId!.trim().length === 0 ||
          !hasCompleteCredentials(target.credentials)))
    ) {
      throw new AdkError({
        code: 'INVALID_SERVER_CONFIG_TARGET',
        message:
          'Dev generation must be either bootstrap (no ids) or resolved with positive-decimal botId, nonempty opaque runtimeBotId, and authoritative credentials.',
        expected: true,
      })
    }
  }
}

export function assertDevBotMatchesTarget(bot: Bot, target: ResolvedDevTargetIdentity): void {
  if (!POSITIVE_DECIMAL_ID.test(target.botId) || target.runtimeBotId.trim().length === 0) {
    throw new AdkError({
      code: 'INVALID_SERVER_CONFIG_TARGET',
      message: 'Resolved dev target requires a positive-decimal botId and nonempty opaque runtimeBotId.',
      expected: true,
    })
  }

  const targetTag = (bot.tags as Record<string, unknown> | undefined)?.[DEV_TARGET_BOT_ID_TAG]
  if (bot.id !== target.runtimeBotId || bot.dev !== true || targetTag !== target.botId) {
    throw new AdkError({
      code: 'INVALID_SERVER_CONFIG_TARGET',
      message:
        `Dev target verification failed for runtimeBotId ${target.runtimeBotId}: ` +
        `expected dev:true and ${DEV_TARGET_BOT_ID_TAG}=${target.botId}.`,
      expected: true,
    })
  }
}

export function resolveDevBotTargetIdentity(bot: Bot, runtimeBotId: string): ResolvedDevTargetIdentity {
  const targetTag = (bot.tags as Record<string, unknown> | undefined)?.[DEV_TARGET_BOT_ID_TAG]
  if (
    bot.id !== runtimeBotId ||
    bot.dev !== true ||
    typeof targetTag !== 'string' ||
    !POSITIVE_DECIMAL_ID.test(targetTag)
  ) {
    throw new AdkError({
      code: 'INVALID_SERVER_CONFIG_TARGET',
      message:
        `Dev target verification failed for runtimeBotId ${runtimeBotId}: ` +
        `expected dev:true and a positive-decimal ${DEV_TARGET_BOT_ID_TAG}.`,
      expected: true,
    })
  }
  return { botId: targetTag, runtimeBotId }
}

async function getTargetClient(project: AgentProject, target: ServerConfigTarget): Promise<Client> {
  const headers = { 'x-multiple-integrations': 'true' }
  const addressBotId = target.environment === 'dev' ? target.runtimeBotId : target.botId
  if (target.credentials) {
    return getProjectClient({
      credentials: target.credentials,
      apiUrl: target.credentials.apiUrl,
      workspaceId: target.credentials.workspaceId,
      botId: addressBotId,
      headers,
    })
  }

  return getProjectClient({ project, botId: addressBotId, headers })
}

export async function verifyServerConfigTarget(project: AgentProject, target: ServerConfigTarget): Promise<void> {
  assertServerConfigTarget(target)
  if (target.environment !== 'dev' || !target.botId || !target.runtimeBotId) return

  const client = await getTargetClient(project, target)
  const { bot } = await client.getBot({ id: target.runtimeBotId })
  assertDevBotMatchesTarget(bot, { botId: target.botId, runtimeBotId: target.runtimeBotId })
}

/**
 * Fetches current integration configurations from exactly the target selected
 * by the caller. Environment selection belongs to the command boundary; this
 * helper must never infer or fall back to another bot from project metadata.
 */
export async function fetchServerIntegrationConfigs(
  project: AgentProject,
  target: ServerConfigTarget
): Promise<FetchServerConfigsResult> {
  assertServerConfigTarget(target)
  if (!target.botId) {
    return {
      configs: {},
      enabledStates: {},
      authorizedStates: {},
      fetched: false,
      skipped: true,
    }
  }

  try {
    const client = await getTargetClient(project, target)

    const runtimeBotId = target.environment === 'dev' ? target.runtimeBotId! : target.botId
    return await fetchBotConfigs(client, runtimeBotId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (target.environment === 'prod') {
      throw new AdkError({
        code: 'SERVER_CONFIG_FETCH_FAILED',
        message: `Prod integration config fetch failed: ${message}`,
        expected: true,
        cause: err,
      })
    }
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

  return {
    configs,
    enabledStates,
    authorizedStates,
    fetched: true,
    skipped: false,
  }
}

export type FetchServerPluginConfigsResult = {
  configs: Record<string, Record<string, unknown>>
  fetched: boolean
  skipped: boolean
  error?: string
}

export async function fetchServerPluginConfigs(
  project: AgentProject,
  target: ServerConfigTarget
): Promise<FetchServerPluginConfigsResult> {
  assertServerConfigTarget(target)
  if (!target.botId) {
    return { configs: {}, fetched: false, skipped: true }
  }

  try {
    const client = await getTargetClient(project, target)

    const runtimeBotId = target.environment === 'dev' ? target.runtimeBotId! : target.botId
    return await fetchBotPluginConfigs(client, runtimeBotId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (target.environment === 'prod') {
      throw new AdkError({
        code: 'SERVER_CONFIG_FETCH_FAILED',
        message: `Prod plugin config fetch failed: ${message}`,
        expected: true,
        cause: err,
      })
    }
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
