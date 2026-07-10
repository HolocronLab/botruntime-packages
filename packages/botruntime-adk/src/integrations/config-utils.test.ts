import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({ getProjectClient: vi.fn() }))

vi.mock('../auth/index.js', () => ({
  getProjectClient: authMocks.getProjectClient,
}))

import {
  assertServerConfigTarget,
  fetchServerIntegrationConfigs,
  fetchServerPluginConfigs,
  type ServerConfigTarget,
} from './config-utils.js'

const DEV_SECRET_SENTINEL = 'DEV_SECRET_SENTINEL'
const PROD_SECRET_SENTINEL = 'PROD_SECRET_SENTINEL'
const PROD_CREDENTIALS = {
  token: 'prod_token',
  apiUrl: 'https://cloud.example',
  workspaceId: 'prod_ws',
}
const DEV_CREDENTIALS = {
  token: 'dev_token',
  apiUrl: 'https://dev.local',
  workspaceId: 'dev_ws',
}

const project = {
  agentInfo: { devId: 'dev_from_project', botId: 'prod_from_project' },
} as any

const target = (
  environment: 'dev' | 'prod',
  botId?: string,
  credentials?: typeof PROD_CREDENTIALS
): ServerConfigTarget => {
  if (environment === 'dev') {
    return botId
      ? {
          environment,
          botId: '42',
          runtimeBotId: botId,
          credentials: DEV_CREDENTIALS,
        }
      : { environment }
  }
  return { environment, botId: botId!, credentials: credentials! }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dev target identity validation', () => {
  it.each(['0', '-1', '01', 'abc', ' 42', '42 '])('rejects non-canonical numeric control id %j', (botId) => {
    expect(() =>
      assertServerConfigTarget({
        environment: 'dev',
        botId,
        runtimeBotId: 'dev_opaque',
        credentials: DEV_CREDENTIALS,
      })
    ).toThrow(/numeric|positive|botId/i)
  })

  it('rejects a blank opaque runtime id', () => {
    expect(() =>
      assertServerConfigTarget({
        environment: 'dev',
        botId: '42',
        runtimeBotId: '   ',
        credentials: DEV_CREDENTIALS,
      })
    ).toThrow(/runtimeBotId|opaque/i)
  })
})

