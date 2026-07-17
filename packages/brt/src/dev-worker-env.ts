import type { CloudapiClient } from './api/cloudapi-client'
import type { DevBotTarget } from './dev-target'
import * as errors from './errors'

const POSITIVE_NUMERIC_ID = /^[1-9][0-9]*$/
const OPAQUE_RUNTIME_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/

export type DevWorkerEnvironmentOptions = {
  inherited: NodeJS.ProcessEnv | Record<string, string | undefined>
  apiUrl: string
  token: string
  workspaceId: string
  target: DevBotTarget
  spanIngestUrl?: string
  // Decrypted per-bot config variables (env.X parity), fetched by the CLI itself before
  // spawn (the supervisor injects these in prod; `brt dev` has no supervisor). Same
  // naming convention as runtime-host/src/supervisor.ts fetchConfigVars: both the bare
  // name and a SECRET_-prefixed alias (the SDK reads secrets.X from process.env.SECRET_X).
  //
  // Precedence invariant (Codex P2, DEVLP-124): cloud config vars < `inherited` < the
  // runtime identity assignments below. `inherited` carries whatever the caller resolved
  // as explicit local secrets (--secrets K=v or the interactive prompt, folded into `env`
  // by DevCommand#run before this call) — a developer's explicit local secret must win
  // over a stale/different value stored in the cloud for the same key, and the runtime's
  // own identity coordinates (BP_*/ADK_*) must never be shadowed by either.
  configVars?: Record<string, string>
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
  const configVars: Record<string, string> = {}
  for (const [name, value] of Object.entries(options.configVars ?? {})) {
    // Public bot configuration is not a config-var namespace (same reject as the
    // supervisor's fetchConfigVars) even if a stale row still exists in storage.
    if (name === 'ADK_CONFIGURATION') continue
    configVars[name] = value
    configVars[`SECRET_${name}`] = value
  }
  return {
    ...configVars,
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

export type FetchDevConfigVarsOptions = {
  client: CloudapiClient
  runtimeBotId: string
  workspaceId: string
}

/**
 * Pulls this dev bot's own decrypted config variables (env.X parity) before spawn — `brt
 * dev` has no supervisor to do this for it (the production path is runtime-host/src/
 * supervisor.ts fetchConfigVars, gated by the bot's own token there). A 404 means the
 * store has no variables for this bot yet: legally empty, not an error. Any other
 * failure is fail-loud (thrown, not swallowed) — spawning a bot silently missing its
 * secrets would be a worse outcome than refusing to start.
 */
export async function fetchDevConfigVars(options: FetchDevConfigVarsOptions): Promise<Record<string, string>> {
  try {
    const response = await options.client.getDevConfigVariableValues(options.runtimeBotId, options.workspaceId)
    return response.config ?? {}
  } catch (thrown) {
    if (thrown instanceof errors.HTTPError && thrown.status === 404) return {}
    throw errors.BotpressCLIError.wrap(thrown, `Could not fetch dev config variables for "${options.runtimeBotId}"`)
  }
}
