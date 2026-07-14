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
    expect(request.url).toBe('https://botruntime.example/v1/files/download?key=claim.docx')
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

test('buffers a cross-origin DOCX without leaking Botruntime credentials', async () => {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    expect(request.url).toBe('https://storage.example/presigned/approved.docx')
    expect(request.headers.get('authorization')).toBeNull()
    expect(request.headers.get('x-bot-id')).toBeNull()
    return new Response('approved-claim')
  }) as typeof fetch

  const document = await resolveTelegramDocument(
    'https://storage.example/presigned/approved.docx',
    'approved.docx',
  )

  expect(document).toEqual({ source: Buffer.from('approved-claim'), filename: 'approved.docx' })
})

test('fails loudly when a protected Botruntime document cannot be authenticated', async () => {
  delete process.env.BP_TOKEN

  await expect(
    resolveTelegramDocument('https://runtime.internal/v1/files/download?key=claim.docx', 'approved.docx'),
  ).rejects.toThrow(/missing BP_TOKEN\/BP_BOT_ID/i)
})
