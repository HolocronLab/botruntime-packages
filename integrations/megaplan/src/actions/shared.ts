import { RuntimeError } from '@botpress/client'
import { MegaplanApiClient, type TokenStore } from '../megaplan-api'
import type { ApiError } from '../types'
import type { Context, Client } from '../bp'

// tokenStore backs the access-token cache with integration state so it survives
// across per-invocation handler runs (the runtime-host builds a fresh client each
// time). Mirrors the Go client's in-memory cache; re-issued only on 401.
function tokenStore(ctx: Context, client: Client): TokenStore {
  const ref = { type: 'integration', name: 'megaplanAuth', id: ctx.integrationId } as const
  return {
    async load() {
      const { state } = await client.getOrSetState({ ...ref, payload: { accessToken: null } })
      return state.payload.accessToken
    },
    async save(token) {
      await client.setState({ ...ref, payload: { accessToken: token } })
    },
    async clear() {
      await client.setState({ ...ref, payload: { accessToken: null } })
    },
  }
}

export function buildClient(ctx: Context, client: Client): MegaplanApiClient {
  return new MegaplanApiClient({
    baseUrl: ctx.configuration.baseUrl,
    username: ctx.configuration.username,
    password: ctx.configuration.password,
    tokenStore: tokenStore(ctx, client),
  })
}

// run wraps a handler body, surfacing failures LOUDLY as RuntimeError (the kernel
// treats a thrown handler as a hard failure — no error-shaped fallback). The typed
// APIError status is preserved in the message so a misconfig reads differently from
// a transient fault.
export async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (thrown) {
    const err = thrown as Partial<ApiError> & Error
    throw new RuntimeError(err?.message ?? String(thrown))
  }
}
