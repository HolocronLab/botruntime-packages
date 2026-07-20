import { afterEach, beforeEach, expect, test } from 'bun:test'
import { telegramMessageChannels } from '../../definitions/channels'
import { convertTelegramMessageToBotpressMessage } from './utils'

const originalFetch = globalThis.fetch
const originalEnv = {
  BP_API_URL: process.env.BP_API_URL,
  BP_TOKEN: process.env.BP_TOKEN,
  BP_BOT_ID: process.env.BP_BOT_ID,
}

beforeEach(() => {
  process.env.BP_API_URL = 'https://runtime.internal'
  process.env.BP_TOKEN = 'runtime-token'
  process.env.BP_BOT_ID = 'bot-1'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('file payload preserves transport compatibility and exposes a stable Files API reference', async () => {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (request.url === 'https://runtime.internal/v1/files/telegram%2Funique-doc') return new Response('{}', { status: 404 })
    if (request.url === 'https://telegram.test/document') return new Response('pdf-bytes')
    if (request.url === 'https://runtime.internal/v1/files') {
      return new Response(JSON.stringify({ file: {
        id: 'telegram/unique-doc',
        url: 'https://runtime.example/v1/files/download?key=telegram%2Funique-doc',
        uploadUrl: 'https://runtime.internal/v1/files/upload?key=telegram%2Funique-doc&token=1',
      } }))
    }
    if (request.url.includes('/v1/files/upload?')) return new Response('{}')
    throw new Error(`unexpected request ${request.url}`)
  }) as typeof fetch

  const result = await convertTelegramMessageToBotpressMessage({
    message: {
      message_id: 42, date: 1, chat: { id: 7, type: 'private' },
      document: {
        file_id: 'provider-doc', file_unique_id: 'unique-doc', file_name: 'ДДУ.pdf',
        mime_type: 'application/pdf', file_size: 9,
      },
      media_group_id: 'album-3',
    } as never,
    telegram: { getFileLink: async () => new URL('https://telegram.test/document') } as never,
    logger: { forBot: () => ({ warn: () => undefined }) } as never,
    updateId: 99,
  })

  expect(result).toEqual({
    type: 'file',
    payload: {
      fileUrl: 'https://runtime.example/v1/files/download?key=telegram%2Funique-doc',
      title: 'ДДУ.pdf', mimeType: 'application/pdf', fileId: 'telegram/unique-doc', filename: 'ДДУ.pdf',
      contentType: 'application/pdf', size: 9, providerFileId: 'provider-doc',
      providerFileUniqueId: 'unique-doc', providerMessageId: '42', providerMediaGroupId: 'album-3',
      providerUpdateId: '99',
    },
  })
  expect(telegramMessageChannels.file.schema.parse(result.payload)).toMatchObject({
    fileId: 'telegram/unique-doc',
    filename: 'ДДУ.pdf',
    contentType: 'application/pdf',
    size: 9,
    providerFileUniqueId: 'unique-doc',
    providerMessageId: '42',
    providerMediaGroupId: 'album-3',
    providerUpdateId: '99',
  })
})

test('album media keeps its caption once on the media item', async () => {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (request.url === 'https://runtime.internal/v1/files/telegram%2Funique-photo') return new Response('{}', { status: 404 })
    if (request.url === 'https://telegram.test/photo') return new Response('image-bytes')
    if (request.url === 'https://runtime.internal/v1/files') {
      return new Response(JSON.stringify({ file: {
        id: 'telegram/unique-photo',
        url: 'https://runtime.example/v1/files/download?key=telegram%2Funique-photo',
        uploadUrl: 'https://runtime.internal/v1/files/upload?key=telegram%2Funique-photo&token=1',
      } }))
    }
    if (request.url.includes('/v1/files/upload?')) return new Response('{}')
    throw new Error(`unexpected request ${request.url}`)
  }) as typeof fetch

  const result = await convertTelegramMessageToBotpressMessage({
    message: {
      message_id: 43, date: 1, chat: { id: 7, type: 'private' }, media_group_id: 'album-3',
      caption: 'ДДУ **и** акт',
      photo: [{ file_id: 'provider-photo', file_unique_id: 'unique-photo', width: 10, height: 10, file_size: 11 }],
    } as never,
    telegram: { getFileLink: async () => new URL('https://telegram.test/photo') } as never,
    logger: { forBot: () => ({ warn: () => undefined }) } as never,
    updateId: 100,
  })

  expect(result.payload).toMatchObject({
    caption: 'ДДУ **и** акт',
    providerMessageId: '43',
    providerUpdateId: '100',
    providerMediaGroupId: 'album-3',
  })
  expect(telegramMessageChannels.image.schema.parse(result.payload)).toMatchObject({ caption: 'ДДУ **и** акт' })
})
