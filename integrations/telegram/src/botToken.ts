import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { Client } from './misc/types'

// Donor src/botToken.ts, adapted off the generated `.botpress` client to our minimal Client type.
// On our host the token is delivered per-install in ctx.configuration (x-bp-configuration), so the
// legacy `configToken` fallback is the LIVE path; the integration-state read stays for parity with
// the donor's wizard-stored credentials (getState 404 -> "not found" -> fall through to config).
export const getStoredBotToken = async (
  client: Client,
  integrationId: string,
  configToken?: string
): Promise<string> => {
  // Any non-"not found" failure (e.g. a client 401 when BP_TOKEN is unset) is re-thrown as a
  // RuntimeError, not the raw client error: the SDK's handlerErrorToHttpResponse
  // (@holocronlab/botruntime-sdk 6.13.0+) only preserves the original status for a
  // RuntimeError/InvalidPayloadError and otherwise always reports 500, masking a genuine 4xx.
  const stateResult = await client
    .getState({ type: 'integration', name: 'credentials', id: integrationId })
    .catch((thrown: unknown) => {
      const err = thrown instanceof Error ? thrown : new Error(String(thrown))
      if (err.message.toLowerCase().includes('not found')) {
        return null
      }
      throw new RuntimeError(`Fail to get stored bot token: ${err.message}`, err)
    })

  const botToken = stateResult?.state.payload.botToken ?? configToken
  if (typeof botToken !== 'string' || botToken.trim().length === 0) {
    throw new RuntimeError('Bot token is missing or invalid. Set the integration botToken configuration.')
  }

  return botToken
}
