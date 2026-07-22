import { describe, expect, test } from 'bun:test'
import {
  CLOUD_CONVERT_ENDPOINTS,
  CLOUD_CONVERT_LIMITS,
  CloudConvertClient,
  type FetchLike,
  type RuntimeFileEnvironment,
} from '../src/cloudconvert-client'
import { CloudConvertError } from '../src/errors'
import {
  bodyOf,
  completedJobResponse,
  createJobResponse,
  makeDocx,
  makePdf,
  sha256,
} from './helpers'

const configuration = { apiKey: 'cloudconvert-secret' }
const runtimeEnv: RuntimeFileEnvironment = {
  BP_API_URL: 'https://runtime.internal',
  CLOUDAPI_PUBLIC_BASE_URL: 'https://botruntime.example',
  BP_TOKEN: 'runtime-token',
  BP_BOT_ID: 'bot-1',
}
const fileUrl = 'https://botruntime.example/v1/files/download?key=claim.docx'

describe('CloudConvertClient success path', () => {
  test('uses private upload flow, returns validated PDF and deletes the job', async () => {
    const source = makeDocx()
    const pdf = await makePdf(2)
    const requests: Array<{ url: string; method: string }> = []
    const fetchImpl: FetchLike = async (request, init) => {
      const url = String(request)
      const method = init?.method ?? 'GET'
      requests.push({ url, method })

      if (url.startsWith('https://runtime.internal/')) {
        const headers = new Headers(init?.headers)
        expect(headers.get('authorization')).toBe('Bearer runtime-token')
        expect(headers.get('x-bot-id')).toBe('bot-1')
        return new Response(bodyOf(source))
      }
      if (url === `${CLOUD_CONVERT_ENDPOINTS.api}/jobs` && method === 'POST') {
        const headers = new Headers(init?.headers)
        expect(headers.get('authorization')).toBe('Bearer cloudconvert-secret')
        const payload = JSON.parse(String(init?.body))
        expect(payload).toMatchObject({
          tasks: {
            upload_source: { operation: 'import/upload' },
            convert_to_pdf: {
              operation: 'convert',
              input: 'upload_source',
              input_format: 'docx',
              output_format: 'pdf',
              engine: 'office',
            },
            export_pdf: { operation: 'export/url', input: 'convert_to_pdf' },
          },
        })
        expect(JSON.stringify(payload)).not.toContain(fileUrl)
        expect(JSON.stringify(payload)).not.toContain('runtime-token')
        return Response.json(createJobResponse(), { status: 201 })
      }
      if (url.startsWith(`https://${CLOUD_CONVERT_ENDPOINTS.uploadHost}/`)) {
        expect(new Headers(init?.headers).has('authorization')).toBe(false)
        expect(init?.body).toBeInstanceOf(FormData)
        const entries = Array.from((init?.body as FormData).entries())
        expect(entries.map(([name]) => name)).toEqual(['expires', 'signature', 'file'])
        expect(entries.at(-1)?.[1]).toBeInstanceOf(File)
        return new Response(null, { status: 201 })
      }
      if (url === `${CLOUD_CONVERT_ENDPOINTS.syncApi}/jobs/job-123`) {
        expect(new Headers(init?.headers).get('authorization')).toBe('Bearer cloudconvert-secret')
        return Response.json(completedJobResponse())
      }
      if (url.startsWith(`https://${CLOUD_CONVERT_ENDPOINTS.storageHost}/`)) {
        expect(new Headers(init?.headers).has('authorization')).toBe(false)
        return new Response(bodyOf(pdf), { headers: { 'content-type': 'application/pdf' } })
      }
      if (url === `${CLOUD_CONVERT_ENDPOINTS.api}/jobs/job-123` && method === 'DELETE') {
        return new Response(null, { status: 204 })
      }
      throw new Error(`unexpected URL ${method} ${url}`)
    }

    const result = await new CloudConvertClient(configuration, { fetchImpl, runtimeEnv }).convert({
      fileUrl,
      sha256: sha256(source),
      sourceFormat: 'docx',
    })

    expect(result.sourceSha256).toBe(sha256(source))
    expect(result.pageCount).toBe(2)
    expect(result.engine).toBe('cloudconvert/office/2021.4')
    expect(Buffer.from(result.pdfBase64, 'base64')).toEqual(Buffer.from(pdf))
    expect(requests.at(-1)).toEqual({
      url: `${CLOUD_CONVERT_ENDPOINTS.api}/jobs/job-123`,
      method: 'DELETE',
    })
  })

  test('verify uses task.read-compatible jobs endpoint and never exposes the key', async () => {
    let authorization = ''
    const client = new CloudConvertClient(configuration, {
      fetchImpl: async (request, init) => {
        expect(String(request)).toBe(`${CLOUD_CONVERT_ENDPOINTS.api}/jobs?per_page=1`)
        authorization = new Headers(init?.headers).get('authorization') ?? ''
        return Response.json({ data: [] })
      },
    })
    await client.verify()
    expect(authorization).toBe('Bearer cloudconvert-secret')
  })
})

