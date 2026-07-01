/**
 * Chat client for eval conversations.
 * Drives conversations against a running ADK bot via @holocronlab/botruntime-chat.
 *
 * This is a send-only client. Observation (bot responses, tool calls, state)
 * is handled by the SSECollector via trace spans — not via WebSocket listeners.
 */

import { Client as BpClient } from '@holocronlab/botruntime-client'
import type { AuthenticatedClient as AuthedChatClient } from '@holocronlab/botruntime-chat'
import type { ChatClient, EvalLogger } from './types'
import { defaultLogger } from './types'
import { EvalRunnerError } from './errors'

const TRACE_STREAM_PREFLIGHT_TIMEOUT_MS = 10_000

/**
 * A send-only chat session that maintains a single client connection across turns.
 * Messages and events are fire-and-forget; the SSECollector observes results via traces.
 */
export class ChatSession {
  private client: AuthedChatClient | null = null
  private conversationId: string | null = null

  constructor(
    private bpClient: BpClient,
    private botId: string,
    private _chatWebhookId?: string,
    private _chatBaseUrl?: string,
    private _chatClient?: ChatClient
  ) {}

  async connect() {
    const webhookId = this._chatWebhookId ?? (await discoverWebhookId(this.bpClient, this.botId))

    // Prefer the host-injected client. The CLI passes its bundled CJS chat client
    // (working node http adapter); only fall back to a dynamic import when nothing
    // was injected — e.g. the cloud runtime, where @holocronlab/botruntime-chat resolves to a
    // real node_modules dep. In a bun-compiled CLI binary the dynamic import
    // resolves to the browser ESM bundle whose axios http adapter is null
    // ("Adapter 'http' is not available in the build"), so the injected client is
    // required there.
    const ChatClientCtor =
      this._chatClient ??
      (await import(/* webpackIgnore: true */ '@holocronlab/botruntime-chat' as string)).Client

    this.client = await ChatClientCtor.connect({
      webhookId,
      ...(this._chatBaseUrl ? { baseApiUrl: this._chatBaseUrl } : {}),
    })
  }

  /** Invariant guard — calling any session method before connect() is a runner bug. */
  private assertConnected(): AuthedChatClient {
    if (!this.client) {
      throw new EvalRunnerError({
        code: 'CHAT_NOT_CONNECTED',
        message: 'ChatSession not connected. Call connect() first.',
      })
    }
    return this.client
  }

  get userId(): string {
    return this.assertConnected().user.id
  }

  async ensureConversation(): Promise<string> {
    const client = this.assertConnected()

    if (!this.conversationId) {
      const conv = await client.createConversation({})
      this.conversationId = conv.conversation.id
      return conv.conversation.id
    }

    return this.conversationId
  }

  /**
   * Open a fresh conversation under the same user (the user is fixed at
   * connect()) and make it active. Returns the new conversation id.
   */
  async newConversation(): Promise<string> {
    const client = this.assertConnected()
    const conv = await client.createConversation({})
    this.conversationId = conv.conversation.id
    return conv.conversation.id
  }

  /**
   * Send a user message. Fire-and-forget — observation is via SSECollector.
   */
  async sendMessage(message: string): Promise<void> {
    const client = this.assertConnected()
    const conversationId = await this.ensureConversation()
    await client.createMessage({ conversationId, payload: { type: 'text', text: message } })
  }

  async sendEvent(payload: Record<string, unknown>): Promise<void> {
    const client = this.assertConnected()
    const conversationId = await this.ensureConversation()
    await client.createEvent({ payload, conversationId })
  }
}

/**
 * Discover the chat integration's webhookId from a bot.
 *
 * Evals talk to the bot through the `chat` integration (via @holocronlab/botruntime-chat).
 * If the bot doesn't have that integration installed, evals can't run.
 */
export async function discoverWebhookId(client: BpClient, botId: string): Promise<string> {
  const { bot } = await client.getBot({ id: botId })
  const integrations = bot.integrations || {}

  const chat = Object.values(integrations).find((int) => (int as Record<string, unknown>).name === 'chat')
  const webhookId = (chat as Record<string, unknown> | undefined)?.webhookId

  if (!webhookId || typeof webhookId !== 'string') {
    throw new EvalRunnerError({
      code: 'CHAT_INTEGRATION_MISSING',
      message: [
        'The `chat` integration is not installed on this bot — evals require it.',
        '',
        'To fix:',
        '  1. Install it:    adk integrations add chat',
        '  2. Redeploy:      adk dev   (or: adk deploy)',
      ].join('\n'),
      expected: true,
    })
  }

  return webhookId
}

/**
 * Verify the dev server's trace stream can be read before eval turns start.
 *
 * This only checks that `/api/traces/stream` is reachable and emits its initial
 * snapshot. It does not prove the private runtime span-ingest path is healthy.
 */
