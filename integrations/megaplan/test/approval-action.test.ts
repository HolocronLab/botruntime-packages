import { expect, test } from 'bun:test'
import { createNegotiationTask, getNegotiationDecision } from '../src/actions/approval'

test('create negotiation action verifies bytes, uploads them and attaches the Megaplan file', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  const bytes = new TextEncoder().encode('claim-v1')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  let attachedFileId = ''

  process.env.BP_API_URL = 'https://runtime.local'
  process.env.BP_TOKEN = 'bp-token'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.origin === 'https://runtime.local') {
      expect(request.headers.get('authorization')).toBe('Bearer bp-token')
      return new Response(bytes, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } })
    }
    expect(request.headers.get('authorization')).toBe('Bearer megaplan-token')
    if (parsed.pathname === '/api/file') {
      const form = await request.formData()
      expect(await (form.get('files[]') as File).text()).toBe('claim-v1')
      return Response.json({ meta: { status: 200, errors: [] }, data: [{ contentType: 'File', id: 'F1' }] })
    }
    if (parsed.pathname === '/api/v3/task') {
      const body = await request.json() as any
      attachedFileId = body.negotiationItems[0].actualVersion.attache.id
      return Response.json({
        meta: { status: 200, errors: [] },
        data: { contentType: 'Task', id: 'T1', negotiationItems: [{ id: 'N1', actualVersion: { id: 'V1' } }] },
      })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  const client = {
    getOrSetState: async () => ({ state: { payload: { accessToken: 'megaplan-token' } } }),
    setState: async () => ({}),
  }
  try {
    const output = await createNegotiationTask({
      ctx: {
        integrationId: 'integration-1',
        configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
      },
      input: {
        name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
        materialName: 'claim.docx', materialUrl: 'https://runtime.local/v1/files/download?id=1', materialSha256: sha256,
      },
      client,
    } as any)
    expect(output).toEqual({ taskId: 'T1', itemId: 'N1', versionId: 'V1' })
    expect(attachedFileId).toBe('F1')
  } finally {
    globalThis.fetch = originalFetch
    process.env.BP_API_URL = originalApiUrl
    process.env.BP_TOKEN = originalToken
  }
})

test('approved document without an attached actual version fails loudly', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (new URL(request.url).pathname === '/api/v3/task/T1/negotiationItems') {
      return Response.json({
        meta: { status: 200, errors: [] },
        data: [{ id: 'N1', actualVersion: { id: 'V2', status: 'ok', visas: [{ status: 'ok', userCreated: { id: 'E2' } }] } }],
      })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch
  const client = {
    getOrSetState: async () => ({ state: { payload: { accessToken: 'megaplan-token' } } }),
    setState: async () => ({}),
  }
  try {
    await expect(getNegotiationDecision({
      ctx: { integrationId: 'integration-1', configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' } },
      input: { taskId: 'T1' }, client,
    } as any)).rejects.toThrow(/no attached file/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})
