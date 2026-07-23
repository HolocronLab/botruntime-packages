import { isBrowser, isNode } from 'browser-or-node'
import * as types from './types'

const defaultApiUrl = 'https://botruntime.ru'
export const DEFAULT_API_REQUEST_TIMEOUT_MS = 125_000
// An action may spend up to 30s in the host queue, 30s in process startup, and
// 119s in integration execution. The 190s transport budget covers that 179s
// lifecycle with 11s left for request/response transit. This longer value is
// action-specific; other API calls retain the released 125-second default.
export const DEFAULT_ACTION_REQUEST_TIMEOUT_MS = 190_000
const defaultDebug = false

const apiUrlEnvName = 'BP_API_URL'
const botIdEnvName = 'BP_BOT_ID'
const integrationIdEnvName = 'BP_INTEGRATION_ID'
const workspaceIdEnvName = 'BP_WORKSPACE_ID'
const tokenEnvName = 'BP_TOKEN'

type AnyClientProps = types.CommonClientProps & {
  integrationId?: string
  integrationAlias?: string
  workspaceId?: string
  botId?: string
  token?: string
}

export function getClientConfig(clientProps: AnyClientProps): types.ClientConfig {
  const props = readEnvConfig(clientProps)

  let headers: Record<string, string | string[]> = {}

  if (props.workspaceId) {
    headers['x-workspace-id'] = props.workspaceId
  }

  if (props.botId) {
    headers['x-bot-id'] = props.botId
  }

  if (props.integrationId) {
    headers['x-integration-id'] = props.integrationId
  }

  if (props.integrationAlias) {
    headers['x-integration-alias'] = props.integrationAlias
  }

  if (props.token) {
    headers.Authorization = `Bearer ${props.token}`
  }

  headers = {
    ...headers,
    ...props.headers,
  }

  const apiUrl = props.apiUrl ?? defaultApiUrl
  const timeout = props.timeout ?? DEFAULT_API_REQUEST_TIMEOUT_MS
  const actionTransportTimeoutMs = props.timeout ?? DEFAULT_ACTION_REQUEST_TIMEOUT_MS
  const debug = props.debug ?? defaultDebug

  return {
    apiUrl,
    timeout,
    actionTransportTimeoutMs,
    actionTimeoutMs: props.actionTimeoutMs,
    withCredentials: isBrowser,
    headers,
    debug,
  }
}

function readEnvConfig(props: AnyClientProps): AnyClientProps {
  if (isBrowser) {
    return getBrowserConfig(props)
  }

  if (isNode) {
    return getNodeConfig(props)
  }

  return props
}

function getNodeConfig(props: AnyClientProps): AnyClientProps {
  const config: AnyClientProps = {
    ...props,
    apiUrl: props.apiUrl ?? process.env[apiUrlEnvName],
    botId: props.botId ?? process.env[botIdEnvName],
    integrationId: props.integrationId ?? process.env[integrationIdEnvName],
    integrationAlias: props.integrationAlias,
    workspaceId: props.workspaceId ?? process.env[workspaceIdEnvName],
  }

  const token = config.token ?? process.env[tokenEnvName]

  if (token) {
    config.token = token
  }

  return config
}

function getBrowserConfig(props: AnyClientProps): AnyClientProps {
  return props
}
