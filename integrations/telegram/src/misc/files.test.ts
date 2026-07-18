import { afterEach, beforeEach, expect, test } from 'bun:test'
import { resolveTelegramDocument } from './files'

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

  await expect(
    resolveTelegramDocument('https://runtime.internal/v1/files/download?key=huge.docx', 'huge.docx'),
  ).rejects.toThrow(/exceeds.*20 MiB/i)
})

test('stops a protected document stream when it crosses the byte cap', async () => {
  globalThis.fetch = (async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(20 << 20))
      controller.enqueue(new Uint8Array(1))
      controller.close()
    },
  }))) as unknown as typeof fetch

  await expect(
    resolveTelegramDocument('https://runtime.internal/v1/files/download?key=stream.docx', 'stream.docx'),
  ).rejects.toThrow(/exceeds.*20 MiB/i)
})

test('fails loudly when a protected Botruntime document cannot be authenticated', async () => {
  delete process.env.BP_TOKEN

  await expect(
    resolveTelegramDocument('https://runtime.internal/v1/files/download?key=claim.docx', 'approved.docx'),
  ).rejects.toThrow(/missing BP_TOKEN\/BP_BOT_ID/i)
})
