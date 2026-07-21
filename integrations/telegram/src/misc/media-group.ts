import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { IncomingMessage } from './utils'

// The window measures silence between PROCESSED parts, not between Telegram updates: each part
// downloads and re-uploads its media before the touch, and webhook deliveries are FIFO per
// installation — so one slow part eats the whole window and the dispatch fires with a partial
// album (observed in production at 2s). 5s covers per-part processing latency.
const ALBUM_SETTLE_DELAY_MS = 5_000

// Telegram Bot API's sendMediaGroup accepts 2–10 items per album; once an album reaches the
// cap there are no further parts to wait for, so it is flushed immediately instead of riding
// out the trailing-edge debounce window.
const TELEGRAM_ALBUM_MAX_ITEMS = 10

type RuntimeMessage = {
  id: string
  type?: string
  payload?: Record<string, unknown>
}

type InboundMessageClient = {
  getOrCreateMessage(input: {
    type: string
    payload: Record<string, unknown>
    userId: string
    conversationId: string
    tags: Record<string, string>
    discriminateByTags: string[]
    schedule?: { delay: number }
  }): Promise<{ message: RuntimeMessage; meta?: { created?: boolean } }>
  updateMessage(input: { id: string; payload: Record<string, unknown> }): Promise<unknown>
}

type PersistInboundTelegramMessageInput = {
  client: InboundMessageClient
  message: IncomingMessage
  messageId: string
  updateId: string
  mediaGroupId?: string
  webhookId: string
  chatId: string
  userId: string
  conversationId: string
}

type BlocItem = IncomingMessage

function mediaIdentity(item: BlocItem, field: 'providerMessageId' | 'providerUpdateId'): string | undefined {
  const value = item.payload[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function compareProviderOrder(left: BlocItem, right: BlocItem): number {
  const leftId = mediaIdentity(left, 'providerMessageId') ?? ''
  const rightId = mediaIdentity(right, 'providerMessageId') ?? ''
  const leftNumber = Number(leftId)
  const rightNumber = Number(rightId)
  if (Number.isSafeInteger(leftNumber) && Number.isSafeInteger(rightNumber)) return leftNumber - rightNumber
  return leftId.localeCompare(rightId)
}

function readBlocItems(message: RuntimeMessage): BlocItem[] {
  const items = message.payload?.items
  if (!Array.isArray(items)) throw new RuntimeError(`Telegram album message ${message.id} has an invalid bloc payload`)
  return items as BlocItem[]
}

function isDuplicate(items: BlocItem[], incoming: BlocItem): boolean {
  const incomingMessageId = mediaIdentity(incoming, 'providerMessageId')
  const incomingUpdateId = mediaIdentity(incoming, 'providerUpdateId')
  return items.some((item) => {
    const sameMessage = incomingMessageId && mediaIdentity(item, 'providerMessageId') === incomingMessageId
    const sameUpdate = incomingUpdateId && mediaIdentity(item, 'providerUpdateId') === incomingUpdateId
    return Boolean(sameMessage || sameUpdate)
  })
}

export async function persistInboundTelegramMessage({
  client,
  message,
  messageId,
  updateId,
  mediaGroupId,
  webhookId,
  chatId,
  userId,
  conversationId,
}: PersistInboundTelegramMessageInput): Promise<void> {
  if (!mediaGroupId) {
    await client.getOrCreateMessage({
      tags: { id: messageId, chatId, updateId, webhookId },
      discriminateByTags: ['webhookId', 'updateId'],
      type: message.type,
      payload: message.payload,
      userId,
      conversationId,
    })
    return
  }

  const tags = { id: messageId, chatId, updateId, webhookId, mediaGroupId }
  const { message: stored, meta } = await client.getOrCreateMessage({
    tags,
    discriminateByTags: ['webhookId', 'chatId', 'mediaGroupId'],
    type: 'bloc',
    payload: { items: [message] },
    userId,
    conversationId,
    schedule: { delay: ALBUM_SETTLE_DELAY_MS },
  })

  // get-or-create is the atomic album identity boundary. Integration webhook delivery is FIFO per
  // installation, so later parts can safely update the one scheduled message without process-local
  // timers or state. Every touch (first part or later) shifts platform delivery to now+delay
  // (trailing-edge debounce); a retry of the first update returns the existing message and is
  // deduplicated the same way.
  if (meta?.created) return

  const items = readBlocItems(stored)
  if (isDuplicate(items, message)) return
  const updatedItems = [...items, message].sort(compareProviderOrder)
  await client.updateMessage({ id: stored.id, payload: { items: updatedItems } })

  if (updatedItems.length >= TELEGRAM_ALBUM_MAX_ITEMS) {
    // The album is as full as Telegram will ever send it — touch with delay 0 to deliver
    // immediately rather than waiting out the settle window for parts that will never arrive.
    // The platform ignores this touch's payload on a hit, so it mirrors the minimal shape used
    // to create the bloc.
    await client.getOrCreateMessage({
      tags,
      discriminateByTags: ['webhookId', 'chatId', 'mediaGroupId'],
      type: 'bloc',
      payload: { items: [message] },
      userId,
      conversationId,
      schedule: { delay: 0 },
    })
  }
}
