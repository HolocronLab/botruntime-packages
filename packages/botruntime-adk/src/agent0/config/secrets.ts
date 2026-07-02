import type {
  Agent0Config,
  Agent0ConfigRedacted,
  Agent0ProviderAuth,
  Agent0ProviderAuthRedacted,
  Agent0ProviderConnection,
  Agent0ProviderConnectionRedacted,
} from '../types.js'

function redactProviderAuth(auth: Agent0ProviderAuth | undefined): Agent0ProviderAuthRedacted | undefined {
  if (!auth) return undefined
  return {
    type: auth.type,
    configured: Boolean(auth.apiKey),
    ...(auth.baseURL ? { baseURL: auth.baseURL } : {}),
  }
}

function redactProviderConnection(connection: Agent0ProviderConnection): Agent0ProviderConnectionRedacted {
  return {
    ...connection,
    auth: redactProviderAuth(connection.auth),
  }
}

export function redactAgent0Config(config: Agent0Config): Agent0ConfigRedacted {
  return {
    ...config,
    providers: Object.fromEntries(
      Object.entries(config.providers).map(([providerId, connection]) => [
        providerId,
        redactProviderConnection(connection),
      ])
    ),
  }
}

export function hasAgent0ProviderAuth(connection: Agent0ProviderConnection | undefined): boolean {
  return Boolean(connection?.auth?.apiKey)
}
