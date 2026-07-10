import { describe, expect, it, vi } from 'vitest'
import { PluginResolver } from './plugin-resolver.js'

const state = {
  integrations: {
    'telegram-main': { name: 'telegram', version: '1.0.0', enabled: true, config: {} },
    'audit-main': { name: 'audit', version: '2.0.0', enabled: true, config: {} },
  },
  plugins: {},
}

describe('PluginResolver direct integration bindings', () => {
  it('reconstructs both interface and direct integration maps from the registry spec', async () => {
    const updateBot = vi.fn().mockResolvedValue(undefined)
    const resolver = new PluginResolver({
      registry: {
        getSpec: vi.fn().mockResolvedValue({
          id: '701',
          dependencies: {
            interfaces: { messageEvents: { name: 'messaging' } },
            integrations: { auditStream: { id: 'integration_audit', name: 'audit', version: '2.0.0' } },
          },
        }),
      } as any,
      integrationRegistry: {
        getSpec: vi.fn(async (name: string) =>
          name === 'telegram'
            ? { id: 'integration_telegram', interfaces: { messages: { name: 'messaging' } } }
            : { id: 'integration_audit', interfaces: {} }
        ),
      } as any,
      client: { updateBot } as any,
    })

    const apply = await resolver.prepareApplyToCloud({
      botId: '42',
      alias: 'custom-alias',
      entry: {
        name: 'assistant',
        version: '3.0.0',
        enabled: true,
        config: { mode: 'safe' },
        dependencies: {
          messageEvents: { integrationAlias: 'telegram-main' },
          auditStream: { integrationAlias: 'audit-main' },
        },
      },
      state,
    })
    await apply()

    expect(updateBot).toHaveBeenCalledWith({
      id: '42',
      plugins: {
        'custom-alias': {
          id: '701',
          enabled: true,
          configuration: { mode: 'safe' },
          interfaces: {
            messageEvents: {
              integrationId: 'integration_telegram',
              integrationAlias: 'telegram-main',
              integrationInterfaceAlias: 'messages',
            },
          },
          integrations: {
            auditStream: {
              integrationId: 'integration_audit',
              integrationAlias: 'audit-main',
            },
          },
        },
      },
    })
  })

  it('rejects a registry spec that reuses one dependency key across both maps', async () => {
    const resolver = new PluginResolver({
      registry: {
        getSpec: vi.fn().mockResolvedValue({
          id: '701',
          dependencies: {
            interfaces: { sharedKey: { name: 'messaging' } },
            integrations: { sharedKey: { id: 'integration_audit', name: 'audit', version: '2.0.0' } },
          },
        }),
      } as any,
      integrationRegistry: { getSpec: vi.fn() } as any,
      client: { updateBot: vi.fn() } as any,
    })

    await expect(
      resolver.prepareApplyToCloud({
        botId: '42',
        alias: 'custom-alias',
        entry: {
          name: 'assistant', version: '3.0.0', enabled: true, config: {},
          dependencies: { sharedKey: { integrationAlias: 'telegram-main' } },
        },
        state,
      })
    ).rejects.toThrow(/sharedKey|duplicate|interfaces.*integrations/i)
  })
})
