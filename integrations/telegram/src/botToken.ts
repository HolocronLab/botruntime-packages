import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { Client } from './misc/types'

// Botruntime configuration is authoritative; credentials-state is only a
// compatibility fallback for legacy installations.
export const getStoredBotToken = async (
  client: Client,
  integrationId: string,
  configToken?: string
): Promise<string> => {
  if (typeof configToken === 'string' && configToken.trim().length > 0) {
    return configToken
  }

  const stateResult = await client
    .getState({ type: 'integration', name: 'credentials', id: integrationId })
    .catch((thrown: unknown) => {
      const err = thrown instanceof Error ? thrown : new Error(String(thrown))
      if (err.message.toLowerCase().includes('not found')) {
        return null
      }
      throw new RuntimeError(`Fail to get stored bot token: ${err.message}`, err)
    })

  const botToken = stateResult?.state.payload.botToken
  if (typeof botToken !== 'string' || botToken.trim().length === 0) {
    throw new RuntimeError('Bot token is missing or invalid. Set the integration botToken configuration.')
  }

  return botToken
}