export async function assertTraceStreamReadable(
  devServerUrl: string,
  headers: Record<string, string> = {},
  timeoutMs = TRACE_STREAM_PREFLIGHT_TIMEOUT_MS
): Promise<void> {
  const url = `${devServerUrl.replace(/\/$/, '')}/api/traces/stream?count=1`
  const abortController = new AbortController()
  let timedOut = false
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null

  const timer = setTimeout(() => {
    timedOut = true
    abortController.abort()
  }, timeoutMs)

  try {
    const res = await fetch(url, {
      headers: { ...headers, Accept: 'text/event-stream' },
      signal: abortController.signal,
    })

    if (!res.ok) {
      throw traceStreamPreflightError(`Trace stream pre-flight failed: ${res.status} ${res.statusText}`)
    }

    if (!res.body) {
      throw traceStreamPreflightError('Trace stream pre-flight failed: response had no body.')
    }

    reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        throw traceStreamPreflightError('Trace stream pre-flight failed: stream closed before snapshot.')
      }

      buffer += decoder.decode(value, { stream: true })
      const parts = buffer.split('\n\n')
      buffer = parts.pop() ?? ''

      for (const part of parts) {
        if (parseSSEEventName(part) === 'snapshot') {
          return
        }
      }
    }
  } catch (err) {
    if (err instanceof EvalRunnerError) {
      throw err
    }

    if (timedOut) {
      throw traceStreamPreflightError(
        `Trace stream pre-flight timed out after ${timeoutMs}ms before receiving a snapshot.`
      )
    }

    throw traceStreamPreflightError(
      `Trace stream pre-flight failed: ${err instanceof Error ? err.message : String(err)}`
    )
  } finally {
    clearTimeout(timer)
    reader?.cancel().catch(() => {})
  }
}

function parseSSEEventName(block: string): string | null {
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      return line.slice('event:'.length).trim()
    }
  }
  return null
}

function traceStreamPreflightError(message: string): EvalRunnerError {
  return new EvalRunnerError({
    code: 'SSE_CONNECT_FAILED',
    message,
    expected: true,
    suggestion: 'Make sure the dev server is running (`adk dev`) and trace streaming is available.',
  })
}

/**
 * Verify the bot has at least one Conversation bound to `chat.channel`.
 *
 * The `chat` integration can be installed without any handler listening on its
 * channel — in that case messages sent via @holocronlab/botruntime-chat produce no response
 * and the caller times out silently. Fail fast with actionable guidance instead.
 *
 * Uses the dev server's `/api/agent` endpoint, so this is a no-op against
 * production bots (no devServerUrl).
 */
export async function assertChatChannelBound(
  devServerUrl: string,
  headers: Record<string, string> = {},
  logger: EvalLogger = defaultLogger
): Promise<void> {
  type ConversationSummary = { channel?: string | string[] }
  let conversations: ConversationSummary[] = []
  try {
    const res = await fetch(`${devServerUrl}/api/agent`, { headers })
    if (!res.ok) return // Dev server unreachable — skip, let downstream errors surface
    const agent = (await res.json()) as { conversations?: ConversationSummary[] }
    conversations = agent.conversations ?? []
  } catch (err) {
    // Soft pre-flight only — a missing dev server is normal (e.g. prod bots),
    // but log the skip so a *broken* dev server (malformed /api/agent JSON)
    // isn't invisible while every eval afterwards times out mysteriously.
    logger?.warn(
      `Skipping chat.channel binding pre-flight — could not query ${devServerUrl}/api/agent: ${err instanceof Error ? err.message : String(err)}`
    )
    return
  }

  if (conversations.length === 0) return // Bot has no conversations at all — different problem

  // Mirrors the runtime's matchesChannel semantics: a handler matches `chat.channel`
  // if it is the wildcard '*', the literal string 'chat.channel', or an array
  // containing either.
  const matchesChatChannel = (ch: string | string[] | undefined): boolean => {
    if (!ch) return false
    if (ch === '*' || ch === 'chat.channel') return true
    return Array.isArray(ch) && (ch.includes('chat.channel') || ch.includes('*'))
  }

  const bound = conversations.some((c) => matchesChatChannel(c.channel))
  if (bound) return

  throw new EvalRunnerError({
    code: 'CHAT_CHANNEL_UNBOUND',
    message: [
      'No Conversation is bound to `chat.channel` — messages via `@holocronlab/botruntime-chat` will time out silently.',
      '',
      'To fix, bind a Conversation in `src/conversations/` to `chat.channel` (or `*`):',
      "  channel: 'chat.channel',           // explicit",
      "  channel: '*',                      // wildcard — matches every channel",
      "  channel: ['chat.channel', ...],    // array form",
      '',
      'The `chat` integration is how evals and `adk chat --single` send messages programmatically.',
    ].join('\n'),
    expected: true,
  })
}
