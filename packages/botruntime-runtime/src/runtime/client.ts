import { Client } from '@holocronlab/botruntime-client'
import { context } from './context/context'
import { getSingleton } from './singletons'
import { runtimeClientWorkspaceId } from './runtime-client-scope'

/**
 * Get the authenticated Botpress client.
 *
 * This client is automatically authenticated and provides access to all
 * Botpress API operations. It works in two modes:
 *
 * 1. **Inside execution context** (actions, workflows, conversations):
 *    Uses the bot-specific client from the current execution context.
 *
 * 2. **Outside execution context** (for example, scripts started through `brt`):
 *    Creates a new Client using environment variables:
 *    - BP_TOKEN or ADK_TOKEN for authentication
 *    - ADK_BOT_ID for the bot ID
 *    - ADK_WORKSPACE_ID for the workspace ID
 *    - ADK_API_URL for the API URL (defaults to https://botruntime.ru)
 *
 * @example
 * ```typescript
 * import { client } from '@holocronlab/botruntime-runtime'
 *
 * // List all conversations
 * const { conversations } = await client.listConversations({})
 *
 * // Get a specific table
 * const { table } = await client.getTable({ id: 'table-id' })
 * ```
 */
export const client: Client = new Proxy({} as Client, {
  get(_target, prop) {
    // Try to get client from execution context first
    const contextClient = context.get('client', { optional: true })
    if (contextClient) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proxy dynamic property access
      return (contextClient as any)[prop]
    }

    // Fall back to standalone client for scripts
    const standaloneClient = getStandaloneClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proxy dynamic property access
    return (standaloneClient as any)[prop]
  },
})

/**
 * Get or create a standalone client for use outside execution context
 */
function getStandaloneClient(): Client {
  return getSingleton('__ADK_GLOBAL_STANDALONE_CLIENT', () => {
    // BP_TOKEN is set by AWS Lambda runtime, ADK_TOKEN is set by CLI commands
    const token = process.env.BP_TOKEN || process.env.ADK_TOKEN
    if (!token) {
      throw new Error(
        'No token found. Set BP_TOKEN or ADK_TOKEN, or run the agent with `brt dev`.'
      )
    }

    const botId = process.env.ADK_BOT_ID
    if (!botId) {
      throw new Error('No bot ID found. Set BP_BOT_ID or ADK_BOT_ID, or run the agent with `brt dev`.')
    }

    const apiUrl = process.env.ADK_API_URL || 'https://botruntime.ru'
    const workspaceId = runtimeClientWorkspaceId(process.env)

    return new Client({
      token,
      apiUrl,
      workspaceId,
      botId,
    })
  })
}
