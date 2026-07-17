import { describe, expect, it, vi } from 'vitest'
import { ensureEvalChatTransport, registerWithReadinessRetry } from './eval-chat-transport'

describe('hosted eval chat transport', () => {
  it('retries transient registration failures while the runtime supervisor loads the bundle', async () => {
    const register = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('not ready'), { status: 502 }))
      .mockRejectedValueOnce(Object.assign(new Error('starting'), { status: 503 }))
      .mockResolvedValue({ status: 'registered' })
    const sleep = vi.fn().mockResolvedValue(undefined)

    await expect(registerWithReadinessRetry(register, { sleep })).resolves.toEqual({ status: 'registered' })
    expect(register).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenNthCalledWith(1, 250)
    expect(sleep).toHaveBeenNthCalledWith(2, 500)
  })

  it('reuses an existing compatible installation', async () => {
    const client = {
      listWorkspaceIntegrations: vi.fn().mockResolvedValue({
        installations: [
          {
            name: 'botruntime/chat',
            version: '0.7.6',
            webhookId: 'wh_existing',
            enabled: true,
            status: 'registered',
            registered: true,
          },
        ],
      }),
      installWorkspaceIntegration: vi.fn(),
      registerWorkspaceIntegration: vi.fn(),
    }

    await expect(
      ensureEvalChatTransport({
        client: client as any,
        workspaceId: '2',
        botId: '23',
        development: true,
      }),
    ).resolves.toEqual({ webhookId: 'wh_existing', provisioned: false })
    expect(client.installWorkspaceIntegration).not.toHaveBeenCalled()
  })

  it('provisions and registers chat for an isolated dev target', async () => {
    const client = {
      listWorkspaceIntegrations: vi
        .fn()
        .mockResolvedValue({ installations: [] }),
      installWorkspaceIntegration: vi
        .fn()
        .mockResolvedValue({ webhookId: 'wh_new', status: 'installed' }),
      registerWorkspaceIntegration: vi
        .fn()
        .mockResolvedValue({ ok: true, status: 'registered' }),
    }

    await expect(
      ensureEvalChatTransport({
        client: client as any,
        workspaceId: '2',
        botId: '23',
        development: true,
      }),
    ).resolves.toEqual({ webhookId: 'wh_new', provisioned: true })

    const config = client.installWorkspaceIntegration.mock.calls[0]![4]
    expect(config.encryptionKey).toMatch(/^[A-Za-z0-9_-]{40,}$/)
    expect(client.installWorkspaceIntegration).toHaveBeenCalledWith(
      '2',
      '23',
      'botruntime/chat',
      '0.7.6',
      expect.any(Object),
    )
    expect(client.registerWorkspaceIntegration).toHaveBeenCalledWith(
      '2',
      '23',
      'wh_new',
    )
  })

  it('recovers an existing failed installation by registering it again', async () => {
    const client = {
      listWorkspaceIntegrations: vi.fn().mockResolvedValue({
        installations: [
          {
            id: '91',
            name: 'botruntime/chat',
            version: '0.7.6',
            webhookId: 'wh_failed',
            enabled: true,
            status: 'failed',
            registered: false,
          },
        ],
      }),
      installWorkspaceIntegration: vi.fn(),
      registerWorkspaceIntegration: vi.fn().mockResolvedValue({ ok: true, status: 'registered' }),
      uninstallWorkspaceIntegration: vi.fn(),
    }

    await expect(
      ensureEvalChatTransport({
        client: client as any,
        workspaceId: '2',
        botId: '23',
        development: true,
      }),
    ).resolves.toEqual({ webhookId: 'wh_failed', provisioned: false })

    expect(client.installWorkspaceIntegration).not.toHaveBeenCalled()
    expect(client.registerWorkspaceIntegration).toHaveBeenCalledWith('2', '23', 'wh_failed')
    expect(client.uninstallWorkspaceIntegration).not.toHaveBeenCalled()
  })

  it('rolls back a newly provisioned dev installation when registration fails', async () => {
    const registerError = Object.assign(new Error('runtime unavailable'), { status: 400 })
    const client = {
      listWorkspaceIntegrations: vi.fn().mockResolvedValue({ installations: [] }),
      installWorkspaceIntegration: vi.fn().mockResolvedValue({
        installationId: '92',
        webhookId: 'wh_new',
        status: 'installed',
      }),
      registerWorkspaceIntegration: vi.fn().mockRejectedValue(registerError),
      uninstallWorkspaceIntegration: vi.fn().mockResolvedValue({ ok: true }),
    }

    await expect(
      ensureEvalChatTransport({
        client: client as any,
        workspaceId: '2',
        botId: '23',
        development: true,
      }),
    ).rejects.toThrow(
      'run `brt dev` in another terminal and keep it connected while retrying this command',
    )

    expect(client.uninstallWorkspaceIntegration).toHaveBeenCalledWith('2', '23', '92')
  })

  it('fails loud on an incompatible installed chat version', async () => {
    const client = {
      listWorkspaceIntegrations: vi.fn().mockResolvedValue({
        installations: [
          {
            name: 'botruntime/chat',
            version: '0.0.9',
            webhookId: 'wh_old',
            enabled: true,
          },
        ],
      }),
    }

    await expect(
      ensureEvalChatTransport({
        client: client as any,
        workspaceId: '2',
        botId: '23',
        development: true,
      }),
    ).rejects.toThrow(/0\.0\.9.*0\.7\.6/)
  })

  it('uses bot-scoped install and register outside development', async () => {
    const client = {
      getDevBotTarget: vi.fn().mockResolvedValue({ bot: { integrations: {} } }),
      installIntegration: vi
        .fn()
        .mockResolvedValue({ webhookId: 'wh_prod', status: 'installed' }),
      registerIntegration: vi
        .fn()
        .mockResolvedValue({ ok: true, status: 'registered' }),
    }

    await expect(
      ensureEvalChatTransport({
        client: client as any,
        workspaceId: '2',
        botId: '3',
        development: false,
      }),
    ).resolves.toEqual({ webhookId: 'wh_prod', provisioned: true })
    expect(client.installIntegration).toHaveBeenCalledWith(
      '3',
      'botruntime/chat',
      '0.7.6',
      expect.any(Object),
    )
    expect(client.registerIntegration).toHaveBeenCalledWith('3', 'wh_prod')
  })
})
