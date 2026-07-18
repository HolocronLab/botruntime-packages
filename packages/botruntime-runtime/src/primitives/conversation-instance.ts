import type { Conversation as BotpressConversation, Client, Message } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import { BotClient } from '@holocronlab/botruntime-sdk/dist/bot'
import { ulid } from 'ulid'
import { ConversationDefinitions } from '../_types/conversations'
import { adk } from '../library'
import type { LifecycleState } from '../runtime/events'
import { BUILT_IN_STATES, context, interfaceMappings, TrackedState, TrackedTags, trackPromise } from '../runtime/index'
import { Merge } from '@holocronlab/botruntime-sdk/dist/utils/type-utils'
import type { MessagePayloadFor, MessageTypeFor } from './conversation-message-types'

type Channels = keyof ConversationDefinitions
type ConversationMessageType<TChannel extends Channels> = MessageTypeFor<ConversationDefinitions, TChannel>
type ConversationMessagePayload<
  TChannel extends Channels,
  TMessage extends ConversationMessageType<TChannel>,
> = MessagePayloadFor<ConversationDefinitions, TChannel, TMessage>

/**
 * Base class for conversation instances at runtime.
 * Unlike the Conversation definition, this represents a specific active conversation
 * bound to a single channel.
 */
export class BaseConversationInstance<TChannel extends Channels = Channels> {
  public readonly id: string
  public readonly channel: TChannel
  public readonly integration: string
  /**
   * The integration alias (e.g., "telegram1", "telegram2").
   * This is useful when you have multiple instances of the same integration
   * with different configurations (multi-integration setup).
   * Note: conversation.integration from the API is already the alias.
   */
  public readonly alias: string
  public readonly conversation: BotpressConversation

  // @internal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generic requires any
  private readonly client: BotClient<any>

  // @internal
  public readonly TrackedState: TrackedState

  /**
   * Lifecycle tracked state (only present when the conversation has lifecycle configured).
   * @internal
   */
  public readonly LifecycleTrackedState?: TrackedState

  // @internal
  private readonly TrackedTags: TrackedTags

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK generic requires any
  constructor(conversation: BotpressConversation, client: BotClient<any>, alias?: string) {
    this.id = conversation.id
    // conversation.integration from the API is the alias (e.g., "telegram1", "slack2")
    this.integration = conversation.integration
    this.alias = alias ?? conversation.integration
    this.channel = `${this.alias}.${conversation.channel}` as TChannel
    this.conversation = conversation
    this.client = client

    // Retrieve the TrackedState that was created during loadAll()
    const states = context.get('states', { optional: true })
    const existingState = states?.find(
      (s) => s.type === 'conversation' && s.id === conversation.id && s.name === BUILT_IN_STATES.conversation
    )

    if (!existingState) {
      throw new Error(
        `Conversation state not found for conversation ${conversation.id}. ` +
          `Make sure TrackedState.loadAll() is called before creating conversation instances.`
      )
    }

    this.TrackedState = existingState

    // Retrieve the __lifecycle TrackedState if it was created during loadAll()
    const lifecycleState = states?.find(
      (s) => s.type === 'conversation' && s.id === conversation.id && s.name === BUILT_IN_STATES.lifecycle
    )

    if (lifecycleState) {
      this.LifecycleTrackedState = lifecycleState

      // Initialize session on first load (state is empty/defaults)
      if (!lifecycleState.value || !lifecycleState.value.sessionId) {
        const now = new Date().toISOString()
        lifecycleState.value = {
          sessionId: ulid(),
          sessionNumber: 1,
          status: 'active',
          startedAt: now,
          lastActivityAt: now,
          nudgeCount: 0,
        } as LifecycleState
        lifecycleState.markDirty()
      }
    }

    // Retrieve the TrackedTags that was created during loadAll()
    const tags = TrackedTags.create({
      type: 'conversation',
      id: conversation.id,
      client: client._inner as unknown as Client,
      initialTags: conversation.tags as Record<string, string | undefined>,
    })

    this.TrackedTags = tags
  }

  /**
   * Load a conversation by explicit ID.
   * Returns a BaseConversationInstance with TrackedState and TrackedTags wired up for automatic saving.
   *
   * @param id - The conversation ID to load
   * @returns A BaseConversationInstance (unparameterized channel)
   * @throws If called outside an execution context
   */
  static async get(id: string): Promise<BaseConversationInstance> {
    const client = context.get('client')

    const { conversation } = await client.getConversation({ id })

    // Look up conversation definition to get the state schema
    const convoDefinition = adk.project.conversations.find((c) => {
      const def = c.getDefinition()
      if (typeof def.channel === 'string') {
        return def.channel === conversation.channel || def.channel === '*'
      } else {
        return def.channel.includes(conversation.channel)
      }
    })

    // Create TrackedState before constructing — constructor expects it to exist in context
    const trackedState = TrackedState.create({
      type: 'conversation',
      id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client._inner as any,
      schema: convoDefinition?.schema || z.object({}).passthrough(),
      name: BUILT_IN_STATES.conversation,
    })

    // Load the state value so the instance has data
    await trackedState.load()

    return new BaseConversationInstance(conversation, client)
  }

