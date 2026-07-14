import { expect, test } from 'bun:test'
import { createNegotiationTask, getNegotiationDecision } from '../src/actions/approval'

const getOrSetTokenOrClaim = async ({ name, payload }: { name: string; payload: unknown }) => ({
  state: { payload: name === 'megaplanAuth' ? { accessToken: 'megaplan-token' } : payload },
})

test('create negotiation action verifies bytes, uploads them and attaches the Megaplan file', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  const originalBotId = process.env.BP_BOT_ID
  const bytes = new TextEncoder().encode('claim-v1')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  let attachedFileId = ''

  process.env.BP_API_URL = 'https://runtime.local'
  process.env.BP_TOKEN = 'bp-token'
  process.env.BP_BOT_ID = 'bot-1'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.href === 'https://runtime.local/v1/files/download?key=claim-v1') {
      expect(request.headers.get('authorization')).toBe('Bearer bp-token')
      expect(request.headers.get('x-bot-id')).toBe('bot-1')
      return new Response(bytes, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } })
    }
    expect(request.headers.get('authorization')).toBe('Bearer megaplan-token')
    if (parsed.pathname === '/api/file') {
      const form = await request.formData()
      expect(await (form.get('files[]') as File).text()).toBe('claim-v1')
      return Response.json({ meta: { status: 200, errors: [] }, data: [{ contentType: 'File', id: 'F1' }] })
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'GET') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [] })
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'POST') {
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
    getOrSetState: getOrSetTokenOrClaim,
    setState: async () => ({}),
    getFile: async ({ id }: { id: string }) => {
      expect(id).toBe('BF-source-1')
      return { file: { id, url: 'https://runtime.local/v1/files/download?key=claim-v1' } }
    },
  }
  try {
    const output = await createNegotiationTask({
      ctx: {
        integrationId: 'integration-1',
        configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
      },
      input: {
        name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
        materialName: 'claim.docx', materialFileId: 'BF-source-1', materialSha256: sha256,
      },
      client,
    } as any)
    expect(output).toEqual({ taskId: 'T1', itemId: 'N1', versionId: 'V1' })
    expect(attachedFileId).toBe('F1')
  } finally {
    globalThis.fetch = originalFetch
    process.env.BP_API_URL = originalApiUrl
    process.env.BP_TOKEN = originalToken
    process.env.BP_BOT_ID = originalBotId
  }
})

test('concurrent deliveries atomically claim an approval operation before Megaplan task creation', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  const originalBotId = process.env.BP_BOT_ID
  const bytes = new TextEncoder().encode('claim-v1')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  let taskSearches = 0
  let taskCreates = 0
  let createdTask = false
  let releaseInitialSearches!: () => void
  const initialSearchesReady = new Promise<void>((resolve) => { releaseInitialSearches = resolve })

  process.env.BP_API_URL = 'https://runtime.local'
  process.env.BP_TOKEN = 'bp-token'
  process.env.BP_BOT_ID = 'bot-1'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.pathname === '/api/v3/task' && request.method === 'GET') {
      taskSearches++
      if (taskSearches <= 2) {
        if (taskSearches === 2) releaseInitialSearches()
        await initialSearchesReady
        return Response.json({ meta: { status: 200, errors: [] }, data: [] })
      }
      const query = JSON.parse(decodeURIComponent(parsed.search.slice(1))) as { q: string }
      return Response.json({
        meta: { status: 200, errors: [] },
        data: createdTask
          ? [{ contentType: 'Task', id: 'T1', name: `Approval [${query.q}]`, isNegotiation: true }]
          : [],
      })
    }
    if (parsed.pathname === '/v1/files/download') return new Response(bytes)
    if (parsed.pathname === '/api/file') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [{ contentType: 'File', id: 'F1' }] })
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'POST') {
      taskCreates++
      createdTask = true
      return Response.json({
        meta: { status: 200, errors: [] },
        data: { contentType: 'Task', id: 'T1', negotiationItems: [{ id: 'N1', actualVersion: { id: 'V1' } }] },
      })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  let operationClaim: unknown
  const claimStateIds: string[] = []
  const completionExpiries: number[] = []
  const client = {
    getOrSetState: async ({ id, name, payload }: { id: string; name: string; payload: unknown }) => {
      if (name === 'megaplanAuth') return { state: { payload: { accessToken: 'megaplan-token' } } }
      claimStateIds.push(id)
      operationClaim ??= payload
      return { state: { payload: operationClaim } }
    },
    getState: async () => ({ state: { payload: operationClaim } }),
    setState: async ({ name, expiry }: { name: string; expiry?: number }) => {
      if (name === 'approvalOperation' && expiry !== undefined) completionExpiries.push(expiry)
      return {}
    },
    getFile: async () => ({
      file: { id: 'BF-source-1', url: 'https://runtime.local/v1/files/download?key=claim-v1' },
    }),
  }
  const invoke = () => createNegotiationTask({
    ctx: {
      integrationId: 'integration-1',
      configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
    },
    input: {
      name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
      materialName: 'claim.docx', materialFileId: 'BF-source-1', materialSha256: sha256,
    },
    client,
  } as any)

  try {
    const results = await Promise.allSettled([invoke(), invoke()])
    expect(taskCreates).toBe(1)
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(new Set(claimStateIds)).toEqual(new Set(['integration-1']))
    expect(completionExpiries).toEqual([1])
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiUrl === undefined) delete process.env.BP_API_URL
    else process.env.BP_API_URL = originalApiUrl
    if (originalToken === undefined) delete process.env.BP_TOKEN
    else process.env.BP_TOKEN = originalToken
    if (originalBotId === undefined) delete process.env.BP_BOT_ID
    else process.env.BP_BOT_ID = originalBotId
  }
})

