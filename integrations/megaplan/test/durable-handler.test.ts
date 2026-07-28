import { expect, test } from 'bun:test'
import { handler } from '../src'

const operationId = 'op-contractor-human-42'
const configuration = {
  baseUrl: 'https://account.megaplan.ru',
  username: 'integration@example.test',
  password: 'secret',
}

const request = (
  checkpoint: { version: '1'; revision: number; entries: Record<string, string> },
  attempt: number,
) => ({
  method: 'POST',
  path: '/',
  query: '',
  headers: {
    'x-bot-id': 'bot-42',
    'x-bot-user-id': 'bot-42_bot',
    'x-integration-id': 'installation-7',
    'x-integration-alias': 'botruntime/megaplan',
    'x-webhook-id': 'operation',
    'x-bp-operation': 'integration_operation',
    'x-bp-type': 'execute',
    'x-bp-configuration': Buffer.from(JSON.stringify(configuration)).toString('base64'),
  },
  body: JSON.stringify({
    protocolVersion: '1',
    operationId,
    phase: 'execute',
    attempt,
    action: 'createContractorHuman',
    idempotencyKey: 'contractor:case-42',
    input: {
      firstName: 'Иван',
      lastName: 'Иванов',
      description: 'Клиент',
      contactInfo: [],
    },
    deadline: new Date(Date.now() + 60_000).toISOString(),
    cancelRequestedAt: null,
    capabilities: { checkpoint: '1' },
    checkpoint,
  }),
})

test('sanitized SDK envelope recovers an ambiguous create and semantic replay performs only exact reads', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  let created: Record<string, unknown> | undefined
  let creates = 0
  let searches = 0
  let exactReads = 0
  let checkpointWrites = 0

  process.env.BP_API_URL = 'https://runtime.example'
  process.env.BP_TOKEN = 'operation-token'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.origin === 'https://runtime.example') {
      expect(parsed.pathname).toBe(`/v1/integration-operations/${operationId}/checkpoint`)
      expect(request.headers.get('authorization')).toBe('Bearer operation-token')
      checkpointWrites++
      const body = await request.json() as {
        expectedRevision: number
        entries: Record<string, string>
      }
      expect(body).toEqual({
        expectedRevision: 0,
        entries: { entity: 'C-100' },
      })
      return Response.json({
        checkpoint: {
          version: '1',
          revision: 1,
          entries: { entity: 'C-100' },
        },
      })
    }
    if (parsed.pathname === '/api/v3/auth/access_token') {
      return Response.json({ access_token: 'megaplan-token' })
    }
    expect(request.headers.get('authorization')).toBe('Bearer megaplan-token')
    if (parsed.pathname === '/api/v3/contractor' && request.method === 'GET') {
      searches++
      return Response.json({
        meta: { status: 200, errors: [] },
        data: created
          ? [{
              contentType: 'ContractorHuman',
              id: created.id,
              name: `${created.firstName} ${created.lastName}`,
            }]
          : [],
      })
    }
    if (parsed.pathname === '/api/v3/contractorHuman/C-100' && request.method === 'GET') {
      exactReads++
      return Response.json({
        meta: { status: 200, errors: [] },
        data: created,
      })
    }
    if (parsed.pathname === '/api/v3/contractorHuman' && request.method === 'POST') {
      creates++
      created = {
        contentType: 'ContractorHuman',
        id: 'C-100',
        ...await request.json() as Record<string, unknown>,
      }
      return new Response('response lost after provider commit', { status: 502 })
    }
    return new Response('unexpected request', { status: 500 })
  }) as typeof fetch

  try {
    const executed = await handler(
      request({ version: '1', revision: 0, entries: {} }, 1) as never,
      {},
    )
    expect(JSON.parse(executed?.body ?? '')).toEqual({
      kind: 'succeeded',
      result: { id: 'C-100' },
    })
    expect(creates).toBe(1)
    expect(searches).toBe(2)
    expect(exactReads).toBe(1)
    expect(checkpointWrites).toBe(1)

    process.env.BP_TOKEN = 'operation-token'
    const replayed = await handler(
      request({ version: '1', revision: 1, entries: { entity: 'C-100' } }, 2) as never,
      {},
    )
    expect(JSON.parse(replayed?.body ?? '')).toEqual({
      kind: 'succeeded',
      result: { id: 'C-100' },
    })
    expect(creates).toBe(1)
    expect(searches).toBe(2)
    expect(exactReads).toBe(2)
    expect(checkpointWrites).toBe(1)
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiUrl === undefined) delete process.env.BP_API_URL
    else process.env.BP_API_URL = originalApiUrl
    if (originalToken === undefined) delete process.env.BP_TOKEN
    else process.env.BP_TOKEN = originalToken
  }
})
