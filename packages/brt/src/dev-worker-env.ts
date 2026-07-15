import type { DevBotTarget } from './dev-target'

const POSITIVE_NUMERIC_ID = /^[1-9][0-9]*$/
const OPAQUE_RUNTIME_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export type DevWorkerEnvironmentOptions = {
  inherited: NodeJS.ProcessEnv | Record<string, string | undefined>
  apiUrl: string
  token: string
  workspaceId: string
  target: DevBotTarget
  spanIngestUrl?: string
}

/**
 * Builds the child environment from an already-attested dev target. Requiring
 * the complete target as one value prevents a worker from starting with a
 * stale mix of opaque runtime and numeric storage identities.
 */
export function buildDevWorkerEnvironment(options: DevWorkerEnvironmentOptions): Record<string, string> {
  const apiUrl = options.apiUrl.replace(/\/+$/, '')
  if (!apiUrl) throw new Error('Dev API URL is required')
  if (!options.token) throw new Error('Dev PAT token is required')
  if (!POSITIVE_NUMERIC_ID.test(options.workspaceId)) {
    throw new Error('Dev workspace id must be a positive numeric id')
  }
  if (!POSITIVE_NUMERIC_ID.test(options.target.targetBotId)) {
    throw new Error('Dev target bot id must be a positive numeric id')
  }
  if (
    !OPAQUE_RUNTIME_ID.test(options.target.runtimeBotId) ||
    POSITIVE_NUMERIC_ID.test(options.target.runtimeBotId)
  ) {
    throw new Error('Dev runtime bot id must be a valid opaque runtime identity')
  }

  const inherited = Object.fromEntries(
    Object.entries(options.inherited).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  )
  return {
    ...inherited,
    NODE_ENV: 'development',
    ADK_RUNTIME_MODE: 'development',
    BP_API_URL: apiUrl,
    ADK_API_URL: apiUrl,
    BP_TOKEN: options.token,
    ADK_TOKEN: options.token,
    BP_BOT_ID: options.target.runtimeBotId,
    ADK_BOT_ID: options.target.runtimeBotId,
    BP_TARGET_BOT_ID: options.target.targetBotId,
    ADK_TARGET_BOT_ID: options.target.targetBotId,
    BP_WORKSPACE_ID: options.workspaceId,
    ADK_WORKSPACE_ID: options.workspaceId,
    ...(options.spanIngestUrl ? { ADK_SPAN_INGEST_URL: options.spanIngestUrl } : {}),
  }
}