test('an ambiguous Megaplan task creation failure keeps the approval claim until its lease expires', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  const originalBotId = process.env.BP_BOT_ID
  const bytes = new TextEncoder().encode('claim-v1')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const releaseExpiries: number[] = []

  process.env.BP_API_URL = 'https://runtime.local'
  process.env.BP_TOKEN = 'bp-token'
  process.env.BP_BOT_ID = 'bot-1'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.pathname === '/api/v3/task' && request.method === 'GET') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [] })
    }
    if (parsed.pathname === '/v1/files/download') return new Response(bytes)
    if (parsed.pathname === '/api/file') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [{ contentType: 'File', id: 'F1' }] })
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'POST') {
      return new Response('upstream response lost', { status: 502 })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  try {
    await expect(createNegotiationTask({
      ctx: {
        integrationId: 'integration-1',
        configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
      },
      input: {
        name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
        materialName: 'claim.docx', materialFileId: 'BF-source-1', materialSha256: sha256,
      },
      client: {
        getOrSetState: getOrSetTokenOrClaim,
        setState: async ({ name, expiry }: { name: string; expiry?: number }) => {
          if (name === 'approvalOperation' && expiry !== undefined) releaseExpiries.push(expiry)
          return {}
        },
        getFile: async () => ({
          file: { id: 'BF-source-1', url: 'https://runtime.local/v1/files/download?key=claim-v1' },
        }),
      },
    } as any)).rejects.toThrow(/HTTP 502/i)
    expect(releaseExpiries).toEqual([])
  } finally {
    globalThis.fetch = originalFetch
    if (originalApiUrl === undefined) delete process.env.BP_API_URL
    else process.env.BP_API_URL = originalApiUrl
    if (originalToken === undefined) delete process.env.BP_TOKEN
    else process.env.BP_TOKEN = originalToken
    if (originalBotId === undefined) delete process.env.BP_BOT_ID
    else process.env.BP_BOT_ID = originalBotId
  }
})

test('create negotiation action accepts the canonical legacy materialUrl on a Botruntime origin', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  const originalBotId = process.env.BP_BOT_ID
  const bytes = new TextEncoder().encode('legacy-claim')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')

  process.env.BP_API_URL = 'https://runtime.local'
  process.env.BP_TOKEN = 'bp-token'
  process.env.BP_BOT_ID = 'bot-1'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.pathname === '/v1/files/download') {
      expect(request.headers.get('authorization')).toBe('Bearer bp-token')
      expect(request.headers.get('x-bot-id')).toBe('bot-1')
      return new Response(bytes, { headers: { 'content-type': 'application/octet-stream' } })
    }
    if (parsed.pathname === '/api/file') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [{ contentType: 'File', id: 'F1' }] })
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'GET') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [] })
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'POST') {
      return Response.json({
        meta: { status: 200, errors: [] },
        data: { contentType: 'Task', id: 'T1', negotiationItems: [{ id: 'N1', actualVersion: { id: 'V1' } }] },
      })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  try {
    const output = await createNegotiationTask({
      ctx: {
        integrationId: 'integration-1',
        configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
      },
      input: {
        name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
        materialName: 'claim.docx', materialUrl: 'https://runtime.local/v1/files/download?key=claim-v1', materialSha256: sha256,
      },
      client: {
        getOrSetState: getOrSetTokenOrClaim,
        setState: async () => ({}),
      },
    } as any)
    expect(output).toEqual({ taskId: 'T1', itemId: 'N1', versionId: 'V1' })
  } finally {
    globalThis.fetch = originalFetch
    process.env.BP_API_URL = originalApiUrl
    process.env.BP_TOKEN = originalToken
    process.env.BP_BOT_ID = originalBotId
  }
})

