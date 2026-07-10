/**
 * Chat client for eval conversations.
 * Drives conversations against a running brt bot via @holocronlab/botruntime-chat.
 *
 * Bot responses are observed through the authenticated conversation listener;
 * traces remain the source of completion, timing, workflow, and safe tool names.
 */

import { Client as BpClient } from '@holocronlab/botruntime-client'
import type {
  AuthenticatedClient as AuthedChatClient,
  Message,
  SignalListener,
  Signals,
} from '@holocronlab/botruntime-chat'
import type { ChatClient, EvalLogger } from './types'
import { defaultLogger } from './types'
import { EvalRunnerError } from './errors'

const TRACE_STREAM_PREFLIGHT_TIMEOUT_MS = 10_000

/**
 * A chat session that keeps a response listener attached before each turn is
 * emitted. The span source is still responsible for completion and timing.
 */
type ChatPayload = Message['payload']

function cardToText(payload: Extract<ChatPayload, { type: 'card' }>): string {
  return [payload.title, payload.subtitle, ...payload.actions.map((action) => action.label)]
    .filter((value): value is string => Boolean(value))
    .join('\n')
}

export function chatPayloadToText(payload: ChatPayload): string {
  switch (payload.type) {
    case 'audio':
      return payload.audioUrl
    case 'card':
      return cardToText(payload)
    case 'carousel':
      return payload.items.map(cardToText).join('\n\n')
    case 'choice':
    case 'dropdown':
      return [payload.text, ...payload.options.map((option) => `${option.label} (${option.value})`)].join('\n')
    case 'file':
      return payload.title || payload.fileUrl
    case 'image':
      return payload.imageUrl
    case 'location':
      return [payload.title, payload.address, `${payload.latitude},${payload.longitude}`]
        .filter((value): value is string => Boolean(value))
        .join('\n')
    case 'text':
      return payload.text
    case 'video':
      return payload.videoUrl
    case 'markdown':
      return payload.markdown
    case 'bloc':
      return payload.items.map((item) => chatPayloadToText(item)).join('\n')
  }
}

export class ChatSession {
  private client: AuthedChatClient | null = null
  private conversationId: string | null = null
  private listener: SignalListener | null = null
  private listenerErrorHandler: ((error: Error) => void) | null = null
  private listenerError: EvalRunnerError | null = null
  private listenerErrorRejectors = new Set<(error: EvalRunnerError) => void>()
  private seenMessageIds = new Set<string>()
  private responses: string[] = []
  private turnResponseStart = 0

  private readonly handleMessageCreated = (message: Signals['message_created']): void => {
    if (!message.isBot || message.conversationId !== this.conversationId) return
    const key = `${message.conversationId}:${message.id}`
    if (this.seenMessageIds.has(key)) return
    this.seenMessageIds.add(key)
    this.responses.push(chatPayloadToText(message.payload))
  }

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
      await this.setConversation(conv.conversation.id)
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
    await this.setConversation(conv.conversation.id)
    return conv.conversation.id
  }

  startTurn(): void {
    this.assertConnected()
    this.assertListenerHealthy()
    this.turnResponseStart = this.responses.length
  }

  getTurnResponses(): string[] {
    this.assertListenerHealthy()
    return this.responses.slice(this.turnResponseStart)
  }

  async raceWithListenerError<T>(operation: Promise<T>): Promise<T> {
    this.assertListenerHealthy()
    let rejectListener!: (error: EvalRunnerError) => void
    const listenerFailure = new Promise<never>((_resolve, reject) => {
      rejectListener = reject
      this.listenerErrorRejectors.add(rejectListener)
    })
    try {
      return await Promise.race([operation, listenerFailure])
    } finally {
      this.listenerErrorRejectors.delete(rejectListener)
    }
  }

  async disconnect(): Promise<void> {
    const listener = this.listener
    const errorHandler = this.listenerErrorHandler
    this.listener = null
    this.listenerErrorHandler = null
    this.conversationId = null
    this.client = null
    if (!listener) return
    await this.closeListener(listener, errorHandler)
  }

  /**
   * Send a user message. The already-attached conversation listener observes
   * bot responses; the span source independently observes completion/timing.
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

  private async setConversation(conversationId: string): Promise<void> {
    const client = this.assertConnected()
    this.assertListenerHealthy()
    const nextListener = await client.listenConversation({ id: conversationId })
    const previousListener = this.listener
    const previousErrorHandler = this.listenerErrorHandler
    const nextErrorHandler = (error: Error) => {
      if (this.listener !== nextListener) return
      this.listenerError = new EvalRunnerError({
        code: 'CHAT_LISTENER_FAILED',
        message: `Chat response listener failed: ${error.message}`,
        expected: true,
        cause: error,
      })
      for (const reject of this.listenerErrorRejectors) reject(this.listenerError)
      this.listenerErrorRejectors.clear()
    }

    this.conversationId = conversationId
    this.listener = nextListener
    this.listenerErrorHandler = nextErrorHandler
    nextListener.on('message_created', this.handleMessageCreated)
    nextListener.on('error', nextErrorHandler)

    if (previousListener) {
      await this.closeListener(previousListener, previousErrorHandler)
    }
  }

  private assertListenerHealthy(): void {
    if (this.listenerError) throw this.listenerError
  }

  private async closeListener(
    listener: SignalListener,
    errorHandler: ((error: Error) => void) | null
  ): Promise<void> {
    listener.off('message_created', this.handleMessageCreated)
    if (errorHandler) listener.off('error', errorHandler)
    listener.cleanup?.()
    await listener.disconnect()
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
        '  1. Install and register `chat` on the linked target with `brt integrations install` and `brt integrations register`.',
        '  2. Restart `brt dev`, or redeploy the agent with `brt deploy --adk`.',
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
    suggestion: 'Make sure the dev server is running (`brt dev`) and trace streaming is available.',
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
      '`brt chat` and evals both require the `chat` integration; the CLI command is interactive, while evals drive it programmatically.',
    ].join('\n'),
    expected: true,
  })
}
