import { RuntimeError } from '@holocronlab/botruntime-sdk'
import { getStoredBotToken } from './botToken'
import type { Context } from './bp'
import { makeTelegraf } from './misc/telegraf'
import { conversationTagId } from './misc/threading'
import type { Client } from './misc/types'
import { mapToRuntimeErrorAndThrow } from './misc/utils'

type ForumTopicTelegram = {
  createForumTopic(chatId: number | string, name: string): Promise<{ message_thread_id: number }>
}

type CreateForumTopicProps = {
  input: { chatId: string; name: string }
  ctx: Context
  client: Client
}

type CreateForumTopicDeps = {
  telegramForToken(token: string): ForumTopicTelegram
}

const defaultDeps: CreateForumTopicDeps = {
  telegramForToken: (token) => makeTelegraf(token).telegram,
}

// The integration creates the conversation because cloudapi binds it to the
// installation from integration context. A bot-side get-or-create call would
// produce a conversation without the routing key required for outbound delivery.
export const createForumTopic = async (
  { input, ctx, client }: CreateForumTopicProps,
  deps: CreateForumTopicDeps = defaultDeps,
) => {
  const botToken = await getStoredBotToken(client, ctx.integrationId, ctx.configuration.botToken)
  const topic = await deps
    .telegramForToken(botToken)
    .createForumTopic(input.chatId, input.name)
    .catch(mapToRuntimeErrorAndThrow('Fail to create forum topic'))
  const threadId = String(topic.message_thread_id)
  if (!Number.isInteger(Number(threadId)) || Number(threadId) <= 0) {
    throw new RuntimeError(`Telegram returned an invalid forum topic id: ${threadId}`)
  }

  const { conversation } = await client.getOrCreateConversation({
    channel: 'channel',
    tags: {
      id: conversationTagId(input.chatId, threadId),
      chatId: input.chatId,
      threadId,
    },
    discriminateByTags: ['id'],
  })

  return { threadId, conversationId: conversation.id }
}