test('create negotiation action reuses a task found by its deterministic operation marker', async () => {
  const originalFetch = globalThis.fetch
  const bytes = new TextEncoder().encode('claim-v1')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  let creates = 0

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.href === 'https://storage.example/material') {
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.headers.get('x-bot-id')).toBeNull()
      return new Response(bytes)
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'GET') {
      const query = JSON.parse(decodeURIComponent(parsed.search.slice(1))) as { q: string }
      expect(query.q).toMatch(/^BF-[a-f0-9]{20}$/)
      return Response.json({
        meta: { status: 200, errors: [] },
        data: [{ contentType: 'Task', id: 'T-existing', name: `Согласовать претензию [${query.q}]`, isNegotiation: true }],
      })
    }
    if (parsed.pathname === '/api/v3/task' && request.method === 'POST') creates++
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  try {
    const output = await createNegotiationTask({
      ctx: {
        integrationId: 'integration-1',
        configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
      },
      input: {
        name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
        materialName: 'claim.docx', materialFileId: 'BF-source-1', materialSha256: sha256,
      },
      client: {
        getOrSetState: getOrSetTokenOrClaim,
        setState: async () => ({}),
        getFile: async () => { throw new Error('source file expired') },
      },
    } as any)
    expect(output).toEqual({ taskId: 'T-existing', itemId: undefined, versionId: undefined })
    expect(creates).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('approval recovery marker distinguishes changed task statements', async () => {
  const originalFetch = globalThis.fetch
  const bytes = new TextEncoder().encode('claim-v1')
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const markers: string[] = []

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.href === 'https://storage.example/material') return new Response(bytes)
    if (parsed.pathname === '/api/v3/task' && request.method === 'GET') {
      const query = JSON.parse(decodeURIComponent(parsed.search.slice(1))) as { q: string }
      markers.push(query.q)
      return Response.json({
        meta: { status: 200, errors: [] },
        data: [{ contentType: 'Task', id: `T-${markers.length}`, name: `Approval [${query.q}]`, isNegotiation: true }],
      })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  const invoke = (statement: string) => createNegotiationTask({
    ctx: {
      integrationId: 'integration-1',
      configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
    },
    input: {
      name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
      materialName: 'claim.docx', materialFileId: 'BF-source-1', materialSha256: sha256, statement,
    },
    client: {
      getOrSetState: getOrSetTokenOrClaim,
      setState: async () => ({}),
      getFile: async () => ({ file: { id: 'BF-source-1', url: 'https://storage.example/material' } }),
    },
  } as any)

  try {
    await invoke('Проверить сумму и срок')
    await invoke('Проверить только сумму')
    expect(markers).toHaveLength(2)
    expect(markers[0]).not.toBe(markers[1])
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('create negotiation action rejects unsafe URLs returned for a Botruntime file before source access', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalPublicBase = process.env.CLOUDAPI_PUBLIC_BASE_URL
  let calls = 0

  process.env.BP_API_URL = 'https://runtime.local'
  delete process.env.CLOUDAPI_PUBLIC_BASE_URL
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (new URL(request.url).pathname === '/api/v3/task' && request.method === 'GET') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [] })
    }
    calls++
    return new Response('must not be called')
  }) as typeof fetch
  const releaseExpiries: number[] = []
  let activeClaim: unknown
  let claimReads = 0

  try {
    await expect(createNegotiationTask({
      ctx: {
        integrationId: 'integration-1',
        configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
      },
      input: {
        name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
        materialName: 'claim.docx', materialFileId: 'BF-source-1', materialSha256: 'a'.repeat(64),
      },
      client: {
        getOrSetState: async ({ name, payload }: { name: string; payload: unknown }) => {
          if (name === 'megaplanAuth') return { state: { payload: { accessToken: 'megaplan-token' } } }
          activeClaim = payload
          return { state: { payload } }
        },
        getState: async () => {
          claimReads++
          return { state: { payload: activeClaim } }
        },
        setState: async ({ name, expiry }: { name: string; expiry?: number }) => {
          if (name === 'approvalOperation' && expiry !== undefined) releaseExpiries.push(expiry)
          return {}
        },
        getFile: async () => ({ file: { id: 'BF-source-1', url: 'file:///etc/passwd' } }),
      },
    } as any)).rejects.toThrow(/safe HTTP URL/i)
    expect(calls).toBe(0)
    expect(claimReads).toBe(1)
    expect(releaseExpiries).toEqual([1])
  } finally {
    globalThis.fetch = originalFetch
    process.env.BP_API_URL = originalApiUrl
    process.env.CLOUDAPI_PUBLIC_BASE_URL = originalPublicBase
  }
})

