import { afterEach, beforeEach, expect, test } from 'bun:test'
import { DeliveryOutcomeError } from '@holocronlab/botruntime-sdk'
import { ingestTelegramFileLink, resolveTelegramDocument } from './files'

const originalFetch = globalThis.fetch
const originalEnv = {
  BP_API_URL: process.env.BP_API_URL,
  BP_TOKEN: process.env.BP_TOKEN,
  BP_BOT_ID: process.env.BP_BOT_ID,
  CLOUDAPI_PUBLIC_BASE_URL: process.env.CLOUDAPI_PUBLIC_BASE_URL,
}

beforeEach(() => {
  process.env.BP_API_URL = 'https://runtime.internal'
  process.env.CLOUDAPI_PUBLIC_BASE_URL = 'https://botruntime.example'
  process.env.BP_TOKEN = 'runtime-token'
  process.env.BP_BOT_ID = '42'
})

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

test('downloads a protected Botruntime document with runtime credentials before giving it to Telegram', async () => {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    expect(request.url).toBe('https://runtime.internal/v1/files/download?key=claim.docx')
    expect(request.headers.get('authorization')).toBe('Bearer runtime-token')
    expect(request.headers.get('x-bot-id')).toBe('42')
    return new Response('approved-claim')
  }) as typeof fetch

  const document = await resolveTelegramDocument(
    'https://botruntime.example/v1/files/download?key=claim.docx',
    'approved.docx',
  )

  expect(document).toEqual({ source: Buffer.from('approved-claim'), filename: 'approved.docx' })
})

test('uses the protected Botruntime file key as the Telegram filename when title is absent', async () => {
  globalThis.fetch = (async () => new Response('approved-claim')) as unknown as typeof fetch

  const document = await resolveTelegramDocument(
    'https://botruntime.example/v1/files/download?key=cases%2F42%2Fclaim.docx',
  )

  expect(document).toEqual({ source: Buffer.from('approved-claim'), filename: 'claim.docx' })
})

test('keeps an external public document as a URL and never sends Botruntime credentials to it', async () => {
  globalThis.fetch = (() => {
    throw new Error('external URLs must be fetched by Telegram')
  }) as unknown as typeof fetch

  await expect(resolveTelegramDocument('https://cdn.example/public.pdf', 'public.pdf')).resolves.toBe(
    'https://cdn.example/public.pdf',
  )
})

test('never authenticates or server-fetches a non-file route on the Botruntime origin', async () => {
  globalThis.fetch = (() => {
    throw new Error('non-file Botruntime routes must not be fetched by the integration')
  }) as unknown as typeof fetch

  await expect(
    resolveTelegramDocument('https://runtime.internal/v1/admin/bots?dump=1', 'secrets.txt'),
  ).resolves.toBe('https://runtime.internal/v1/admin/bots?dump=1')
})

test('never server-fetches a cross-origin DOCX', async () => {
  globalThis.fetch = (() => {
    throw new Error('cross-origin documents must not be fetched by the integration')
  }) as unknown as typeof fetch

  await expect(
    resolveTelegramDocument('https://storage.example/presigned/approved.docx', 'approved.docx'),
  ).resolves.toBe('https://storage.example/presigned/approved.docx')
})

test('rejects an oversized protected document before buffering it', async () => {
  globalThis.fetch = (async () => new Response('x', {
    headers: { 'content-length': String((20 << 20) + 1) },
  })) as unknown as typeof fetch

  const error = await resolveTelegramDocument(
    'https://runtime.internal/v1/files/download?key=huge.docx', 'huge.docx',
  ).catch((value) => value)
  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.code).toBe('PROTECTED_DOWNLOAD_INVALID_BODY')
})

test('stops a protected document stream when it crosses the byte cap', async () => {
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(20 << 20))
      controller.enqueue(new Uint8Array(1))
      controller.close()
    },
  }))) as unknown as typeof fetch

  const error = await resolveTelegramDocument(
    'https://runtime.internal/v1/files/download?key=stream.docx', 'stream.docx',
  ).catch((value) => value)
  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.code).toBe('PROTECTED_DOWNLOAD_INVALID_BODY')
})

test('fails loudly when a protected Botruntime document cannot be authenticated', async () => {
  delete process.env.BP_TOKEN

  const error = await resolveTelegramDocument(
    'https://runtime.internal/v1/files/download?key=claim.docx', 'approved.docx',
  ).catch((value) => value)
  expect(error).toBeInstanceOf(DeliveryOutcomeError)
  expect(error.phase).toBe('protected_download')
  expect(error.code).toBe('PROTECTED_DOWNLOAD_AUTH_MISSING')
})

