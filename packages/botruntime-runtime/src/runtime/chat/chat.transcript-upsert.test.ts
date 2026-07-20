import { describe, expect, it } from 'vitest'

import type { Client, Message } from '@holocronlab/botruntime-client'

import type { BotContext } from '../context/context'
import { context } from '../context/context'
import { Chat } from './chat'
import type { TranscriptState } from './transcript'

const cloudMessage = (id: string, createdAt: string, type: string, payload: Record<string, unknown>): Message =>
  ({
    id,
    createdAt,
    updatedAt: createdAt,
    conversationId: 'conversation-1',
    userId: 'user-1',
    direction: 'incoming',
    type,
    payload,
    tags: {},
  }) as Message

const image = (url: string) => ({ type: 'image', payload: { imageUrl: url } })

const bloc = (id: string, createdAt: string, imageUrls: string[]): Message =>
  cloudMessage(id, createdAt, 'bloc', { items: imageUrls.map(image) })

const makeBotContext = (): BotContext =>
  ({
    botId: 'bot-1',
    client: { _inner: {} } as unknown as Client,
    conversation: {
      id: 'conversation-1',
      integration: 'botruntime/telegram',
      channel: 'channel',
      tags: {},
    },
    logger: { error: () => undefined },
    citations: { removeCitationsFromObject: (value: unknown) => [value, []] },
    tags: [],
    states: [],
    userProfiles: [],
    executionFinished: false,
  }) as unknown as BotContext

describe('Chat transcript upsert-by-id (trailing-edge redelivery)', () => {
  it('keeps a single item when the identical message is delivered twice (dedup regression)', async () => {
    const botContext = makeBotContext()
    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      await chat.setTranscript([])
      const msg = cloudMessage('m-1', '2026-07-21T10:00:00Z', 'text', { text: 'hello' })

      await chat.addMessage(msg)
      await chat.addMessage(msg)

      expect(await chat.getTranscript()).toHaveLength(1)
    })
  })

  it('replaces a redelivered bloc in place with the grown payload instead of appending a duplicate', async () => {
    const botContext = makeBotContext()
    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      await chat.setTranscript([])

      const partial = bloc('bloc-x', '2026-07-21T10:00:00Z', ['https://files.test/img1'])
      const grown = bloc('bloc-x', '2026-07-21T10:00:00Z', [
        'https://files.test/img1',
        'https://files.test/img2',
        'https://files.test/img3',
      ])

      await chat.addMessage(partial)
      await chat.addMessage(grown)

      const transcript = await chat.getTranscript()
      expect(transcript).toHaveLength(1)

      const item = transcript[0] as { id: string; content: string; attachments?: unknown[] }
      expect(item.id).toBe('bloc-x')
      expect(JSON.parse(item.content).payload.items).toHaveLength(3)
      expect(item.attachments).toEqual([
        { type: 'image', url: 'https://files.test/img1' },
        { type: 'image', url: 'https://files.test/img2' },
        { type: 'image', url: 'https://files.test/img3' },
      ])
    })
  })

  it('preserves transcript position of the replaced item relative to messages in between', async () => {
    const botContext = makeBotContext()
    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      await chat.setTranscript([])

      const x1 = bloc('bloc-x', '2026-07-21T10:00:00Z', ['https://files.test/img1'])
      const y = cloudMessage('m-y', '2026-07-21T10:00:05Z', 'text', { text: 'in between' })
      const x2 = bloc('bloc-x', '2026-07-21T10:00:00Z', ['https://files.test/img1', 'https://files.test/img2'])

      await chat.addMessage(x1)
      await chat.addMessage(y)
      await chat.addMessage(x2)

      const transcript = await chat.getTranscript()
      expect(transcript.map((item) => item.id)).toEqual(['bloc-x', 'm-y'])

      const replaced = transcript[0] as { content: string }
      expect(JSON.parse(replaced.content).payload.items).toHaveLength(2)
    })
  })

  it('does not regress the durable sync cursor when a redelivery replaces an existing item', async () => {
    const botContext = makeBotContext()
    let stored: TranscriptState = { transcript: [], cursor: undefined }
    const client = {
      _inner: {
        list: {
          messages: () => ({ collect: async () => [] }),
        },
      },
      getOrSetState: async () => ({ state: { payload: structuredClone(stored) } }),
      setState: async ({ payload }: { payload: TranscriptState }) => {
        stored = structuredClone(payload)
      },
    } as unknown as Client & { _inner: Client }
    botContext.client = client as unknown as BotContext['client']

    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      await chat.fetchTranscript()

      const partial = bloc('bloc-x', '2026-07-21T10:00:00Z', ['https://files.test/img1'])
      const grown = bloc('bloc-x', '2026-07-21T10:00:00Z', [
        'https://files.test/img1',
        'https://files.test/img2',
      ])

      await chat.addMessage(partial)
      await chat.saveTranscript()
      const cursorAfterFirstDelivery = stored.cursor

      await chat.addMessage(grown)
      await chat.saveTranscript()
      const cursorAfterRedelivery = stored.cursor

      // A replacement leaves the cursor untouched — it was already accounted for on this id's
      // first delivery, so the watermark should not move again (and, per the next test, must
      // never move backwards past messages that arrived since).
      expect(cursorAfterRedelivery).toEqual(cursorAfterFirstDelivery)
      expect(cursorAfterRedelivery).toEqual({ messageId: 'bloc-x', createdAt: '2026-07-21T10:00:00Z' })
    })
  })

  it('does not regress the cursor when an older message is redelivered after a newer one advanced it', async () => {
    const botContext = makeBotContext()
    let stored: TranscriptState = { transcript: [], cursor: undefined }
    const client = {
      _inner: {
        list: {
          messages: () => ({ collect: async () => [] }),
        },
      },
      getOrSetState: async () => ({ state: { payload: structuredClone(stored) } }),
      setState: async ({ payload }: { payload: TranscriptState }) => {
        stored = structuredClone(payload)
      },
    } as unknown as Client & { _inner: Client }
    botContext.client = client as unknown as BotContext['client']

    await context.run(botContext, async () => {
      const chat = new Chat(botContext)
      await chat.fetchTranscript()

      const x1 = bloc('bloc-x', '2026-07-21T10:00:00Z', ['https://files.test/img1'])
      const y = cloudMessage('m-y', '2026-07-21T10:00:05Z', 'text', { text: 'in between' })
      const x2 = bloc('bloc-x', '2026-07-21T10:00:00Z', ['https://files.test/img1', 'https://files.test/img2'])

      await chat.addMessage(x1)
      await chat.addMessage(y)
      await chat.saveTranscript()
      const cursorAfterY = stored.cursor
      expect(cursorAfterY).toEqual({ messageId: 'm-y', createdAt: '2026-07-21T10:00:05Z' })

      // bloc-x's trailing-edge touch redelivers it (fuller payload) after m-y already moved the
      // cursor forward. Replacing bloc-x in the transcript must not drag the durable watermark
      // back behind m-y, or the next fetch would needlessly re-read and re-transform it.
      await chat.addMessage(x2)
      await chat.saveTranscript()

      expect(stored.cursor).toEqual(cursorAfterY)
    })
  })
})
