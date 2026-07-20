import { describe, expect, it, vi } from 'vitest'
import * as errors from './errors'
import { DevCommand } from './command-implementations/dev-command'
import { buildDevWorkerEnvironment, fetchDevConfigVars } from './dev-worker-env'

describe('dev worker environment', () => {
  it('emits both BP and ADK coordinates only from a complete exact dev target', () => {
    const env = buildDevWorkerEnvironment({
      inherited: { PATH: '/bin', ADK_SPAN_INGEST_URL: undefined },
      apiUrl: 'https://api.example/',
      token: 'pat-secret',
      workspaceId: '9001',
      target: { runtimeBotId: 'dev_runtime:abc', targetBotId: '42' },
      spanIngestUrl: 'http://127.0.0.1:38123',
    })

    expect(env).toEqual({
      PATH: '/bin',
      NODE_ENV: 'development',
      ADK_RUNTIME_MODE: 'development',
      BP_API_URL: 'https://api.example',
      ADK_API_URL: 'https://api.example',
      BP_TOKEN: 'pat-secret',
      ADK_TOKEN: 'pat-secret',
      BP_BOT_ID: 'dev_runtime:abc',
      ADK_BOT_ID: 'dev_runtime:abc',
      BP_TARGET_BOT_ID: '42',
      ADK_TARGET_BOT_ID: '42',
      BP_WORKSPACE_ID: '9001',
      ADK_WORKSPACE_ID: '9001',
      ADK_SPAN_INGEST_URL: 'http://127.0.0.1:38123',
    })
  })

  it('injects config vars under both the bare name and a SECRET_-prefixed alias', () => {
    const env = buildDevWorkerEnvironment({
      inherited: {},
      apiUrl: 'https://api.example',
      token: 'pat-secret',
      workspaceId: '9001',
      target: { runtimeBotId: 'dev_runtime:abc', targetBotId: '42' },
      configVars: { API_KEY: 'sk-secret', ADK_CONFIGURATION: 'must-be-dropped' },
    })

    expect(env['API_KEY']).toBe('sk-secret')
    expect(env['SECRET_API_KEY']).toBe('sk-secret')
    expect(env['ADK_CONFIGURATION']).toBeUndefined()
    expect(env['SECRET_ADK_CONFIGURATION']).toBeUndefined()
  })

  it('lets an explicit local secret (inherited) win over a same-named cloud config var (Codex P2, DEVLP-124)', () => {
    // `inherited` is DevCommand#run's already-built env — it carries whatever the caller
    // resolved as an explicit local secret (--secrets K=v or the interactive prompt). A
    // developer's explicit local override must win over a stale/different cloud value for
    // the same key; the bare (non-prefixed) name has no local override here, so it still
    // comes from the cloud config var.
    const env = buildDevWorkerEnvironment({
      inherited: { SECRET_API_KEY: 'sk-explicit-local' },
      apiUrl: 'https://api.example',
      token: 'pat-secret',
      workspaceId: '9001',
      target: { runtimeBotId: 'dev_runtime:abc', targetBotId: '42' },
      configVars: { API_KEY: 'sk-cloud-stale' },
    })

    expect(env['SECRET_API_KEY']).toBe('sk-explicit-local')
    expect(env['API_KEY']).toBe('sk-cloud-stale')
  })

  it('never lets a config var shadow the runtime identity coordinates', () => {
    const env = buildDevWorkerEnvironment({
      inherited: {},
      apiUrl: 'https://api.example',
      token: 'pat-secret',
      workspaceId: '9001',
      target: { runtimeBotId: 'dev_runtime:abc', targetBotId: '42' },
      configVars: { BP_TOKEN: 'attacker-value', BP_BOT_ID: 'attacker-value' },
    })

    expect(env['BP_TOKEN']).toBe('pat-secret')
    expect(env['BP_BOT_ID']).toBe('dev_runtime:abc')
  })

  it('fails closed for incomplete, numeric-runtime, or non-numeric target coordinates', () => {
    const base = {
      inherited: {},
      apiUrl: 'https://api.example',
      token: 'pat-secret',
      workspaceId: '9001',
      target: { runtimeBotId: 'dev_runtime', targetBotId: '42' },
    }
    expect(() => buildDevWorkerEnvironment({ ...base, token: '' })).toThrow(/token/i)
    expect(() =>
      buildDevWorkerEnvironment({ ...base, target: { runtimeBotId: '42', targetBotId: '42' } })
    ).toThrow(/opaque runtime/i)
    expect(() =>
      buildDevWorkerEnvironment({ ...base, target: { runtimeBotId: 'dev_runtime', targetBotId: 'bot_42' } })
    ).toThrow(/target bot/i)
    expect(() => buildDevWorkerEnvironment({ ...base, workspaceId: 'ws_9001' })).toThrow(/workspace/i)
  })

  it('does not spawn the worker until target resolution completes and passes only the attested identities', async () => {
    let resolveTarget!: (value: unknown) => void
    const targetPending = new Promise((resolve) => {
      resolveTarget = resolve
    })
    const ensureTarget = vi.fn().mockReturnValue(targetPending)
    const spawnWorker = vi.fn().mockResolvedValue({ running: true })
    const fetchConfigVars = vi.fn().mockResolvedValue({})
    const command = Object.create(DevCommand.prototype) as any
    command._initialDef = { type: 'bot' }
    command._ensureDevBotTarget = ensureTarget
    command._spawnWorker = spawnWorker
    command._fetchDevConfigVars = fetchConfigVars
    const api = {
      url: 'https://api.example/',
      token: 'pat-secret',
      workspaceId: '9001',
    }

    const started = command._spawnWorkerForResolvedDevTarget(
      api,
      'https://tunnel.example/dev_runtime',
      { PATH: '/bin' },
      8075,
      'http://127.0.0.1:38123'
    )
    await Promise.resolve()
    expect(ensureTarget).toHaveBeenCalledOnce()
    expect(spawnWorker).not.toHaveBeenCalled()

    resolveTarget({
      bot: { id: 'dev_runtime' },
      target: { runtimeBotId: 'dev_runtime', targetBotId: '42' },
    })
    await started

    expect(ensureTarget.mock.invocationCallOrder[0]).toBeLessThan(spawnWorker.mock.invocationCallOrder[0]!)
    expect(fetchConfigVars).toHaveBeenCalledWith(api, 'dev_runtime')
    expect(fetchConfigVars.mock.invocationCallOrder[0]).toBeLessThan(spawnWorker.mock.invocationCallOrder[0]!)
    expect(spawnWorker).toHaveBeenCalledWith(
      expect.objectContaining({
        NODE_ENV: 'development',
        ADK_RUNTIME_MODE: 'development',
        BP_BOT_ID: 'dev_runtime',
        ADK_BOT_ID: 'dev_runtime',
        BP_TARGET_BOT_ID: '42',
        ADK_TARGET_BOT_ID: '42',
        BP_WORKSPACE_ID: '9001',
        ADK_WORKSPACE_ID: '9001',
      }),
      8075
    )
    expect(spawnWorker.mock.calls[0]![0]).toHaveProperty('ADK_SPAN_INGEST_URL', 'http://127.0.0.1:38123')
  })
})

