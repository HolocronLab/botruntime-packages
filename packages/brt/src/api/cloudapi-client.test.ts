import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as errors from '../errors'
import { CloudapiClient } from './cloudapi-client'

type FetchCall = { url: string; init: RequestInit }

describe('CloudapiClient', () => {
  it('derives a bot-scoped SDK client without exposing the selected credential', () => {
    const sdk = new CloudapiClient('https://api.example', 'private-token').sdkClient('42', '2')

    expect(sdk.config.apiUrl).toBe('https://api.example')
    expect(sdk.config.headers).toMatchObject({
      Authorization: 'Bearer private-token',
      'x-bot-id': '42',
      'x-workspace-id': '2',
    })
  })
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

  it('checks hosted eval tunnel readiness with the opaque runtime bot id', async () => {
    stubFetch(() => new Response(JSON.stringify({ ready: true }), { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    await client.requireEvalBotReady('runtime-bot-id')

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe('https://cloud.example/v1/evals/bot/runtime-bot-id/ready')
    expect(calls[0]!.init.method).toBe('GET')
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: 'Bearer my-key',
      'x-bot-id': 'runtime-bot-id',
    })
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
      attempt < 3
        ? new Response('boom', { status: 503 })
        : new Response(JSON.stringify({ variables: [] }), { status: 200 })
    )
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    const res = await client.listConfigVars('42')

    expect(res).toEqual({ variables: [] })
    expect(calls).toHaveLength(3)
  })

  it('classifies exhausted idempotent 5xx as transient for bounded outer polling', async () => {
    stubFetch(() => new Response('boom', { status: 503 }))
    const client = new CloudapiClient('https://cloud.example', 'my-key')

    const error = await client.listConfigVars('42').catch((thrown) => thrown)
    expect(error).toBeInstanceOf(errors.TransientRequestError)
    expect(error).toMatchObject({ status: 503 })
    expect(calls).toHaveLength(3)
  })

  it('bounds all idempotent retry attempts by the caller observation deadline', async () => {
    vi.useFakeTimers()
    try {
      stubFetch((call) =>
        new Promise<Response>((_resolve, reject) => {
          call.init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        })
      )
      const client = new CloudapiClient('https://cloud.example', 'my-key')

      const pending = client.getEvalWorkflow('workflow_1', undefined, Date.now() + 1_000).catch((thrown) => thrown)
      await vi.advanceTimersByTimeAsync(1_000)
      await vi.runAllTimersAsync()

      expect(await pending).toBeInstanceOf(errors.TransientRequestError)
      expect(calls).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
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

    await client.putBundle('3', 'lawyer-bot', 'export default {}', [], 'ws_123', {
      dailyschedule: {
        type: 'workflowSchedule',
        schedule: { cron: '0 9 * * *' },
        payload: { workflow: 'daily' },
      },
    }, 300)

    const [call] = calls
    expect(call!.url).toBe('https://cloud.example/v1/admin/bots/3')
    expect(call!.init.method).toBe('PUT')
    const headers = call!.init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer brt_pat_xxx')
    expect(headers['x-workspace-id']).toBe('ws_123')
    expect(headers['x-bot-id']).toBe('3')
    expect(JSON.parse(String(call!.init.body))).toMatchObject({
      maxExecutionTime: 300,
      recurringEvents: {
        dailyschedule: { type: 'workflowSchedule', schedule: { cron: '0 9 * * *' } },
      },
    })
  })

  it('putBundle omits x-workspace-id when none is passed (legacy bot-key deploy)', async () => {
    stubFetch(() => new Response('{}', { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'bot-key')

    await client.putBundle('3', 'lawyer-bot', 'export default {}')

    const headers = calls[0]!.init.headers as Record<string, string>
    expect(headers['x-workspace-id']).toBeUndefined()
    expect(headers['x-bot-id']).toBe('3')
  })

  it('getDevBotTarget resolves the opaque dev id under the exact PAT workspace without x-bot-id', async () => {
    stubFetch(
      () =>
        new Response(
          JSON.stringify({
            bot: {
              id: 'tunnel-opaque',
              dev: true,
              tags: { 'botruntime.devTargetBotId': '42' },
            },
          }),
          { status: 200 }
        )
    )
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    const response = await client.getDevBotTarget('tunnel-opaque', 'ws_123')

		expect(response.bot.tags!['botruntime.devTargetBotId']).toBe('42')
    const [call] = calls
    expect(call!.url).toBe('https://cloud.example/v1/admin/bots/tunnel-opaque')
    expect(call!.init.method).toBe('GET')
    const headers = call!.init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer brt_pat_xxx')
    expect(headers['x-workspace-id']).toBe('ws_123')
    expect(headers['x-bot-id']).toBeUndefined()
  })

  it('getDevBotTarget performs exactly one HTTP GET even when readiness is unavailable', async () => {
    stubFetch(() => new Response('unavailable', { status: 503 }))
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    await expect(client.getDevBotTarget('tunnel-opaque', 'ws_123')).rejects.toThrow(errors.HTTPError)

    expect(calls).toHaveLength(1)
    expect(calls[0]!.init.method).toBe('GET')
  })

  it('getDevConfigVariableValues sends workspace-PAT + x-workspace-id at the dev id path', async () => {
    stubFetch(() => new Response(JSON.stringify({ config: { API_KEY: 'sk-secret' } }), { status: 200 }))
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    const response = await client.getDevConfigVariableValues('tunnel-opaque', 'ws_123')

    expect(response.config).toEqual({ API_KEY: 'sk-secret' })
    const [call] = calls
    expect(call!.url).toBe('https://cloud.example/v1/admin/bots/tunnel-opaque/config-variables/values')
    expect(call!.init.method).toBe('GET')
    const headers = call!.init.headers as Record<string, string>
    expect(headers['authorization']).toBe('Bearer brt_pat_xxx')
    expect(headers['x-workspace-id']).toBe('ws_123')
    expect(headers['x-bot-id']).toBeUndefined()
  })

  it('getDevConfigVariableValues surfaces a non-404 failure as an HTTPError (fail-loud)', async () => {
    stubFetch(() => new Response('forbidden', { status: 403 }))
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    await expect(client.getDevConfigVariableValues('tunnel-opaque', 'ws_123')).rejects.toThrow(errors.HTTPError)
  })

  it('workspace config methods use the nested human route and never x-bot-id', async () => {
    stubFetch((call) => {
      if (call.init.method === 'GET') return new Response(JSON.stringify({ variables: [] }), { status: 200 })
      return new Response('{}', { status: 200 })
    })
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    await client.setWorkspaceConfigVar('ws_123', '42', 'FOO', 'bar')
    await client.listWorkspaceConfigVars('ws_123', '42')
    await client.deleteWorkspaceConfigVar('ws_123', '42', 'FOO')

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['PUT', 'https://cloud.example/v1/admin/workspaces/ws_123/bots/42/config-variables/FOO'],
      ['GET', 'https://cloud.example/v1/admin/workspaces/ws_123/bots/42/config-variables'],
      ['DELETE', 'https://cloud.example/v1/admin/workspaces/ws_123/bots/42/config-variables/FOO'],
    ])
    for (const call of calls) {
      const headers = call.init.headers as Record<string, string>
      expect(headers['authorization']).toBe('Bearer brt_pat_xxx')
      expect(headers['x-bot-id']).toBeUndefined()
      expect(headers['x-workspace-id']).toBeUndefined()
    }
  })

  it('workspace integration install/register uses human routes and returns the register webhook secret', async () => {
    stubFetch((call) => {
      if (call.init.method === 'POST' && call.url.endsWith('/integrations')) {
        return new Response(
          JSON.stringify({
            installationId: '7',
            webhookId: 'wh_dev',
            status: 'pending',
          }),
          { status: 200 }
        )
      }
      if (call.init.method === 'DELETE') {
        return Response.json({ ok: true })
      }
      return new Response(
        JSON.stringify({
          ok: true,
          status: 'registered',
          webhookUrl: 'https://hooks/wh_dev',
          webhookSecret: 'register_secret',
        }),
        {
          status: 200,
        }
      )
    })
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    const installed = await client.installWorkspaceIntegration('ws_123', '42', 'telegram', '0.0.1', {
      botToken: 'sealed-server-side',
    })
    const registered = await client.registerWorkspaceIntegration('ws_123', '42', 'wh_dev')
    await client.uninstallWorkspaceIntegration('ws_123', '42', '7')

    expect(installed).toEqual({
      installationId: '7',
      webhookId: 'wh_dev',
      status: 'pending',
    })
    expect(installed).not.toHaveProperty('webhookSecret')
    expect(registered).toMatchObject({ ok: true, status: 'registered', webhookSecret: 'register_secret' })
    expect(calls.map((call) => call.url)).toEqual([
      'https://cloud.example/v1/admin/workspaces/ws_123/bots/42/integrations',
      'https://cloud.example/v1/admin/workspaces/ws_123/bots/42/integrations/wh_dev/register',
      'https://cloud.example/v1/admin/workspaces/ws_123/bots/42/integrations/7',
    ])
    for (const call of calls) {
      expect((call.init.headers as Record<string, string>)['x-bot-id']).toBeUndefined()
    }
  })

  it('lists workspace integration registration state for post-deploy guidance', async () => {
    stubFetch(() =>
      Response.json({
        installations: [
          {
            id: '7',
            name: 'telegram',
            version: '1.1.3',
            alias: 'telegram',
            status: 'registered',
            webhookId: 'wh_ready',
            registered: true,
          },
        ],
      })
    )
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_xxx')

    await expect(client.listWorkspaceIntegrations('ws_123', '42')).resolves.toMatchObject({
      installations: [{ webhookId: 'wh_ready', registered: true }],
    })
    expect(calls[0]?.url).toBe('https://cloud.example/v1/admin/workspaces/ws_123/bots/42/integrations')
    expect(calls[0]?.init.method).toBe('GET')
  })

  it('atomically repoints one workspace installation without sending config or credentials', async () => {
    stubFetch(() =>
      Response.json({
        ok: true,
        installationId: '7',
        integrationId: '12',
        ref: 'telegram@1.2.0',
      })
    )
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_private')

    await client.repointWorkspaceIntegration('ws_123', '42', '7', 'telegram', '1.2.0')

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', 'https://cloud.example/v1/admin/workspaces/ws_123/bots/42/integrations/7/repoint'],
    ])
    for (const call of calls) {
      expect(call.init.headers).toMatchObject({ authorization: 'Bearer brt_pat_private' })
      expect(call.init.headers).not.toHaveProperty('x-bot-id')
      expect(JSON.parse(String(call.init.body))).toEqual({ name: 'telegram', version: '1.2.0' })
      expect(String(call.init.body)).not.toMatch(/secret|token|credential/i)
    }
  })

  it('prints the Botforge repoint 409 message including the incompatible config field', async () => {
    stubFetch(() =>
      Response.json(
        {
          id: 'err_409',
          code: 409,
          type: 'ConflictError',
          message: 'integration: stored config is incompatible with target version: required field "region" is missing',
          secretValue: 'must-never-reach-the-error',
        },
        { status: 409 }
      )
    )
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_private')

    const error = (await client
      .repointWorkspaceIntegration('ws_123', '42', '7', 'telegram', '1.2.0')
      .catch((thrown) => thrown as Error)) as Error

    expect(error).toBeInstanceOf(errors.HTTPError)
    expect(error.message).toMatch(/409.*required field "region" is missing/i)
    expect(error.message).not.toContain('must-never-reach-the-error')
    expect(calls).toHaveLength(1)
  })

  it('surfaces a target-version 404 from direct repoint without a second request', async () => {
    stubFetch(() =>
      Response.json(
        {
          message: 'target integration version not found',
          secretValue: 'must-not-leak',
        },
        { status: 404 }
      )
    )
    const client = new CloudapiClient('https://cloud.example', 'brt_pat_private')

    await expect(
      client.repointWorkspaceIntegration('ws_123', '42', '7', 'telegram', '9.9.9')
    ).rejects.toThrow(/404.*target integration version not found/i)
    expect(calls).toHaveLength(1)
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
