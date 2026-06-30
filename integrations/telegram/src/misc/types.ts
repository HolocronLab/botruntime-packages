import type * as Typegram from 'telegraf/types'
import type { Configuration, Context, Logger } from '../bp'

export type { Logger, Context as IntegrationCtx } from '../bp'

export type TelegramMessage = Typegram.Message

// Card payload (donor: bp.channels.channel.card.Card).
export type CardAction = { action: 'url' | 'postback' | 'say'; label: string; value: string }
export type Card = {
  title: string
  subtitle?: string
  imageUrl?: string
  actions: CardAction[]
}

export type Choice = { label: string; value: string }

// Per-message outbound payloads (donor: bp.channels.channel.Messages[T]).
export type Payloads = {
  text: { text: string }
  image: { imageUrl: string; caption?: string }
  audio: { audioUrl: string; caption?: string }
  video: { videoUrl: string }
  file: { fileUrl: string; title?: string }
  location: { latitude: number; longitude: number }
  card: Card
  carousel: { items: Card[] }
  dropdown: { text: string; options: Choice[] }
  choice: { text: string; options: Choice[] }
  bloc: { items: BlocItem[] }
  contactRequest: { text: string; buttonLabel?: string }
}

export type BlocItem =
  | { type: 'text'; payload: Payloads['text'] }
  | { type: 'image'; payload: Payloads['image'] }
  | { type: 'audio'; payload: Payloads['audio'] }
  | { type: 'video'; payload: Payloads['video'] }
  | { type: 'file'; payload: Payloads['file'] }
  | { type: 'location'; payload: Payloads['location'] }

export type MessageType = keyof Payloads

export type Conversation = { id: string; tags: Record<string, string | undefined> }
export type Message = { id: string; tags: Record<string, string | undefined> }
export type User = { id: string; name?: string; pictureUrl?: string; tags: Record<string, string | undefined> }

export type AckFunction = (props: { tags: Record<string, string> }) => Promise<void>

// Minimal structural view of the integration-scoped @botpress/client (donor: bp.Client). The SDK
// hands the real client to handlers at runtime; we only type the methods this integration calls,
// each pointed at OUR cloudapi via the env overlay (BP_API_URL). No Botpress-cloud URL anywhere.
export type Client = {
  getState(x: { type: string; name: string; id: string }): Promise<{ state: { payload: { botToken?: string } } }>
  setState(x: { type: string; name: string; id: string; payload: Record<string, unknown> }): Promise<unknown>
  getConversation(x: { id: string }): Promise<{ conversation: Conversation }>
  getMessage(x: { id: string }): Promise<{ message: Message }>
  getOrCreateConversation(x: {
    channel: string
    tags: Record<string, string | undefined>
    discriminateByTags?: string[]
  }): Promise<{ conversation: Conversation }>
  getOrCreateUser(x: {
    tags: Record<string, string | undefined>
    name?: string
    discriminateByTags?: string[]
  }): Promise<{ user: User }>
  createMessage(x: {
    type: string
    payload: Record<string, unknown>
    userId: string
    conversationId: string
    tags: Record<string, string>
  }): Promise<{ message: Message }>
}

// Channel handler props (donor: bp.MessageProps['channel'][T]).
export type MessageHandlerProps<T extends MessageType = MessageType> = {
  type: T
  payload: Payloads[T]
  ctx: Context
  conversation: Conversation
  message: Message
  ack: AckFunction
  logger: Logger
  client: Client
}

// Typing-indicator action props (interface typing-indicator).
export type TypingActionProps = {
  input: { conversationId: string; messageId: string; timeout?: number }
  ctx: Context
  client: Client
  logger: Logger
}

// Webhook handler props (donor: bp.HandlerProps).
export type RawRequest = { method: string; path: string; query: string; headers: Record<string, string | undefined>; body?: string }
export type HandlerResponse = { status?: number; body?: string; headers?: Record<string, string> } | void
export type HandlerProps = { req: RawRequest; client: Client; ctx: Context; logger: Logger }

export type { Configuration }
