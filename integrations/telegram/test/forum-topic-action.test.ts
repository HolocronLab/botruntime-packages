import { describe, expect, test } from 'bun:test'
import { createForumTopic } from '../src/forum-topics'
import type { Client } from '../src/misc/types'

describe('createForumTopic action', () => {
  test('creates the Telegram topic and a routing-bound integration conversation', async () => {
    const topicCalls: Array<{ chatId: string; name: string }> = []
    const conversationCalls: unknown[] = []
    const client = {
      getState: async () => {
        throw new Error('config token must bypass state')
      },
      getOrCreateConversation: async (input: unknown) => {
        conversationCalls.push(input)
        return { conversation: { id: 'conv_topic', tags: {} } }
      },
    } as unknown as Client

    const output = await createForumTopic(
      {
        input: { chatId: '-100123', name: 'Дело № 42' },
        ctx: { integrationId: 'telegram-installation', configuration: { botToken: 'config-token' } },
        client,
      },
      {
        telegramForToken: (token) => {
          expect(token).toBe('config-token')
          return {
            createForumTopic: async (chatId, name) => {
              topicCalls.push({ chatId: String(chatId), name })
              return { message_thread_id: 73 }
            },
          }
        },
      },
    )

    expect(topicCalls).toEqual([{ chatId: '-100123', name: 'Дело № 42' }])
    expect(conversationCalls).toEqual([
      {
        channel: 'channel',
        tags: { id: '-100123/73', chatId: '-100123', threadId: '73' },
        discriminateByTags: ['id'],
      },
    ])
    expect(output).toEqual({ threadId: '73', conversationId: 'conv_topic' })
  })
})
