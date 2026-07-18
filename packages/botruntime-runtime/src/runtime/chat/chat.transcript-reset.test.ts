import { describe, expect, it, vi } from 'vitest'

import type { Client, Message } from '@holocronlab/botruntime-client'

import type { BotContext } from '../context/context'
import { context } from '../context/context'
import { Chat } from './chat'
import type { TranscriptState } from './transcript'

const cloudMessage = (id: string, createdAt: string, text: string): Message =>
  ({
    id,
    createdAt,
    updatedAt: createdAt,
    conversationId: 'conversation-1',
    userId: 'user-1',
    direction: 'incoming',
    type: 'text',
    payload: { text },
    tags: {},
  }) as Message

describe('Chat transcript reset boundary', () => {
  it('checkpoints the latest imported message together with the cleared snapshot', async () => {
    const historical = cloudMessage('m-old', '2026-07-01T12:00:00Z', 'old case')
    const reset = cloudMessage('m-reset', '2026-07-18T19:22:38Z', '/new')
    let stored: TranscriptState = {
      transcript: [],
      cursor: { messageId: historical.id, createdAt: historical.createdAt },
    }
    const client = {
      _inner: {
        list: {
          messages: () => ({ collect: async () => [reset, historical] }),
        },
      },
      getOrSetState: async () => ({ state: { payload: structuredClone(stored) } }),
      setState: async ({ payload }: { payload: TranscriptState }) => {
        stored = structuredClone(payload)
      },
    } as unknown as Client & { _inner: Client }
    const botContext = {
      botId: 'bot-1',
      client,
      conversation: {
        id: 'conversation-1',
        integration: 'botruntime/telegram',
        channel: 'channel',
        tags: { chatId: '1' },
      },
      logger: { error: () => undefined },
      citations: { removeCitationsFromObject: (value: unknown) => [value, []] },
      tags: [],
      states: [],
      userProfiles: [],
      executionFinished: false,
    } as unknown as BotContext

    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      await chat.fetchTranscript()
      await chat.clearTranscript()
      await chat.saveTranscript()
    })

    expect(stored).toEqual({
      transcript: [],
      cursor: { messageId: 'm-reset', createdAt: '2026-07-18T19:22:38Z' },
    })
  })

  it('resumes from the cursor stored with the cleared snapshot even when provider tags omit adkSyncTs', async () => {
    const reset = cloudMessage('m-reset', '2026-07-18T19:22:38Z', '/new')
    const next = cloudMessage('m-next', '2026-07-18T19:38:01Z', 'new case')
    const historical = cloudMessage('m-old', '2026-07-01T12:00:00Z', 'old case')
    let stored: TranscriptState = {
      transcript: [],
      cursor: { messageId: reset.id, createdAt: reset.createdAt },
    }
    const writes: TranscriptState[] = []

    const client = {
      _inner: {
        list: {
          messages: () => ({ collect: async () => [next, reset, historical] }),
        },
      },
      getOrSetState: async () => ({ state: { payload: structuredClone(stored) } }),
      setState: async ({ payload }: { payload: TranscriptState }) => {
        stored = structuredClone(payload)
        writes.push(stored)
      },
    } as unknown as Client & { _inner: Client }

    const botContext = {
      botId: 'bot-1',
      client,
      conversation: {
        id: 'conversation-1',
        integration: 'botruntime/telegram',
        channel: 'channel',
        tags: { chatId: '1' },
      },
      logger: { error: () => undefined },
      citations: { removeCitationsFromObject: (value: unknown) => [value, []] },
      tags: [],
      states: [],
      userProfiles: [],
      executionFinished: false,
    } as unknown as BotContext

    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      expect((await chat.getTranscript()).map((item) => item.id)).toEqual(['m-next'])
      await chat.saveTranscript()
    })

    expect(writes).toHaveLength(1)
    expect(writes[0]?.cursor).toEqual({ messageId: 'm-next', createdAt: '2026-07-18T19:38:01Z' })
    expect(writes[0]?.transcript.map((item) => item.id)).toEqual(['m-next'])
  })

  it('does not checkpoint past a failed message transform', async () => {
    const previous = cloudMessage('m-previous', '2026-07-18T19:38:01Z', 'previous')
    const broken = cloudMessage('m-broken', '2026-07-18T19:39:00Z', 'broken')
    const newest = cloudMessage('m-newest', '2026-07-18T19:40:00Z', 'newest')
    let stored: TranscriptState = {
      transcript: [],
      cursor: { messageId: previous.id, createdAt: previous.createdAt },
    }
    const client = {
      _inner: {
        list: {
          messages: () => ({ collect: async () => [newest, broken, previous] }),
        },
      },
      getOrSetState: async () => ({ state: { payload: structuredClone(stored) } }),
      setState: async ({ payload }: { payload: TranscriptState }) => {
        stored = structuredClone(payload)
      },
    } as unknown as Client & { _inner: Client }
    const botContext = {
      botId: 'bot-1',
      client,
      conversation: {
        id: 'conversation-1',
        integration: 'botruntime/telegram',
        channel: 'channel',
        tags: { chatId: '1' },
      },
      logger: { error: () => undefined },
      citations: { removeCitationsFromObject: (value: unknown) => [value, []] },
      tags: [],
      states: [],
      userProfiles: [],
      executionFinished: false,
    } as unknown as BotContext

    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      const transformMessage = chat.transformMessage.bind(chat)
      vi.spyOn(chat, 'transformMessage').mockImplementation(async (message) => {
        if (message.id === broken.id) throw new Error('synthetic transform failure')
        return await transformMessage(message)
      })

      await chat.fetchTranscript()
      await chat.saveTranscript()
    })

    expect(stored.cursor).toEqual({ messageId: previous.id, createdAt: previous.createdAt })
    expect(stored.transcript.map((item) => item.id)).toEqual([newest.id])
  })
})