describe('fetchDevConfigVars', () => {
  it('returns the decrypted config values on success', async () => {
    const getDevConfigVariableValues = vi.fn().mockResolvedValue({ config: { API_KEY: 'sk-secret' } })
    const result = await fetchDevConfigVars({
      client: { getDevConfigVariableValues } as any,
      runtimeBotId: 'dev_runtime:abc',
      workspaceId: '9001',
    })

    expect(result).toEqual({ API_KEY: 'sk-secret' })
    expect(getDevConfigVariableValues).toHaveBeenCalledWith('dev_runtime:abc', '9001')
  })

  it('treats a 404 as legitimately empty, not an error', async () => {
    const getDevConfigVariableValues = vi.fn().mockRejectedValue(new errors.HTTPError(404, 'not found'))
    const result = await fetchDevConfigVars({
      client: { getDevConfigVariableValues } as any,
      runtimeBotId: 'dev_runtime:abc',
      workspaceId: '9001',
    })

    expect(result).toEqual({})
  })

  it('fails loud on anything else (never spawns a bot silently missing its secrets)', async () => {
    const getDevConfigVariableValues = vi.fn().mockRejectedValue(new errors.HTTPError(403, 'forbidden'))
    await expect(
      fetchDevConfigVars({
        client: { getDevConfigVariableValues } as any,
        runtimeBotId: 'dev_runtime:abc',
        workspaceId: '9001',
      })
    ).rejects.toThrow(/dev_runtime:abc/)
  })
})