describe('CloudConvertClient safety and errors', () => {
  test('never follows provider-controlled upload or export URLs outside allowlisted hosts', async () => {
    const source = makeDocx()
    const badUpload = providerClient(source, {
      create: createJobResponse('https://attacker.example/upload'),
    })
    await expect(badUpload.convertDocxBytes(source)).rejects.toMatchObject({ code: 'conversion_failed' })

    const badExport = providerClient(source, {
      completed: completedJobResponse('https://attacker.example/result.pdf'),
    })
    await expect(badExport.convertDocxBytes(source)).rejects.toMatchObject({ code: 'conversion_failed' })
  })

  test('source_mismatch, source_too_large and unsupported_format are typed', async () => {
    const source = makeDocx()
    const downloadOnly = new CloudConvertClient(configuration, {
      runtimeEnv,
      fetchImpl: async () => new Response(bodyOf(source)),
    })
    await expect(downloadOnly.convert({ fileUrl, sha256: 'a'.repeat(64), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'source_mismatch' })

    const oversized = new CloudConvertClient(configuration, {
      runtimeEnv,
      limits: { sourceBytes: 10 },
      fetchImpl: async () => new Response(bodyOf(source)),
    })
    await expect(oversized.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'source_too_large' })

    const malformed = new TextEncoder().encode('not-a-docx')
    const malformedClient = new CloudConvertClient(configuration, {
      runtimeEnv,
      fetchImpl: async () => new Response(bodyOf(malformed)),
    })
    await expect(malformedClient.convert({ fileUrl, sha256: sha256(malformed), sourceFormat: 'docx' }))
      .rejects.toMatchObject({ code: 'unsupported_format' })
    await expect(downloadOnly.convert({ fileUrl, sha256: sha256(source), sourceFormat: 'doc' as 'docx' }))
      .rejects.toMatchObject({ code: 'unsupported_format' })
    await expect(downloadOnly.convertDocxBytes(makeDocx(['word/vbaProject.bin'])))
      .rejects.toMatchObject({ code: 'unsupported_format' })
  })

  test('maps CloudConvert OPEN_FAILED and provider timeout without echoing provider bodies', async () => {
    const source = makeDocx()
    const openFailed = providerClient(source, {
      completed: {
        data: {
          id: 'job-123',
          status: 'error',
          tasks: [{
            operation: 'convert',
            status: 'error',
            code: 'OPEN_FAILED',
            message: 'provider-secret https://private.example/document',
          }],
        },
      },
    })
    const error = await openFailed.convertDocxBytes(source).catch((caught) => caught)
    expect(error).toBeInstanceOf(CloudConvertError)
    expect(error.code).toBe('unsupported_format')
    expect(error.message).not.toContain('provider-secret')
    expect(error.message).not.toContain('private.example')

    const timeout = providerClient(source, { createStatus: 503 })
    await expect(timeout.convertDocxBytes(source)).rejects.toMatchObject({ code: 'timeout' })
  })

  test('rejects oversized and invalid PDF and still deletes the provider job', async () => {
    const source = makeDocx()
    let deletes = 0
    const oversized = providerClient(source, {
      output: new Response('%PDF-', {
        headers: {
          'content-type': 'application/pdf',
          'content-length': String(CLOUD_CONVERT_LIMITS.outputBytes + 1),
        },
      }),
      onDelete: () => { deletes++ },
    })
    await expect(oversized.convertDocxBytes(source)).rejects.toMatchObject({ code: 'conversion_failed' })

    const invalid = providerClient(source, {
      output: new Response('not-pdf', { headers: { 'content-type': 'application/pdf' } }),
      onDelete: () => { deletes++ },
    })
    await expect(invalid.convertDocxBytes(source)).rejects.toMatchObject({ code: 'conversion_failed' })
    expect(deletes).toBe(2)
  })
})

type ProviderScenario = {
  create?: Record<string, unknown>
  completed?: Record<string, unknown>
  createStatus?: number
  output?: Response
  onDelete?: () => void
}

function providerClient(source: Uint8Array, scenario: ProviderScenario): CloudConvertClient {
  return new CloudConvertClient(configuration, {
    fetchImpl: async (request, init) => {
      const url = String(request)
      const method = init?.method ?? 'GET'
      if (url === `${CLOUD_CONVERT_ENDPOINTS.api}/jobs` && method === 'POST') {
        if (scenario.createStatus) return new Response('provider private body', { status: scenario.createStatus })
        return Response.json(scenario.create ?? createJobResponse(), { status: 201 })
      }
      if (url.startsWith(`https://${CLOUD_CONVERT_ENDPOINTS.uploadHost}/`)) {
        return new Response(null, { status: 201 })
      }
      if (url === `${CLOUD_CONVERT_ENDPOINTS.syncApi}/jobs/job-123`) {
        return Response.json(scenario.completed ?? completedJobResponse())
      }
      if (url.startsWith(`https://${CLOUD_CONVERT_ENDPOINTS.storageHost}/`)) {
        return scenario.output ?? new Response(bodyOf(source), { headers: { 'content-type': 'application/pdf' } })
      }
      if (url === `${CLOUD_CONVERT_ENDPOINTS.api}/jobs/job-123` && method === 'DELETE') {
        scenario.onDelete?.()
        return new Response(null, { status: 204 })
      }
      throw new Error(`unexpected URL ${method} ${url}`)
    },
  })
}