test('ingests inbound Telegram bytes once and returns the stable private Files API reference', async () => {
  const requests: Request[] = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    requests.push(request)
    if (request.url === 'https://runtime.internal/v1/files/telegram%2Funique-7') {
      return new Response(JSON.stringify({ error: { message: 'not found' } }), { status: 404 })
    }
    if (request.url === 'https://api.telegram.org/file/bot-secret/contracts/ddu.pdf') {
      return new Response('pdf-bytes', { headers: { 'content-length': '9' } })
    }
    if (request.url === 'https://runtime.internal/v1/files') {
      expect(await request.json()).toEqual({
        key: 'telegram/unique-7', size: 9, contentType: 'application/pdf',
        metadata: {
          source: 'telegram', providerFileId: 'file-7', providerFileUniqueId: 'unique-7',
          providerMessageId: '42', filename: 'ddu.pdf', declaredContentType: 'application/pdf',
        },
      })
      return new Response(JSON.stringify({ file: {
        id: 'telegram/unique-7',
        url: 'https://botruntime.example/v1/files/download?key=telegram%2Funique-7',
        uploadUrl: 'https://runtime.internal/v1/files/upload?key=telegram%2Funique-7&token=generation-1',
      } }))
    }
    if (request.url.includes('/v1/files/upload?')) return new Response('{}')
    throw new Error(`unexpected request ${request.method} ${request.url}`)
  }) as typeof fetch

  const file = await ingestTelegramFileLink(
    'https://api.telegram.org/file/bot-secret/contracts/ddu.pdf', 'telegram/unique-7', 'application/pdf',
    { providerFileId: 'file-7', providerFileUniqueId: 'unique-7', providerMessageId: '42', filename: 'ddu.pdf' },
  )

  expect(file).toEqual({
    id: 'telegram/unique-7',
    url: 'https://botruntime.example/v1/files/download?key=telegram%2Funique-7',
    size: 9,
    contentType: 'application/pdf',
  })
  expect(requests.filter((request) => request.url.includes('api.telegram.org'))).toHaveLength(1)
})

test('reuses a completed Files API object on a replay without downloading Telegram bytes again', async () => {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (request.url.includes('api.telegram.org')) throw new Error('replay must not download provider bytes')
    expect(request.url).toBe('https://runtime.internal/v1/files/telegram%2Funique-7')
    return new Response(JSON.stringify({ file: {
      id: 'telegram/unique-7',
      url: 'https://botruntime.example/v1/files/download?key=telegram%2Funique-7',
      size: 9,
      contentType: 'application/pdf',
      status: 'upload_completed',
    } }))
  }) as typeof fetch

  await expect(ingestTelegramFileLink(
    'https://api.telegram.org/file/bot-secret/contracts/ddu.pdf', 'telegram/unique-7', 'application/pdf',
  )).resolves.toEqual({
    id: 'telegram/unique-7',
    url: 'https://botruntime.example/v1/files/download?key=telegram%2Funique-7',
    size: 9,
    contentType: 'application/pdf',
  })
})

test('concurrent duplicate ingest accepts the stored winner after a stale upload token', async () => {
  let getCalls = 0
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (request.url === 'https://runtime.internal/v1/files/telegram%2Frace') {
      getCalls++
      if (getCalls === 1) return new Response('{}', { status: 404 })
      return new Response(JSON.stringify({ file: {
        id: 'telegram/race', url: 'https://runtime.example/v1/files/download?key=telegram%2Frace',
        size: 4, contentType: 'application/pdf', status: 'upload_completed',
      } }))
    }
    if (request.url === 'https://telegram.test/race') return new Response('same')
    if (request.url === 'https://runtime.internal/v1/files') {
      return new Response(JSON.stringify({ file: {
        id: 'telegram/race', url: 'https://runtime.example/v1/files/download?key=telegram%2Frace',
        uploadUrl: 'https://runtime.internal/v1/files/upload?key=telegram%2Frace&token=stale',
      } }))
    }
    if (request.url.includes('/v1/files/upload?')) return new Response('{}', { status: 409 })
    throw new Error(`unexpected request ${request.url}`)
  }) as typeof fetch

  await expect(ingestTelegramFileLink(
    'https://telegram.test/race', 'telegram/race', 'application/pdf',
  )).resolves.toEqual({
    id: 'telegram/race', url: 'https://runtime.example/v1/files/download?key=telegram%2Frace',
    size: 4, contentType: 'application/pdf',
  })
})

test('rejects oversized inbound Telegram media before buffering it', async () => {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (request.url.includes('/v1/files/telegram%2Fhuge')) return new Response('{}', { status: 404 })
    return new Response('x', { headers: { 'content-length': String((20 << 20) + 1) } })
  }) as typeof fetch

  await expect(ingestTelegramFileLink(
    'https://api.telegram.org/file/bot-secret/huge.pdf', 'telegram/huge', 'application/pdf',
  )).rejects.toThrow('exceeds the 20 MiB limit')
})
