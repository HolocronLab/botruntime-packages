import { describe, expect, test, vi } from 'vitest'
import {
  createOperationCheckpointClient,
  createOperationFilesClient,
  type FileRefV1,
} from './capabilities'

const config = {
  apiUrl: 'https://botruntime.example',
  timeout: 125_000,
  actionTransportTimeoutMs: 190_000,
  withCredentials: false,
  headers: {
    authorization: 'Bearer operation-token',
    'x-bot-id': 'must-not-leak',
  },
  debug: false,
}

const ref = {
  version: '1',
  id: 'cases/42/claim.pdf',
  generation: '01K1GENERATION',
  checksum: `sha256:${'a'.repeat(64)}`,
  size: 5,
  contentType: 'application/pdf',
  filename: 'claim.pdf',
} satisfies FileRefV1

describe('operation-scoped file capability', () => {
  test('opens the pinned generation without exposing a Files API URL or ordinary client headers', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const headers = new Headers(init?.headers)
      expect(headers.get('authorization')).toBe('Bearer operation-token')
      expect(headers.get('x-bot-id')).toBeNull()
      return new Response('first', {
        status: 200,
        headers: {
          'content-length': '5',
          etag: `"${ref.checksum}"`,
          'accept-ranges': 'bytes',
          'content-type': 'application/pdf',
        },
      })
    })
    const files = createOperationFilesClient({
      config,
      operationId: 'op/42',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(await new Response(await files.openRef(ref)).text()).toBe('first')
    const requestUrl = String(fetchImpl.mock.calls[0]![0])
    expect(requestUrl).toBe(
      'https://botruntime.example/v1/integration-operations/op%2F42/files/01K1GENERATION/content'
    )
    expect(requestUrl).not.toContain(ref.id)
  })

  test('uses one bounded range and checks the canonical ETag', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('range')).toBe('bytes=1-3')
      expect(new Headers(init?.headers).get('if-range')).toBe(`"${ref.checksum}"`)
      return new Response('irs', {
        status: 206,
        headers: {
          'content-length': '3',
          etag: `"${ref.checksum}"`,
          'accept-ranges': 'bytes',
          'content-type': 'application/pdf',
        },
      })
    })
    const files = createOperationFilesClient({
      config,
      operationId: 'op-42',
      fetchImpl: fetchImpl as typeof fetch,
    })

    expect(await new Response(await files.openRef(ref, { range: { start: 1, end: 3 } })).text()).toBe('irs')
    await expect(files.openRef(ref, { range: { start: 4, end: 5 } })).rejects.toThrow(/range/i)
  })

  test('preserves the server status and stable error code without exposing the token', async () => {
    const files = createOperationFilesClient({
      config,
      operationId: 'op-42',
      fetchImpl: (async () => Response.json({
        code: 'OPERATION_LEASE_LOST',
        message: 'attempt lease is no longer current',
      }, { status: 409 })) as typeof fetch,
    })

    await expect(files.openRef(ref)).rejects.toMatchObject({
      name: 'OperationCapabilityError',
      status: 409,
      code: 'OPERATION_LEASE_LOST',
      message: 'attempt lease is no longer current',
    })
  })
})

describe('operation-scoped checkpoint capability', () => {
  test('serializes appends and advances the private revision', async () => {
    const bodies: unknown[] = []
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      bodies.push(body)
      const entries = Object.assign({}, ...bodies.map((item) => (item as { entries: object }).entries))
      return Response.json({
        checkpoint: {
          version: '1',
          revision: bodies.length,
          entries,
        },
      })
    })
    const checkpoint = createOperationCheckpointClient({
      config,
      operationId: 'op-42',
      snapshot: { version: '1', revision: 0, entries: {} },
      fetchImpl: fetchImpl as typeof fetch,
    })

    await Promise.all([
      checkpoint.append('attachment:00', 'provider-file-1'),
      checkpoint.append('attachment:01', 'provider-file-2'),
    ])
    expect(bodies).toEqual([
      {
        expectedRevision: 0,
        entries: { 'attachment:00': 'provider-file-1' },
      },
      {
        expectedRevision: 1,
        entries: { 'attachment:01': 'provider-file-2' },
      },
    ])
    expect(checkpoint.revision).toBe(2)
    expect(checkpoint.entries).toEqual({
      'attachment:00': 'provider-file-1',
      'attachment:01': 'provider-file-2',
    })
  })

  test('retries the exact body after a lost response', async () => {
    const bodies: string[] = []
    const fetchImpl = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      bodies.push(String(init?.body))
      if (bodies.length === 1) throw new Error('connection reset after commit')
      return Response.json({
        checkpoint: {
          version: '1',
          revision: 1,
          entries: { comment: 'provider-comment-1' },
        },
      })
    })
    const checkpoint = createOperationCheckpointClient({
      config,
      operationId: 'op-42',
      snapshot: { version: '1', revision: 0, entries: {} },
      fetchImpl: fetchImpl as typeof fetch,
    })

    await checkpoint.append('comment', 'provider-comment-1')
    expect(bodies).toHaveLength(2)
    expect(bodies[0]).toBe(bodies[1])
  })

  test('rejects invalid values before network access', async () => {
    const fetchImpl = vi.fn()
    const checkpoint = createOperationCheckpointClient({
      config,
      operationId: 'op-42',
      snapshot: { version: '1', revision: 0, entries: {} },
      fetchImpl: fetchImpl as typeof fetch,
    })

    await expect(checkpoint.append('bad key', 'value')).rejects.toThrow(/append/i)
    await expect(checkpoint.append('comment', 'bad\nvalue')).rejects.toThrow(/append/i)
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})