test('create negotiation action rejects oversized Botruntime materials before buffering them', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    if (new URL(request.url).pathname === '/api/v3/task' && request.method === 'GET') {
      return Response.json({ meta: { status: 200, errors: [] }, data: [] })
    }
    return new Response('x', { headers: { 'content-length': String((20 << 20) + 1) } })
  }) as typeof fetch

  try {
    await expect(createNegotiationTask({
      ctx: {
        integrationId: 'integration-1',
        configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' },
      },
      input: {
        name: 'Согласовать претензию', responsibleId: 'E1', approverIds: ['E2'], dealIds: ['D1'],
        materialName: 'claim.docx', materialFileId: 'BF-source-1', materialSha256: 'a'.repeat(64),
      },
      client: {
        getOrSetState: getOrSetTokenOrClaim,
        setState: async () => ({}),
        getFile: async () => ({ file: { id: 'BF-source-1', url: 'https://storage.example/material' } }),
      },
    } as any)).rejects.toThrow(/exceeds.*20 MiB/i)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('approved document is copied without leaking credentials and returns a stable file reference', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  const originalBotId = process.env.BP_BOT_ID
  const approvedBytes = new TextEncoder().encode('approved-v2')

  process.env.BP_API_URL = 'https://runtime.local'
  process.env.BP_TOKEN = 'bp-token'
  process.env.BP_BOT_ID = 'bot-1'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.pathname === '/api/v3/task/T1/negotiationItems') {
      return Response.json({
        meta: { status: 200, errors: [] },
        data: [{
          id: 'N1',
          actualVersion: {
            id: 'V2', status: 'ok', attache: { id: 'MF1', path: '/api/file/approved', name: 'approved.docx' },
            visas: [
              { id: 'Z1', status: 'ok', comment: { id: 'C1', content: 'Проверено' }, timeCreated: '2026-07-14T09:10:11+03:00', userCreated: { id: 'E2', name: 'Юрист 1' } },
              { id: 'Z2', status: 'ok', comment: { id: 'C2', content: 'Согласовано' }, timeCreated: '2026-07-14T10:11:12+03:00', userCreated: { id: 'E3', name: 'Юрист 2' } },
            ],
          },
        }],
      })
    }
    if (parsed.pathname === '/api/file/approved') {
      expect(request.headers.get('authorization')).toBe('Bearer megaplan-token')
      return new Response(approvedBytes, { headers: { 'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } })
    }
    if (parsed.origin === 'https://runtime.local' && parsed.pathname === '/v1/files') {
      expect(request.headers.get('authorization')).toBe('Bearer bp-token')
      expect(request.headers.get('x-bot-id')).toBe('bot-1')
      const body = await request.json() as any
      expect(body.accessPolicies).toBeUndefined()
      return Response.json({ file: {
        id: 'BF1', key: body.key,
        uploadUrl: 'https://storage.example/presigned',
        url: 'https://storage.example/temporary-download',
      } })
    }
    if (parsed.href === 'https://storage.example/presigned') {
      expect(request.headers.get('authorization')).toBeNull()
      expect(request.headers.get('x-bot-id')).toBeNull()
      expect(request.headers.get('content-type')).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      expect(Array.from(new Uint8Array(await request.arrayBuffer()))).toEqual(Array.from(approvedBytes))
      return new Response(null, { status: 200 })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  const client = {
    getOrSetState: async () => ({ state: { payload: { accessToken: 'megaplan-token' } } }),
    setState: async () => ({}),
  }
  try {
    const output = await getNegotiationDecision({
      ctx: { integrationId: 'integration-1', configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' } },
      input: { taskId: 'T1' }, client,
    } as any)
    expect(output).toMatchObject({
      status: 'approved',
      fileUrl: 'https://runtime.local/v1/files/download?key=megaplan%2Fapprovals%2FT1%2FV2%2Fapproved.docx',
      approvedFileId: 'BF1',
      approvedFileKey: 'megaplan/approvals/T1/V2/approved.docx',
      approverVisas: [
        { id: 'Z1', status: 'ok', actorId: 'E2', actorName: 'Юрист 1', comment: 'Проверено', timeCreated: '2026-07-14T09:10:11+03:00' },
        { id: 'Z2', status: 'ok', actorId: 'E3', actorName: 'Юрист 2', comment: 'Согласовано', timeCreated: '2026-07-14T10:11:12+03:00' },
      ],
      actorId: 'E3',
      actorName: 'Юрист 2',
    })
    expect(output.fileSha256).toMatch(/^[a-f0-9]{64}$/)
  } finally {
    globalThis.fetch = originalFetch
    process.env.BP_API_URL = originalApiUrl
    process.env.BP_TOKEN = originalToken
    process.env.BP_BOT_ID = originalBotId
  }
})

test('approved document authenticates a same-origin Botruntime upload URL', async () => {
  const originalFetch = globalThis.fetch
  const originalApiUrl = process.env.BP_API_URL
  const originalToken = process.env.BP_TOKEN
  const originalBotId = process.env.BP_BOT_ID

  process.env.BP_API_URL = 'https://runtime.local'
  process.env.BP_TOKEN = 'bp-token'
  process.env.BP_BOT_ID = 'bot-1'
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.pathname === '/api/v3/task/T1/negotiationItems') {
      return Response.json({
        meta: { status: 200, errors: [] },
        data: [{
          id: 'N1',
          actualVersion: {
            id: 'V2', status: 'ok', attache: { id: 'MF1', path: '/api/file/approved', name: 'approved.docx' },
            visas: [{ id: 'Z1', status: 'ok', userCreated: { id: 'E2', name: 'Юрист' } }],
          },
        }],
      })
    }
    if (parsed.pathname === '/api/file/approved') return new Response('approved-v2')
    if (parsed.pathname === '/v1/files' && parsed.search === '') {
      return Response.json({ file: {
        id: 'BF1', key: 'megaplan/approvals/T1/V2/approved.docx',
        uploadUrl: 'https://runtime.local/v1/files/upload?key=approved&token=t',
        url: 'https://runtime.local/v1/files/download?key=approved',
      } })
    }
    if (parsed.pathname === '/v1/files/upload') {
      expect(request.headers.get('authorization')).toBe('Bearer bp-token')
      expect(request.headers.get('x-bot-id')).toBe('bot-1')
      return new Response(null, { status: 200 })
    }
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch

  try {
    const output = await getNegotiationDecision({
      ctx: { integrationId: 'integration-1', configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' } },
      input: { taskId: 'T1' },
      client: {
        getOrSetState: async () => ({ state: { payload: { accessToken: 'megaplan-token' } } }),
        setState: async () => ({}),
      },
    } as any)
    expect(output.approvedFileId).toBe('BF1')
  } finally {
    globalThis.fetch = originalFetch
    process.env.BP_API_URL = originalApiUrl
    process.env.BP_TOKEN = originalToken
    process.env.BP_BOT_ID = originalBotId
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

test('approved document with an empty attachment fails before file-store publication', async () => {
  const originalFetch = globalThis.fetch
  let fileStoreWrites = 0
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const request = url instanceof Request ? new Request(url, init) : new Request(String(url), init)
    const parsed = new URL(request.url)
    if (parsed.pathname === '/api/v3/task/T1/negotiationItems') {
      return Response.json({
        meta: { status: 200, errors: [] },
        data: [{
          id: 'N1',
          actualVersion: {
            id: 'V2', status: 'ok', attache: { id: 'MF1', path: '/api/file/empty', name: 'empty.docx' },
            visas: [{ status: 'ok', userCreated: { id: 'E2' } }],
          },
        }],
      })
    }
    if (parsed.pathname === '/api/file/empty') return new Response(new Uint8Array())
    if (parsed.pathname === '/v1/files') fileStoreWrites++
    return new Response('unexpected', { status: 500 })
  }) as typeof fetch
  try {
    await expect(getNegotiationDecision({
      ctx: { integrationId: 'integration-1', configuration: { baseUrl: 'https://account.megaplan.ru', username: 'u', password: 'p' } },
      input: { taskId: 'T1' },
      client: {
        getOrSetState: async () => ({ state: { payload: { accessToken: 'megaplan-token' } } }),
        setState: async () => ({}),
      },
    } as any)).rejects.toThrow(/empty approved/i)
    expect(fileStoreWrites).toBe(0)
  } finally {
    globalThis.fetch = originalFetch
  }
})
