import { afterEach, describe, expect, test } from 'bun:test'
import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { convertToPdf } from '../src/actions'
import integration from '../src/index'
import type { FetchLike, RuntimeFileEnvironment } from '../src/docconvert-client'
import { bodyOf, makeDocx, makePdf, sha256 } from './helpers'

const originalFetch = globalThis.fetch
const originalEnv = {
  BP_API_URL: process.env.BP_API_URL,
  CLOUDAPI_PUBLIC_BASE_URL: process.env.CLOUDAPI_PUBLIC_BASE_URL,
  BP_TOKEN: process.env.BP_TOKEN,
  BP_BOT_ID: process.env.BP_BOT_ID,
}

afterEach(() => {
  globalThis.fetch = originalFetch
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[name]
    else process.env[name] = value
  }
})

const runtimeEnv: RuntimeFileEnvironment = {
  BP_API_URL: 'https://runtime.internal',
  CLOUDAPI_PUBLIC_BASE_URL: 'https://botruntime.example',
  BP_TOKEN: 'runtime-token',
  BP_BOT_ID: 'bot-1',
}
const inputUrl = 'https://botruntime.example/v1/files/download?key=claim.docx'

describe('convertToPdf action wrapper', () => {
  test('logs one complete success audit record', async () => {
    const source = makeDocx()
    const pdf = await makePdf(1)
    const logs: Array<{ level: string; message: string }> = []
    const logger = loggerWith(logs)

    await convertToPdf(
      { serviceUrl: 'https://convert.internal' },
      { fileUrl: inputUrl, sha256: sha256(source), sourceFormat: 'docx' },
      logger,
      { runtimeEnv, fetchImpl: successfulFetch(source, pdf) },
    )

    expect(logs).toHaveLength(1)
    expect(logs[0]?.level).toBe('info')
    expect(JSON.parse(logs[0]!.message)).toMatchObject({
      event: 'docconvert.convert',
      result: 'ok',
      sourceSha256: sha256(source),
      inputBytes: source.byteLength,
      outputBytes: pdf.byteLength,
      pageCount: 1,
      engine: 'gotenberg/8.34.0+libreoffice',
    })
  })

  test('throws a RuntimeError with metadata.code and a proxy-safe message prefix', async () => {
    const logs: Array<{ level: string; message: string }> = []
    const error = await convertToPdf(
      { serviceUrl: 'https://convert.internal' },
      { fileUrl: inputUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' },
      loggerWith(logs),
      { runtimeEnv, fetchImpl: async () => new Response('missing', { status: 404 }) },
    ).catch((caught) => caught)

    expect(error).toBeInstanceOf(RuntimeError)
    expect(error.message).toMatch(/^\[fetch_failed\]/)
    expect(error.metadata).toEqual({ code: 'fetch_failed' })
    expect(logs).toHaveLength(1)
    expect(JSON.parse(logs[0]!.message)).toMatchObject({ result: 'fetch_failed' })
  })

  test('does not serialize four concurrent calls inside the integration process', async () => {
    const source = makeDocx()
    const pdf = await makePdf(1)
    let concurrentConversions = 0
    let peakConversions = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const fetchImpl: FetchLike = async (request) => {
      const url = String(request)
      if (url.startsWith('https://runtime.internal/')) return new Response(bodyOf(source))
      if (url.endsWith('/version')) return new Response('8.34.0')
      if (url.endsWith('/forms/libreoffice/convert')) {
        concurrentConversions++
        peakConversions = Math.max(peakConversions, concurrentConversions)
        if (concurrentConversions === 4) release()
        await gate
        concurrentConversions--
        return new Response(bodyOf(pdf), { headers: { 'content-type': 'application/pdf' } })
      }
      throw new Error(`unexpected URL ${url}`)
    }

    await Promise.all(Array.from({ length: 4 }, () => convertToPdf(
      { serviceUrl: 'https://convert.internal' },
      { fileUrl: inputUrl, sha256: sha256(source), sourceFormat: 'docx' },
      loggerWith([]),
      { runtimeEnv, fetchImpl },
    )))

    expect(peakConversions).toBe(4)
  })
})

describe('SDK handler error contract', () => {
  test('keeps the typed code in the local SDK envelope without leaking source response bodies', async () => {
    process.env.BP_API_URL = 'https://runtime.internal'
    process.env.CLOUDAPI_PUBLIC_BASE_URL = 'https://botruntime.example'
    process.env.BP_TOKEN = 'runtime-token'
    process.env.BP_BOT_ID = 'bot-1'
    globalThis.fetch = (async () => new Response('private file-store body', { status: 403 })) as unknown as typeof fetch

    const response = await integration.handler({
      method: 'POST',
      path: '/',
      query: '',
      headers: {
        'content-type': 'application/json',
        'x-bp-operation': 'action_triggered',
        'x-bp-configuration-type': 'inline',
        'x-bp-configuration': Buffer.from(JSON.stringify({ serviceUrl: 'https://convert.internal' })).toString('base64'),
        'x-bot-id': 'bot-1',
        'x-bot-user-id': 'bot-1_bot',
        'x-integration-id': 'docconvert',
        'x-integration-alias': 'docconvert',
        'x-webhook-id': 'webhook-1',
      },
      body: JSON.stringify({
        type: 'convertToPdf',
        input: { fileUrl: inputUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' },
      }),
    })

    expect(response?.status).toBe(400)
    const body = JSON.parse(response?.body ?? '{}')
    expect(body).toMatchObject({
      code: 400,
      type: 'Runtime',
      message: expect.stringMatching(/^\[fetch_failed\]/),
      metadata: { code: 'fetch_failed' },
    })
    expect(response?.body).not.toContain('private file-store body')
    expect(response?.body).not.toContain('runtime-token')
  })
})

function loggerWith(logs: Array<{ level: string; message: string }>): IntegrationLogger {
  return {
    info(message: string) { logs.push({ level: 'info', message }) },
    warn(message: string) { logs.push({ level: 'warn', message }) },
  } as unknown as IntegrationLogger
}

function successfulFetch(source: Uint8Array, pdf: Uint8Array): FetchLike {
  return async (request) => {
    const url = String(request)
    if (url.startsWith('https://runtime.internal/')) return new Response(bodyOf(source))
    if (url.endsWith('/version')) return new Response('8.34.0')
    if (url.endsWith('/forms/libreoffice/convert')) {
      return new Response(bodyOf(pdf), { headers: { 'content-type': 'application/pdf' } })
    }
    throw new Error(`unexpected URL ${url}`)
  }
}
