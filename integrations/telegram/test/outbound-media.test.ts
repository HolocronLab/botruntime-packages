import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Telegram, Telegraf } from 'telegraf'
import type { Message } from 'telegraf/types'
import { handleImageMessage } from '../src/misc/message-handlers'
import type { Client, Logger, MessageHandlerProps } from '../src/misc/types'
import { sendCard } from '../src/misc/utils'

const originalFetch = globalThis.fetch
const originalSendPhoto = Telegram.prototype.sendPhoto
const originalEnv = {
  BP_API_URL: process.env.BP_API_URL,
  BP_TOKEN: process.env.BP_TOKEN,
  BP_BOT_ID: process.env.BP_BOT_ID,
  CLOUDAPI_PUBLIC_BASE_URL: process.env.CLOUDAPI_PUBLIC_BASE_URL,
}

const protectedImageUrl = 'https://botruntime.example/v1/files/download?key=mirror%2Fddu-page.jpg'
const internalImageUrl = 'https://runtime.internal/v1/files/download?key=mirror%2Fddu-page.jpg'

beforeEach(() => {
  process.env.BP_API_URL = 'https://runtime.internal'
  process.env.CLOUDAPI_PUBLIC_BASE_URL = 'https://botruntime.example'
  process.env.BP_TOKEN = 'runtime-token'
  process.env.BP_BOT_ID = 'lawyer-bot'
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init)
    expect(request.url).toBe(internalImageUrl)
    expect(request.headers.get('authorization')).toBe('Bearer runtime-token')
    expect(request.headers.get('x-bot-id')).toBe('lawyer-bot')
    return new Response('jpeg-bytes', { headers: { 'content-type': 'image/jpeg' } })
  }) as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
  Telegram.prototype.sendPhoto = originalSendPhoto
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('image messages download protected Botruntime media before sendPhoto', async () => {
  let sentMedia: unknown
  Telegram.prototype.sendPhoto = (async (_chatId, media) => {
    sentMedia = media
    return { message_id: 17 } as Message.PhotoMessage
  }) as typeof Telegram.prototype.sendPhoto

  let acknowledged = false
  const props = {
    type: 'image',
    payload: { imageUrl: protectedImageUrl },
    ctx: { integrationId: 'telegram', configuration: { botToken: '123:test-token' } },
    conversation: { id: 'conversation', tags: { chatId: '-1001' } },
    message: { id: 'outbound', tags: {} },
    ack: async () => {
      acknowledged = true
    },
    logger: { forBot: () => ({ debug: () => undefined, warn: () => undefined }) } as unknown as Logger,
    client: {} as Client,
  } satisfies MessageHandlerProps<'image'>

  await handleImageMessage(props)

  expect(sentMedia).toEqual({ source: Buffer.from('jpeg-bytes'), filename: 'ddu-page.jpg' })
  expect(acknowledged).toBe(true)
})

test('card images use the same protected-media resolver', async () => {
  let sentMedia: unknown
  const telegraf = new Telegraf('123:test-token')
  telegraf.telegram.sendPhoto = (async (_chatId, media) => {
    sentMedia = media
    return { message_id: 18 } as Message.PhotoMessage
  }) as typeof telegraf.telegram.sendPhoto

  await sendCard(
    { title: 'ДДУ', imageUrl: protectedImageUrl, actions: [] },
    telegraf,
    '-1001',
    async () => undefined,
  )

  expect(sentMedia).toEqual({ source: Buffer.from('jpeg-bytes'), filename: 'ddu-page.jpg' })
})
