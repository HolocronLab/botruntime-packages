import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { Conversation } from './types'

// Telegram uses message_thread_id for both forum topics and some reply-thread
// updates. Only is_topic_message identifies a forum topic conversation.
export function topicThreadId(message: {
  is_topic_message?: boolean
  message_thread_id?: number
}): string | undefined {
  if (!message.is_topic_message || !message.message_thread_id) return undefined
  return String(message.message_thread_id)
}

export function conversationTagId(chatId: string, threadId: string | undefined): string {
  return threadId ? `${chatId}/${threadId}` : chatId
}

// A malformed topic tag must fail loudly: silently omitting message_thread_id
// would leak an operator message into the supergroup's general chat.
export function threadExtra(conversation: Conversation): { message_thread_id?: number } {
  const raw = conversation.tags.threadId
  if (raw === undefined || raw === '') return {}

  const threadId = Number(raw)
  if (!Number.isInteger(threadId) || threadId <= 0) {
    throw new RuntimeError(`Malformed threadId tag "${raw}" on conversation ${conversation.id}`)
  }
  return { message_thread_id: threadId }
}
