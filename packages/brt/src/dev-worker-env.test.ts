import { describe, expect, it, vi } from 'vitest'
import { DevCommand } from './command-implementations/dev-command'
import { buildDevWorkerEnvironment } from './dev-worker-env'

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
    const command = Object.create(DevCommand.prototype) as any
    command._initialDef = { type: 'bot' }
    command._ensureDevBotTarget = ensureTarget
    command._spawnWorker = spawnWorker
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
