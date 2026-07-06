import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as errors from '../errors'
import { CloudapiClient } from './cloudapi-client'

type FetchCall = { url: string; init: RequestInit }

describe('CloudapiClient', () => {
  const originalFetch = global.fetch
  let calls: FetchCall[]

  beforeEach(() => {
    calls = []
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  const stubFetch = (impl: (call: FetchCall, attempt: number) => Response | Promise<Response>) => {
    let attempt = 0
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      attempt++
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      return impl(call, attempt)
    }) as unknown as typeof fetch
  }

  it('sends Bearer auth, x-bot-id, and content-type only when a body is present', async () => {
    stubFetch(() => new Response(JSON.stringify({ variables: [] }), { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    await client.listConfigVars('42')

    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call!.url).toBe('https://cloud.example/v1/admin/config-variables')
    expect(call!.init.method).toBe('GET')
    const headers = call!.init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer my-key')
    expect(headers['x-bot-id']).toBe('42')
    expect(headers['content-type']).toBeUndefined()
  })

  it('sends content-type and a JSON body for PUT-with-body calls', async () => {
    stubFetch(() => new Response('{}', { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    await client.setConfigVar('42', 'FOO', 'bar')

    const [call] = calls
    expect(call!.init.method).toBe('PUT')
    expect((call!.init.headers as Record<string, string>)['content-type']).toBe('application/json')
    expect(call!.init.body).toBe(JSON.stringify({ value: 'bar' }))
  })

  it('never retries a 4xx, even on an idempotent call', async () => {
    stubFetch(() => new Response('nope', { status: 404 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    await expect(client.listConfigVars('42')).rejects.toThrow(errors.HTTPError)
    expect(calls).toHaveLength(1)
  })

  it('retries an idempotent call on 5xx up to 3 attempts, then succeeds', async () => {
    stubFetch((_call, attempt) =>
      attempt < 3 ? new Response('boom', { status: 503 }) : new Response(JSON.stringify({ variables: [] }), { status: 200 })
    )
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    const res = await client.listConfigVars('42')

    expect(res).toEqual({ variables: [] })
    expect(calls).toHaveLength(3)
  })

  it('does not retry a non-idempotent call on 5xx', async () => {
    stubFetch(() => new Response('boom', { status: 503 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    await expect(client.setConfigVar('42', 'FOO', 'bar')).rejects.toThrow(errors.HTTPError)
    expect(calls).toHaveLength(1)
  })

  it('maps a 401 to a helpful HTTPError message', async () => {
    stubFetch(() => new Response('unauthorized', { status: 401 }))
    const client = new CloudapiClient('https://cloud.example', 'bad-key')

    await expect(client.listConfigVars('42')).rejects.toThrow(/401.*invalid\/revoked api key/)
  })

  it('provisionBot sends x-workspace-id when a workspaceId is passed (provision-under-PAT)', async () => {
    stubFetch(() => new Response(JSON.stringify({ botId: 1, apiKey: 'k', workspaceId: 7 }), { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    await client.provisionBot('my-bot', 'ws_123')

    const [call] = calls
    expect(call!.url).toBe('https://cloud.example/v1/admin/provision-bot')
    const headers = call!.init.headers as Record<string, string>
    expect(headers['x-workspace-id']).toBe('ws_123')
    expect(call!.init.body).toBe(JSON.stringify({ name: 'my-bot' }))
  })

  it('provisionBot omits x-workspace-id when no workspaceId is passed (legacy/bot-scoped keys)', async () => {
    stubFetch(() => new Response(JSON.stringify({ botId: 1, apiKey: 'k', workspaceId: 7 }), { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    await client.provisionBot('my-bot')

    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['x-workspace-id']).toBeUndefined()
  })

  it('putBundle sends x-workspace-id + x-bot-id under a workspace PAT (Botpress-parity deploy)', async () => {
    stubFetch(() => new Response('{}', { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    await client.putBundle('3', 'lawyer-bot', 'export default {}', [], 'ws_123')

    const [call] = calls
    expect(call!.url).toBe('https://cloud.example/v1/admin/bots/3')
    expect(call!.init.method).toBe('PUT')
    const headers = call!.init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer brt_pat_xxx')
    expect(headers['x-workspace-id']).toBe('ws_123')
    expect(headers['x-bot-id']).toBe('3')
  })

  it('putBundle omits x-workspace-id when none is passed (legacy bot-key deploy)', async () => {
    stubFetch(() => new Response('{}', { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'bot-key')

    await client.putBundle('3', 'lawyer-bot', 'export default {}')

    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['x-workspace-id']).toBeUndefined()
    expect(headers['x-bot-id']).toBe('3')
  })

  it('listTables/createTable send x-workspace-id + x-bot-id under a workspace PAT', async () => {
    stubFetch(() => new Response(JSON.stringify({ tables: [] }), { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    await client.listTables('3', 'ws_123')
    await client.createTable('3', 'Users', { columns: [] }, 'ws_123')

    const list = calls[0]!.init.headers as Record<string, string>
    expect(calls[0]!.url).toBe('https://cloud.example/v1/tables')
    expect(list['x-workspace-id']).toBe('ws_123')
    expect(list['x-bot-id']).toBe('3')

    const create = calls[1]!.init.headers as Record<string, string>
    expect(calls[1]!.init.method).toBe('POST')
    expect(create['x-workspace-id']).toBe('ws_123')
    expect(create['x-bot-id']).toBe('3')
  })

  it('withKey returns a new client scoped to the given key, same base URL', async () => {
    stubFetch(() => new Response('{}', { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'machine-key')
    const scoped = client.withKey('bot-key')

    expect(scoped.base).toBe(client.base)
    await scoped.listConfigVars('42')

    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer bot-key')
  })
})
