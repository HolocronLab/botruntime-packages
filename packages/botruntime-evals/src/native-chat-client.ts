import type { Client as BotruntimeClient } from '@holocronlab/botruntime-client'
import type { AuthenticatedClient, Message, SignalListener, Signals } from '@holocronlab/botruntime-chat'
import type { ChatClient } from './types'

const NATIVE_EVAL_INTEGRATION = 'botruntime/eval'
const POLL_INTERVAL_MS = 50

type Handler = (value: any) => void
type PlatformMessage = {
  id: string
  createdAt: string
  direction: 'incoming' | 'outgoing'
  conversationId: string
  userId: string
  type: Message['payload']['type']
  payload: Message['payload']
}

class NativeConversationListener {
  private readonly handlers = new Map<string, Set<Handler>>()
  private readonly seen = new Set<string>()
  private stopped = false
  private timer: ReturnType<typeof setTimeout> | undefined

  private constructor(
    private readonly client: BotruntimeClient,
    private readonly conversationId: string
  ) {}

  static async connect(client: BotruntimeClient, conversationId: string): Promise<SignalListener> {
    const listener = new NativeConversationListener(client, conversationId)
    for (const message of await listener.listMessages()) listener.seen.add(message.id)
    listener.schedule()
    return listener as unknown as SignalListener
  }

  on(event: string, handler: Handler): this {
    const handlers = this.handlers.get(event) ?? new Set<Handler>()
    handlers.add(handler)
    this.handlers.set(event, handlers)
    return this
  }

  off(event: string, handler: Handler): this {
    this.handlers.get(event)?.delete(handler)
    return this
  }

  cleanup(): void {
    this.stop()
  }

  async disconnect(): Promise<void> {
    this.stop()
  }

  private stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = undefined
  }

  private schedule(): void {
    if (this.stopped) return
    this.timer = setTimeout(() => void this.poll(), POLL_INTERVAL_MS)
  }

  private async poll(): Promise<void> {
    try {
      for (const message of await this.listMessages()) {
        if (this.seen.has(message.id)) continue
        this.seen.add(message.id)
        if (message.direction !== 'outgoing') continue
        this.emit('message_created', {
          id: message.id,
          createdAt: message.createdAt,
          payload: {
            ...message.payload,
            type: message.type,
          } as Message['payload'],
          userId: message.userId,
          conversationId: message.conversationId,
          isBot: true,
        } satisfies Signals['message_created'])
      }
    } catch (error) {
      this.emit('error', error instanceof Error ? error : new Error(String(error)))
      this.stop()
      return
    }
    this.schedule()
  }

  private emit(event: string, value: unknown): void {
    for (const handler of this.handlers.get(event) ?? []) handler(value)
  }

  private async listMessages(): Promise<PlatformMessage[]> {
    const messages: PlatformMessage[] = []
    let nextToken: string | undefined
    do {
      const page = await this.client.listMessages({
        conversationId: this.conversationId,
        pageSize: 100,
        ...(nextToken ? { nextToken } : {}),
      })
      messages.push(...(page.messages as unknown as PlatformMessage[]))
      nextToken = page.meta.nextToken
    } while (nextToken)
    return messages
  }
}

/**
 * Adapts the authenticated platform chat API to the small client contract used by evals.
 * No integration definition, webhook, provider account, or provider API key is involved.
 */
export function createNativeEvalChatClient(client: BotruntimeClient): ChatClient {
  return {
    connect: async () => {
      const { user } = await client.createUser({
        name: `eval:${Date.now()}`,
        tags: {},
      })
      return {
        user,
        createConversation: async () =>
          client.createConversation({
            channel: 'eval',
            integrationName: NATIVE_EVAL_INTEGRATION,
            tags: {
              id: `eval:${Date.now()}:${Math.random().toString(36).slice(2)}`,
            },
          }),
        createMessage: async ({ conversationId, payload }: { conversationId: string; payload: Message['payload'] }) =>
          client.createMessage({
            conversationId,
            userId: user.id,
            type: payload.type,
            payload,
            tags: {},
            origin: 'synthetic',
          }),
        createEvent: async ({
          conversationId,
          payload,
        }: {
          conversationId: string
          payload: Record<string, unknown>
        }) =>
          client.createEvent({
            type: 'eval:event',
            payload,
            conversationId,
            userId: user.id,
          }),
        listenConversation: ({ id }: { id: string }) => NativeConversationListener.connect(client, id),
      } as unknown as AuthenticatedClient
    },
  } as unknown as ChatClient
}
