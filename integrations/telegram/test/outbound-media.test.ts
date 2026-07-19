import { afterEach, beforeEach, expect, test } from 'bun:test'
import { Telegram, TelegramError, Telegraf } from 'telegraf'
import type { Message } from 'telegraf/types'
import { DeliveryOutcomeError } from '@holocronlab/botruntime-sdk'
import { handleAudioMessage, handleFileMessage, handleImageMessage } from '../src/misc/message-handlers'
import type { Client, Logger, MessageHandlerProps } from '../src/misc/types'
import { sendCard } from '../src/misc/utils'

const originalFetch = globalThis.fetch
const originalSendPhoto = Telegram.prototype.sendPhoto
const originalSendDocument = Telegram.prototype.sendDocument
const originalSendMessage = Telegram.prototype.sendMessage
const originalSendVoice = Telegram.prototype.sendVoice
const originalSendAudio = Telegram.prototype.sendAudio
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
  Telegram.prototype.sendDocument = originalSendDocument
  Telegram.prototype.sendMessage = originalSendMessage
  Telegram.prototype.sendVoice = originalSendVoice
  Telegram.prototype.sendAudio = originalSendAudio
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('file provider timeout is outcome_unknown after provider invocation', async () => {
  Telegram.prototype.sendDocument = (async () => {
    throw new DOMException('The operation was aborted', 'AbortError')
  }) as typeof Telegram.prototype.sendDocument
  const props = fileProps()

  const error = await handleFileMessage(props).catch((value) => value)

  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.outcome).toBe('outcome_unknown')
  expect(error.phase).toBe('provider_send')
  expect(error.operation).toBe('sendDocument')
  expect(error.code).toBe('TELEGRAM_PROVIDER_TIMEOUT')
})

test('file transport failure without provider response is outcome_unknown', async () => {
  Telegram.prototype.sendDocument = (async () => {
    throw new Error('socket closed without response')
  }) as typeof Telegram.prototype.sendDocument

  const error = await handleFileMessage(fileProps()).catch((value) => value)

  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.outcome).toBe('outcome_unknown')
  expect(error.code).toBe('TELEGRAM_PROVIDER_TRANSPORT')
})

test('definitive Telegram rejection is failed without losing provider status', async () => {
  Telegram.prototype.sendDocument = (async () => {
    throw new TelegramError({ error_code: 400, description: 'Bad Request: wrong file identifier' })
  }) as typeof Telegram.prototype.sendDocument

  const error = await handleFileMessage(fileProps()).catch((value) => value)

  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.outcome).toBe('failed')
  expect(error.phase).toBe('provider_send')
  expect(error.operation).toBe('sendDocument')
  expect(error.code).toBe('TELEGRAM_HTTP_400')
})

test('audio timeout does not invoke the non-idempotent audio fallback', async () => {
  let voiceCalls = 0
  let audioCalls = 0
  Telegram.prototype.sendVoice = (async () => {
    voiceCalls++
    throw new DOMException('The operation was aborted', 'AbortError')
  }) as typeof Telegram.prototype.sendVoice
  Telegram.prototype.sendAudio = (async () => {
    audioCalls++
    return { message_id: 20 } as Message.AudioMessage
  }) as typeof Telegram.prototype.sendAudio

  const error = await handleAudioMessage(audioProps()).catch((value) => value)

  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.outcome).toBe('outcome_unknown')
  expect(error.operation).toBe('sendVoice')
  expect(voiceCalls).toBe(1)
  expect(audioCalls).toBe(0)
})

test('successful text fallback ACK records the actual sendMessage operation', async () => {
  Telegram.prototype.sendPhoto = (async () => {
    throw new TelegramError({ error_code: 400, description: 'Bad Request: failed to get HTTP URL content' })
  }) as typeof Telegram.prototype.sendPhoto
  Telegram.prototype.sendMessage = (async () => ({ message_id: 21 } as Message.TextMessage)) as typeof Telegram.prototype.sendMessage
  let ackTags: Record<string, string> | undefined
  const props = imageProps('https://cdn.example.test/image.jpg')
  props.ack = async ({ tags }) => {
    ackTags = tags
  }

  await handleImageMessage(props)

  expect(ackTags).toEqual({ id: '21', 'botruntime.delivery.operation': 'sendMessage' })
})

test('protected download rejection is failed before provider invocation', async () => {
  globalThis.fetch = (async () => new Response('{}', { status: 401 })) as unknown as typeof fetch
  let providerCalls = 0
  Telegram.prototype.sendDocument = (async () => {
    providerCalls++
    return { message_id: 19 } as Message.DocumentMessage
  }) as typeof Telegram.prototype.sendDocument

  const error = await handleFileMessage(fileProps()).catch((value) => value)

  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.outcome).toBe('failed')
  expect(error.phase).toBe('protected_download')
  expect(error.operation).toBe('sendDocument')
  expect(error.code).toBe('PROTECTED_DOWNLOAD_HTTP_401')
  expect(providerCalls).toBe(0)
})

function fileProps(): MessageHandlerProps<'file'> {
  return {
    type: 'file',
    payload: { fileUrl: protectedImageUrl, title: 'offer.docx' },
    ctx: { integrationId: 'telegram', webhookId: 'wh_test', configuration: { botToken: '123:test-token' } },
    conversation: { id: 'conversation', tags: { chatId: '-1001' } },
    message: { id: 'outbound', tags: {} },
    ack: async () => undefined,
    logger: { forBot: () => ({ debug: () => undefined, warn: () => undefined }) } as unknown as Logger,
    client: {} as Client,
  }
}

function audioProps(): MessageHandlerProps<'audio'> {
  return {
    type: 'audio',
    payload: { audioUrl: 'https://cdn.example.test/audio.ogg' },
    ctx: { integrationId: 'telegram', webhookId: 'wh_test', configuration: { botToken: '123:test-token' } },
    conversation: { id: 'conversation', tags: { chatId: '-1001' } },
    message: { id: 'outbound', tags: {} },
    ack: async () => undefined,
    logger: { forBot: () => ({ debug: () => undefined, warn: () => undefined }) } as unknown as Logger,
    client: {} as Client,
  }
}

test('image messages download protected Botruntime media before sendPhoto', async () => {
  let sentMedia: unknown
  Telegram.prototype.sendPhoto = (async (_chatId, media) => {
    sentMedia = media
    return { message_id: 17 } as Message.PhotoMessage
  }) as typeof Telegram.prototype.sendPhoto

  let acknowledged = false
  let ackTags: Record<string, string> | undefined
  const props = imageProps(protectedImageUrl)
  props.ack = async ({ tags }) => {
    acknowledged = true
    ackTags = tags
  }

  await handleImageMessage(props)

  expect(sentMedia).toEqual({ source: Buffer.from('jpeg-bytes'), filename: 'ddu-page.jpg' })
  expect(acknowledged).toBe(true)
  expect(ackTags).toEqual({ id: '17', 'botruntime.delivery.operation': 'sendPhoto' })
})

function imageProps(imageUrl: string): MessageHandlerProps<'image'> {
  return {
    type: 'image',
    payload: { imageUrl },
    ctx: { integrationId: 'telegram', webhookId: 'wh_test', configuration: { botToken: '123:test-token' } },
    conversation: { id: 'conversation', tags: { chatId: '-1001' } },
    message: { id: 'outbound', tags: {} },
    ack: async () => undefined,
    logger: { forBot: () => ({ debug: () => undefined, warn: () => undefined }) } as unknown as Logger,
    client: {} as Client,
  }
}

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
