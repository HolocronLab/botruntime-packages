import { afterEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({
  getProjectClient: vi.fn(),
}))

vi.mock('../auth', () => ({
  getProjectClient: authMocks.getProjectClient,
}))

import { ConfigManager } from './manager'

describe('ConfigManager load policy', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    authMocks.getProjectClient.mockReset()
  })

  it('preserves the legacy fail-open behavior unless strict loading is requested', async () => {
    authMocks.getProjectClient.mockResolvedValue({
      getBot: vi.fn(async () => {
        throw new Error('upstream unavailable')
      }),
    })
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    await expect(new ConfigManager('bot_1').getAll()).resolves.toEqual({})
  })

  it('fails loud without reflecting an upstream response when strict loading is requested', async () => {
    authMocks.getProjectClient.mockResolvedValue({
      getBot: vi.fn(async () => {
        throw new Error('sensitive upstream body')
      }),
    })

    const promise = new ConfigManager('bot_1', { failOnLoadError: true }).getAll()
    await expect(promise).rejects.toMatchObject({
      code: 'BOT_CONFIG_LOAD_FAILED',
      message: 'Failed to load configuration from bot bot_1.',
    })
    await expect(promise).rejects.not.toThrow(/sensitive upstream body/)
  })
})
