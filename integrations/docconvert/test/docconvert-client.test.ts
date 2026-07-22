import { describe, expect, test } from 'bun:test'
import {
  DOC_CONVERT_LIMITS,
  DocConvertClient,
  type DocConvertClientOptions,
  type FetchLike,
  type RuntimeFileEnvironment,
} from '../src/docconvert-client'
import { DocConvertError } from '../src/errors'
import { bodyOf, makeDocx, makePdf, sha256 } from './helpers'

const configuration = { serviceUrl: 'https://convert.internal', authToken: 'service-token' }
const runtimeEnv: RuntimeFileEnvironment = {
  BP_API_URL: 'https://runtime.internal',
  CLOUDAPI_PUBLIC_BASE_URL: 'https://botruntime.example',
  BP_TOKEN: 'runtime-token',
  BP_BOT_ID: 'bot-42',
}
const fileUrl = 'https://botruntime.example/v1/files/download?key=cases%2F42%2Fclaim.docx'

describe('DocConvertClient success and security', () => {
  test('downloads with runtime auth, strips it on redirect, verifies SHA and returns a parsed PDF', async () => {
    const source = makeDocx()
    const pdf = await makePdf(2)
    const calls: Request[] = []
    const fetchImpl: FetchLike = async (input, init) => {
      const request = input instanceof Request ? new Request(input, init) : new Request(String(input), init)
      calls.push(request)
      if (request.url === 'https://runtime.internal/v1/files/download?key=cases%2F42%2Fclaim.docx') {
        expect(request.headers.get('authorization')).toBe('Bearer runtime-token')
        expect(request.headers.get('x-bot-id')).toBe('bot-42')
        return new Response(null, { status: 302, headers: { location: 'https://storage.example/signed/source.docx' } })
      }
      if (request.url === 'https://storage.example/signed/source.docx') {
        expect(request.headers.get('authorization')).toBeNull()
        expect(request.headers.get('x-bot-id')).toBeNull()
        return new Response(bodyOf(source))
      }
      if (request.url === 'https://convert.internal/version') {
        expect(request.headers.get('authorization')).toBe('Bearer service-token')
        return new Response('8.34.0')
      }
      if (request.url === 'https://convert.internal/forms/libreoffice/convert') {
        expect(request.method).toBe('POST')
        expect(request.headers.get('authorization')).toBe('Bearer service-token')
        const form = init?.body as FormData
        expect(form.get('metadata')).toContain('2000-01-01T00:00:00Z')
        const uploaded = form.get('files')
        expect(uploaded).toBeInstanceOf(Blob)
        expect(Array.from(new Uint8Array(await (uploaded as Blob).arrayBuffer()))).toEqual(Array.from(source))
        return new Response(bodyOf(pdf), { headers: { 'content-type': 'application/pdf' } })
      }
      throw new Error(`unexpected request ${request.method} ${request.url}`)
    }
    const client = new DocConvertClient(configuration, { fetchImpl, runtimeEnv })

    const result = await client.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'docx' })

    expect(result.pageCount).toBe(2)
    expect(result.sourceSha256).toBe(sha256(source))
    expect(result.engine).toBe('gotenberg/8.34.0+libreoffice')
    expect(Buffer.from(result.pdfBase64, 'base64')).toEqual(Buffer.from(pdf))
    expect(calls).toHaveLength(4)
  })

  test('never fetches arbitrary HTTPS URLs or non-file runtime endpoints', async () => {
    let calls = 0
    const client = new DocConvertClient(configuration, {
      runtimeEnv,
      fetchImpl: async () => { calls++; return new Response() },
    })
    for (const unsafeUrl of [
      'https://evil.example/source.docx',
      'https://botruntime.example/v1/admin/bots?dump=1',
      'http://botruntime.example/v1/files/download?key=claim.docx',
    ]) {
      await expect(client.convert({ fileUrl: unsafeUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
        .rejects.toMatchObject({ code: 'fetch_failed' })
    }
    expect(calls).toBe(0)
  })

  test('allows at most three HTTPS redirects', async () => {
    let calls = 0
    const client = new DocConvertClient(configuration, {
      runtimeEnv,
      fetchImpl: async () => {
        calls++
        return new Response(null, { status: 302, headers: { location: `https://storage.example/${calls}` } })
      },
    })

    await expect(client.convert({ fileUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'fetch_failed' })
    expect(calls).toBe(4)
  })
})

describe('DocConvertClient typed failures', () => {
  test('fetch_failed: source returns non-200', async () => {
    const client = sourceClient(async () => new Response('missing', { status: 404 }))
    await expect(client.convert({ fileUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'fetch_failed' })
  })

  test('fetch_failed: source stream fails after HTTP 200', async () => {
    const client = sourceClient(async () => new Response(new ReadableStream({
      pull(controller) {
        controller.error(new Error('storage connection reset'))
      },
    })))
    await expect(client.convert({ fileUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'fetch_failed' })
  })

  test('source_mismatch: downloaded bytes differ from expected SHA', async () => {
    const source = makeDocx()
    const client = sourceClient(async () => new Response(bodyOf(source)))
    await expect(client.convert({ fileUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'source_mismatch' })
  })

  test('source_too_large: declared and streamed bodies are both capped', async () => {
    const declared = sourceClient(async () => new Response('x', {
      headers: { 'content-length': String(DOC_CONVERT_LIMITS.sourceBytes + 1) },
    }))
    await expect(declared.convert({ fileUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'source_too_large' })

    const streamed = sourceClient(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8))
        controller.enqueue(new Uint8Array(1))
        controller.close()
      },
    })), { sourceBytes: 8 })
    await expect(streamed.convert({ fileUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'source_too_large' })
  })

  test('unsupported_format: enum, malformed DOCX, VBA and provider 400', async () => {
    const source = makeDocx()
    const enumClient = sourceClient(async () => new Response(bodyOf(source)))
    await expect(enumClient.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'doc' as 'docx' }))
      .rejects.toMatchObject({ code: 'unsupported_format' })

    const malformed = new TextEncoder().encode('not a ZIP')
    const malformedClient = sourceClient(async () => new Response(bodyOf(malformed)))
    await expect(malformedClient.convert({ fileUrl, sha256: sha256(malformed), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'unsupported_format' })

    const macro = makeDocx(['word/vbaProject.bin'])
    const macroClient = sourceClient(async () => new Response(bodyOf(macro)))
    await expect(macroClient.convert({ fileUrl, sha256: sha256(macro), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'unsupported_format' })

    const providerClient = completeClient(source, async () => new Response('invalid office file', { status: 400 }))
    await expect(providerClient.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'unsupported_format' })
  })

  test('conversion_failed: provider body is never exposed and invalid PDF is rejected', async () => {
    const source = makeDocx()
    const providerClient = completeClient(source, async () => new Response(
      'service-token provider-secret https://internal.example/private/path document fragment',
      { status: 500 },
    ))
    let providerError: unknown
    try {
      await providerClient.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'docx' })
    } catch (error) {
      providerError = error
    }
    expect(providerError).toBeInstanceOf(DocConvertError)
    expect((providerError as DocConvertError).code).toBe('conversion_failed')
    expect((providerError as DocConvertError).message).toBe('Движок конвертации вернул HTTP 500')
    expect((providerError as DocConvertError).message).not.toContain('service-token')
    expect((providerError as DocConvertError).message).not.toContain('provider-secret')
    expect((providerError as DocConvertError).message).not.toContain('internal.example')

    const invalidPdfClient = completeClient(source, async () => new Response('not-pdf', {
      headers: { 'content-type': 'application/pdf' },
    }))
    await expect(invalidPdfClient.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'conversion_failed' })
  })

  test('conversion_failed: declared PDF over 50 MB is rejected before buffering', async () => {
    const source = makeDocx()
    const client = completeClient(source, async () => new Response('%PDF-', {
      headers: {
        'content-type': 'application/pdf',
        'content-length': String(DOC_CONVERT_LIMITS.outputBytes + 1),
      },
    }))
    await expect(client.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'conversion_failed' })
  })

  test('timeout: Gotenberg deadline response is typed', async () => {
    const source = makeDocx()
    const client = completeClient(source, async () => new Response('deadline', { status: 503 }))
    await expect(client.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'timeout' })
  })
})

function sourceClient(
  sourceResponse: FetchLike,
  limits: DocConvertClientOptions['limits'] = {},
): DocConvertClient {
  return new DocConvertClient(configuration, { fetchImpl: sourceResponse, runtimeEnv, limits })
}

function completeClient(source: Uint8Array, conversionResponse: FetchLike): DocConvertClient {
  return new DocConvertClient(configuration, {
    runtimeEnv,
    fetchImpl: async (input, init) => {
      const url = String(input)
      if (url.startsWith('https://runtime.internal/')) return new Response(bodyOf(source))
      if (url === 'https://convert.internal/version') return new Response('8.34.0')
      if (url === 'https://convert.internal/forms/libreoffice/convert') return conversionResponse(input, init)
      throw new Error(`unexpected URL ${url}`)
    },
  })
}