describe('fetchServerIntegrationConfigs target isolation', () => {
  it('fetches a dev target only by its explicit dev bot id', async () => {
    const getBot = vi.fn().mockResolvedValue({
      bot: {
        integrations: {
          telegram: {
            configuration: { token: DEV_SECRET_SENTINEL },
            enabled: true,
            identifier: 'connected',
          },
        },
      },
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerIntegrationConfigs(project, target('dev', 'dev_explicit'))

    expect(getBot).toHaveBeenCalledTimes(1)
    expect(getBot).toHaveBeenCalledWith({ id: 'dev_explicit' })
    expect(result.configs.telegram).toEqual({ token: DEV_SECRET_SENTINEL })
    expect(JSON.stringify(result)).not.toContain(PROD_SECRET_SENTINEL)
  })

  it.each(['404 dev bot missing', 'network unavailable'])('%s never falls back to the prod bot', async (message) => {
    const getBot = vi.fn(async ({ id }: { id: string }) => {
      if (id === 'prod_from_project') {
        return {
          bot: {
            integrations: {
              telegram: {
                configuration: { token: PROD_SECRET_SENTINEL },
                enabled: true,
                identifier: 'connected',
              },
            },
          },
        }
      }
      throw new Error(message)
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerIntegrationConfigs(project, target('dev', 'dev_explicit'))

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_explicit'])
    expect(result.error).toContain(message)
    expect(JSON.stringify(result)).not.toContain(PROD_SECRET_SENTINEL)
  })

  it('skips without network when the explicit dev target has no bot id, even if prod metadata exists', async () => {
    const getBot = vi.fn()
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerIntegrationConfigs(project, target('dev'))

    expect(result).toMatchObject({
      fetched: false,
      skipped: true,
      configs: {},
    })
    expect(authMocks.getProjectClient).not.toHaveBeenCalled()
    expect(getBot).not.toHaveBeenCalled()
  })

  it('fetches prod config only from the explicit canonical prod bot id', async () => {
    const getBot = vi.fn().mockResolvedValue({
      bot: {
        integrations: {
          telegram: {
            configuration: { token: PROD_SECRET_SENTINEL },
            enabled: true,
            identifier: 'connected',
          },
        },
      },
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerIntegrationConfigs(project, target('prod', 'prod_canonical', PROD_CREDENTIALS))

    expect(getBot).toHaveBeenCalledTimes(1)
    expect(getBot).toHaveBeenCalledWith({ id: 'prod_canonical' })
    expect(result.configs.telegram).toEqual({ token: PROD_SECRET_SENTINEL })
  })

  it('fails closed when the authoritative prod fetch fails', async () => {
    const getBot = vi.fn().mockRejectedValue(new Error('wrong prod workspace'))
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    await expect(
      fetchServerIntegrationConfigs(project, target('prod', 'prod_canonical', PROD_CREDENTIALS))
    ).rejects.toThrow(/prod.*integration.*config|integration.*config.*prod/i)

    expect(getBot).toHaveBeenCalledOnce()
  })
})

describe('fetchServerPluginConfigs target isolation', () => {
  it('fetches a dev target only by its explicit dev bot id', async () => {
    const getBot = vi.fn().mockResolvedValue({
      bot: {
        plugins: { crm: { configuration: { token: DEV_SECRET_SENTINEL } } },
      },
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerPluginConfigs(project, target('dev', 'dev_explicit'))

    expect(getBot).toHaveBeenCalledTimes(1)
    expect(getBot).toHaveBeenCalledWith({ id: 'dev_explicit' })
    expect(result.configs.crm).toEqual({ token: DEV_SECRET_SENTINEL })
    expect(JSON.stringify(result)).not.toContain(PROD_SECRET_SENTINEL)
  })

  it.each(['404 dev bot missing', 'network unavailable'])('%s never falls back to the prod bot', async (message) => {
    const getBot = vi.fn(async ({ id }: { id: string }) => {
      if (id === 'prod_from_project') {
        return {
          bot: {
            plugins: {
              crm: { configuration: { token: PROD_SECRET_SENTINEL } },
            },
          },
        }
      }
      throw new Error(message)
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerPluginConfigs(project, target('dev', 'dev_explicit'))

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_explicit'])
    expect(result.error).toContain(message)
    expect(JSON.stringify(result)).not.toContain(PROD_SECRET_SENTINEL)
  })

  it('skips without network when the explicit dev target has no bot id, even if prod metadata exists', async () => {
    const getBot = vi.fn()
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerPluginConfigs(project, target('dev'))

    expect(result).toMatchObject({
      fetched: false,
      skipped: true,
      configs: {},
    })
    expect(authMocks.getProjectClient).not.toHaveBeenCalled()
    expect(getBot).not.toHaveBeenCalled()
  })

  it('fetches prod config only from the explicit canonical prod bot id', async () => {
    const getBot = vi.fn().mockResolvedValue({
      bot: {
        plugins: { crm: { configuration: { token: PROD_SECRET_SENTINEL } } },
      },
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    const result = await fetchServerPluginConfigs(project, target('prod', 'prod_canonical', PROD_CREDENTIALS))

    expect(getBot).toHaveBeenCalledTimes(1)
    expect(getBot).toHaveBeenCalledWith({ id: 'prod_canonical' })
    expect(result.configs.crm).toEqual({ token: PROD_SECRET_SENTINEL })
  })

  it('fails closed when the authoritative prod fetch fails', async () => {
    const getBot = vi.fn().mockRejectedValue(new Error('prod auth failed'))
    authMocks.getProjectClient.mockResolvedValue({ getBot })

    await expect(fetchServerPluginConfigs(project, target('prod', 'prod_canonical', PROD_CREDENTIALS))).rejects.toThrow(
      /prod.*plugin.*config|plugin.*config.*prod/i
    )

    expect(getBot).toHaveBeenCalledOnce()
  })
})
