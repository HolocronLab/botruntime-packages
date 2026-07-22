import { afterEach, describe, expect, test } from 'bun:test'
import { RuntimeError, type IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { convertToPdf } from '../src/actions'
import {
  CLOUD_CONVERT_ENDPOINTS,
  type FetchLike,
  type RuntimeFileEnvironment,
} from '../src/cloudconvert-client'
import integration from '../src/index'
import { bodyOf, completedJobResponse, createJobResponse, makeDocx, makePdf, sha256 } from './helpers'

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

    await convertToPdf(
      { apiKey: 'cloudconvert-secret' },
      { fileUrl: inputUrl, sha256: sha256(source), sourceFormat: 'docx' },
      loggerWith(logs),
      { runtimeEnv, fetchImpl: successfulFetch(source, pdf) },
    )

    expect(logs).toHaveLength(1)
    expect(logs[0]?.level).toBe('info')
    expect(JSON.parse(logs[0]!.message)).toMatchObject({
      event: 'cloudconvert.convert',
      result: 'ok',
      sourceSha256: sha256(source),
      inputBytes: source.byteLength,
      outputBytes: pdf.byteLength,
      pageCount: 1,
      engine: 'cloudconvert/office/2021.4',
    })
  })

  test('throws RuntimeError with metadata.code and stable proxy-safe prefix', async () => {
    const logs: Array<{ level: string; message: string }> = []
    const error = await convertToPdf(
      { apiKey: 'cloudconvert-secret' },
      { fileUrl: inputUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' },
      loggerWith(logs),
      { runtimeEnv, fetchImpl: async () => new Response('private source body', { status: 404 }) },
    ).catch((caught) => caught)

    expect(error).toBeInstanceOf(RuntimeError)
    expect(error.message).toMatch(/^\[fetch_failed\]/)
    expect(error.metadata).toEqual({ code: 'fetch_failed' })
    expect(error.message).not.toContain('private source body')
    expect(JSON.parse(logs[0]!.message)).toMatchObject({ result: 'fetch_failed' })
  })

  test('does not serialize four concurrent conversions in the integration process', async () => {
    const source = makeDocx()
    const pdf = await makePdf(1)
    let concurrentCreates = 0
    let peakCreates = 0
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const base = successfulFetch(source, pdf)
    const fetchImpl: FetchLike = async (request, init) => {
      const url = String(request)
      if (url === `${CLOUD_CONVERT_ENDPOINTS.api}/jobs` && (init?.method ?? 'GET') === 'POST') {
        concurrentCreates++
        peakCreates = Math.max(peakCreates, concurrentCreates)
        if (concurrentCreates === 4) release()
        await gate
        concurrentCreates--
      }
      return base(request, init)
    }

    await Promise.all(Array.from({ length: 4 }, () => convertToPdf(
      { apiKey: 'cloudconvert-secret' },
      { fileUrl: inputUrl, sha256: sha256(source), sourceFormat: 'docx' },
      loggerWith([]),
      { runtimeEnv, fetchImpl },
    )))

    expect(peakCreates).toBe(4)
  })
})

describe('SDK handler error contract', () => {
  test('keeps typed code without leaking source or provider credentials', async () => {
    process.env.BP_API_URL = 'https://runtime.internal'
    process.env.CLOUDAPI_PUBLIC_BASE_URL = 'https://botruntime.example'
    process.env.BP_TOKEN = 'runtime-token'
    process.env.BP_BOT_ID = 'bot-1'
    globalThis.fetch = (async () =>
      new Response('private file-store body', { status: 403 })) as unknown as typeof fetch

    const response = await integration.handler({
      method: 'POST',
      path: '/',
      query: '',
      headers: {
        'content-type': 'application/json',
        'x-bp-operation': 'action_triggered',
        'x-bp-configuration-type': 'inline',
        'x-bp-configuration': Buffer.from(JSON.stringify({ apiKey: 'cloudconvert-secret' })).toString('base64'),
        'x-bot-id': 'bot-1',
        'x-bot-user-id': 'bot-1_bot',
        'x-integration-id': 'cloudconvert',
        'x-integration-alias': 'cloudconvert',
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
    expect(response?.body).not.toContain('cloudconvert-secret')
  })
})

function loggerWith(logs: Array<{ level: string; message: string }>): IntegrationLogger {
  return {
    info(message: string) { logs.push({ level: 'info', message }) },
    warn(message: string) { logs.push({ level: 'warn', message }) },
  } as unknown as IntegrationLogger
}

function successfulFetch(source: Uint8Array, pdf: Uint8Array): FetchLike {
  return async (request, init) => {
    const url = String(request)
    const method = init?.method ?? 'GET'
    if (url.startsWith('https://runtime.internal/')) return new Response(bodyOf(source))
    if (url === `${CLOUD_CONVERT_ENDPOINTS.api}/jobs` && method === 'POST') {
      return Response.json(createJobResponse(), { status: 201 })
    }
    if (url.startsWith(`https://${CLOUD_CONVERT_ENDPOINTS.uploadHost}/`)) {
      return new Response(null, { status: 201 })
    }
    if (url === `${CLOUD_CONVERT_ENDPOINTS.syncApi}/jobs/job-123`) {
      return Response.json(completedJobResponse())
    }
    if (url.startsWith(`https://${CLOUD_CONVERT_ENDPOINTS.storageHost}/`)) {
      return new Response(bodyOf(pdf), { headers: { 'content-type': 'application/pdf' } })
    }
    if (url === `${CLOUD_CONVERT_ENDPOINTS.api}/jobs/job-123` && method === 'DELETE') {
      return new Response(null, { status: 204 })
    }
    throw new Error(`unexpected URL ${method} ${url}`)
  }
}
