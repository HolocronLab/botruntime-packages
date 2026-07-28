import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { integrationHandler } from '.'

const checksum = `sha256:${'a'.repeat(64)}`
const preparedRef = {
  version: '1',
  id: 'cases/42/claim.pdf',
  generation: '01K1GENERATION',
  checksum,
  size: 5,
  contentType: 'application/pdf',
  filename: 'claim.pdf',
}

const body = {
  protocolVersion: '1',
  operationId: 'op-42',
  phase: 'execute',
  attempt: 2,
  action: 'publishCaseDocument',
  idempotencyKey: 'case-document:publication-42',
  input: {
    owner: 'deal',
    ownerId: '42',
    contentHtml: '<p>Документ</p>',
    attachments: [{ fileRef: preparedRef }],
  },
  deadline: '2026-07-27T18:00:00Z',
  cancelRequestedAt: null,
  capabilities: {
    files: '1',
    checkpoint: '1',
  },
  checkpoint: {
    version: '1',
    revision: 0,
    entries: {},
  },
}

const request = (overrides: Record<string, unknown> = {}) => ({
  method: 'POST',
  path: '/',
  query: '',
  headers: {
    'x-bot-id': 'bot',
    'x-bot-user-id': 'bot-user',
    'x-integration-id': 'megaplan',
    'x-integration-alias': 'botruntime/megaplan',
    'x-webhook-id': 'operation',
    'x-bp-operation': 'integration_operation',
    'x-bp-type': 'execute',
    'x-bp-configuration': Buffer.from('{}').toString('base64'),
  },
  body: JSON.stringify({ ...body, ...overrides }),
})

describe('durable operation SDK boundary', () => {
  beforeEach(() => {
    process.env.BP_API_URL = 'https://botruntime.example'
    process.env.BP_TOKEN = 'operation-token'
  })

  afterEach(() => {
    delete process.env.BP_API_URL
    delete process.env.BP_TOKEN
    vi.unstubAllGlobals()
  })

  test('materializes scoped clients and keeps token and lease generation out of handler props', async () => {
    const abortController = new AbortController()
    const requests: Array<{ url: string; init?: RequestInit }> = []
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(input), init })
      if (init?.method === 'GET') {
        return new Response('first', {
          status: 200,
          headers: {
            'content-length': '5',
            etag: `"${checksum}"`,
            'accept-ranges': 'bytes',
            'content-type': 'application/pdf',
          },
        })
      }
      return Response.json({
        checkpoint: {
          version: '1',
          revision: 1,
          entries: { comment: 'C-1' },
        },
      })
    }))

    const durableOperationHandler = vi.fn(async (props: any) => {
      expect(props.phase).toBe('execute')
      expect(props.operationId).toBe('op-42')
      expect(props.leaseGeneration).toBeUndefined()
      expect(props.operationCapability).toBeUndefined()
      expect(props.client).toBeUndefined()
      expect(props.abortSignal).toBe(abortController.signal)
      expect(process.env.BP_TOKEN).toBeUndefined()
      expect(JSON.stringify(props)).not.toContain('operation-token')
      expect(await new Response(await props.files.openRef(props.input.attachments[0].fileRef)).text()).toBe('first')
      await props.checkpoint.append('comment', 'C-1')
      return {
        kind: 'succeeded' as const,
        result: { commentId: 'C-1', attachmentIds: ['M-1'] },
      }
    })
    const handler = integrationHandler({
      durableOperationHandler,
    } as never)

    const response = await handler(request(), { abortSignal: abortController.signal })

    expect(JSON.parse(response?.body ?? '')).toEqual({
      kind: 'succeeded',
      result: { commentId: 'C-1', attachmentIds: ['M-1'] },
    })
    expect(durableOperationHandler).toHaveBeenCalledOnce()
    expect(requests.map(({ url }) => url)).toEqual([
      'https://botruntime.example/v1/integration-operations/op-42/files/01K1GENERATION/content',
      'https://botruntime.example/v1/integration-operations/op-42/checkpoint',
    ])
    for (const { init } of requests) {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer operation-token')
    }
  })

  test('does not infer clients when the capability descriptor is absent', async () => {
    const durableOperationHandler = vi.fn(async (props: any) => {
      expect(props.files).toBeUndefined()
      expect(props.checkpoint).toBeUndefined()
      return { kind: 'retry_safe' as const }
    })
    const handler = integrationHandler({
      durableOperationHandler,
    } as never)

    const response = await handler(request({
      capabilities: undefined,
      checkpoint: undefined,
    }))

    expect(response?.status).toBe(200)
    expect(durableOperationHandler).toHaveBeenCalledOnce()
  })

  test.each([
    ['phase mismatch', {}, { 'x-bp-type': 'reconcile' }],
    ['secret capability', { operationCapability: { version: '1', token: 'secret' } }, {}],
    ['lease generation', { leaseGeneration: 4 }, {}],
    ['unknown capability', { capabilities: { files: '2' } }, {}],
    ['checkpoint without descriptor', { capabilities: {}, checkpoint: body.checkpoint }, {}],
  ])('rejects %s before the integration handler', async (_label, bodyOverride, headerOverride) => {
    const durableOperationHandler = vi.fn()
    const handler = integrationHandler({
      durableOperationHandler,
    } as never)
    const incoming = request(bodyOverride)
    incoming.headers = { ...incoming.headers, ...headerOverride }

    const response = await handler(incoming)

    expect(response?.status).toBe(400)
    expect(durableOperationHandler).not.toHaveBeenCalled()
  })
})