  public get tags(): ConversationDefinitions[TChannel]['tags'] {
    return this.TrackedTags.tags as ConversationDefinitions[TChannel]['tags']
  }

  public set tags(value: ConversationDefinitions[TChannel]['tags']) {
    this.TrackedTags.tags = value as Record<string, string | undefined>
  }

  /**
   * Read-only session object for lifecycle-enabled conversations.
   * Returns undefined if the conversation does not have lifecycle configured.
   *
   * The session tracks:
   * - `id`: ULID identifying the current session
   * - `number`: monotonically increasing session counter (increments on expiration)
   * - `status`: 'active' or 'expired'
   * - `startedAt`: ISO timestamp when this session started
   * - `lastActivityAt`: ISO timestamp of the last user activity
   * - `nudgeCount`: number of nudges fired in the current session
   */
  public get session():
    | {
        readonly id: string
        readonly number: number
        readonly status: 'active' | 'expired'
        readonly startedAt: string
        readonly lastActivityAt: string
        readonly nudgeCount: number
      }
    | undefined {
    if (!this.LifecycleTrackedState?.value) {
      return undefined
    }

    const state = this.LifecycleTrackedState.value as LifecycleState
    return {
      get id() {
        return state.sessionId
      },
      get number() {
        return state.sessionNumber
      },
      get status() {
        return state.status
      },
      get startedAt() {
        return state.startedAt
      },
      get lastActivityAt() {
        return state.lastActivityAt
      },
      get nudgeCount() {
        return state.nudgeCount
      },
    }
  }

  /**
   * Send a message to this conversation
   */
  async send<M extends ConversationMessageType<TChannel>>(message: {
    type: M
    payload: ConversationMessagePayload<TChannel, M>
  }): Promise<
    Merge<
      Message,
      {
        type: M
        payload: ConversationMessagePayload<TChannel, M>
      }
    >
  > {
    try {
      // Transform customComponent messages into the webchat's custom message format
      if (message.type === 'customComponent') {
        const { component, props } = message.payload as { component: { encode: (p: any) => any }; props: any }
        const encoded = component.encode(props)
        message = { type: 'custom' as M, payload: encoded }
      }

      // Use chat.sendMessage() when available and this is the current conversation
      // to preserve citations processing and in-memory transcript tracking.
      // Fall back to raw createMessage() for cross-conversation sends (loaded via get()).
      const chat = context.get('chat', { optional: true })
      const contextConversation = context.get('conversation', { optional: true })
      if (chat && contextConversation?.id === this.id) {
        return (await trackPromise(
          chat.sendMessage({
            type: message.type as string,
            payload: message.payload as Record<string, unknown>,
          })
        )) as Merge<
          Message,
          {
            type: M
            payload: ConversationMessagePayload<TChannel, M>
          }
        >
      }

      return (await trackPromise(
        this.client
          .createMessage({
            type: message.type as string,
            payload: message.payload,
            tags: {},
            userId: context.get('botId'),
            conversationId: this.id,
          })
          .then((r) => r.message)
      )) as Merge<
        Message,
        {
          type: M
          payload: ConversationMessagePayload<TChannel, M>
        }
      >
    } catch (err) {
      console.error('Error sending message in conversation:', err)
      throw err
    }
  }

  /**
   * Start typing indicator
   */
  async startTyping() {
    const mapping = interfaceMappings.getIntegrationAction('typingIndicator', 'startTypingIndicator', this.integration)

    if (mapping) {
      const message = context.get('message', { optional: true })

      if (!message || message.conversationId !== this.id) {
        return
      }

      await this.client
        .callAction({
          type: mapping,
          input: {
            conversationId: this.id,
            messageId: message.id,
          },
        })
        .catch(() => {})
    }
  }

  /**
   * Stop typing indicator
   */
  async stopTyping() {
    const mapping = interfaceMappings.getIntegrationAction('typingIndicator', 'stopTypingIndicator', this.integration)

    if (mapping) {
      const message = context.get('message', { optional: true })

      if (!message || message.conversationId !== this.id) {
        return
      }

      await this.client
        .callAction({
          type: mapping,
          input: {
            conversationId: this.id,
            messageId: message.id,
          },
        })
        .catch(() => {})
    }
  }
}
