import { beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({ resolveWorkspaceCredentials: vi.fn() }))
const projectMocks = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('../auth/index.js', () => ({ resolveWorkspaceCredentials: authMocks.resolveWorkspaceCredentials }))
vi.mock('../agent-project/agent-project.js', () => ({ AgentProject: { load: projectMocks.load } }))
vi.mock('../commands/bp-add-command.js', () => ({ BpAddCommand: class BpAddCommand {} }))

import { IntegrationSync } from './integration-sync.js'
import { InterfaceSync } from './interface-sync.js'
import { PluginSync } from './plugin-sync.js'

const PROD_CONNECTION = { token: 'prod_token', apiUrl: 'https://cloud.example', workspaceId: 'prod_ws' }
const PROD_TARGET = {
  environment: 'prod' as const,
  botId: 'prod_bot',
  credentials: PROD_CONNECTION,
}

describe('dependency sync authoritative connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    projectMocks.load.mockResolvedValue({ agentInfo: { apiUrl: 'https://dev.local', workspaceId: 'dev_ws' } })
    authMocks.resolveWorkspaceCredentials.mockResolvedValue(PROD_CONNECTION)
  })

  it.each([
    ['integration', IntegrationSync],
    ['plugin', PluginSync],
    ['interface', InterfaceSync],
  ] as const)('%s sync resolves credentials without merged project metadata', async (_label, SyncClass) => {
    const sync = new SyncClass('/agent', '/agent/.adk/bot', {
      adkCommand: 'adk-build',
      configTarget: PROD_TARGET,
      credentials: PROD_CONNECTION,
    })

    await (sync as any).getCredentials()

    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(authMocks.resolveWorkspaceCredentials).toHaveBeenCalledWith({
      credentials: PROD_CONNECTION,
      apiUrl: PROD_CONNECTION.apiUrl,
      workspaceId: PROD_CONNECTION.workspaceId,
    })
  })

  it.each([
    ['integration', IntegrationSync],
    ['plugin', PluginSync],
    ['interface', InterfaceSync],
  ] as const)('%s sync treats configTarget credentials as sufficient authority', async (_label, SyncClass) => {
    const sync = new SyncClass('/agent', '/agent/.adk/bot', {
      adkCommand: 'adk-build',
      configTarget: PROD_TARGET,
    })

    await (sync as any).getCredentials()

    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(authMocks.resolveWorkspaceCredentials).toHaveBeenCalledWith({
      credentials: PROD_CONNECTION,
      apiUrl: PROD_CONNECTION.apiUrl,
      workspaceId: PROD_CONNECTION.workspaceId,
    })
  })

  it.each([
    ['integration', IntegrationSync],
    ['plugin', PluginSync],
    ['interface', InterfaceSync],
  ] as const)('%s sync keeps the selected target on every project load', async (_label, SyncClass) => {
    const sync = new SyncClass('/agent', '/agent/.adk/bot', {
      adkCommand: 'adk-build',
      configTarget: PROD_TARGET,
      credentials: PROD_CONNECTION,
    })

    const first = await (sync as any).loadProject()
    const second = await (sync as any).loadProject()

    expect(second).toBe(first)
    expect(projectMocks.load).toHaveBeenCalledTimes(1)
    expect(projectMocks.load).toHaveBeenCalledWith('/agent', {
      adkCommand: 'adk-build',
      configTarget: PROD_TARGET,
    })
  })

  it.each([
    ['integration', IntegrationSync],
    ['plugin', PluginSync],
    ['interface', InterfaceSync],
  ] as const)('%s sync reuses an operation-scoped project without another load', async (_label, SyncClass) => {
    const sharedProject = { agentInfo: {}, dependencies: {} } as any
    const sync = new SyncClass('/agent', '/agent/.adk/bot', {
      adkCommand: 'adk-build',
      configTarget: PROD_TARGET,
      projectPromise: Promise.resolve(sharedProject),
    })

    expect(await (sync as any).loadProject()).toBe(sharedProject)
    expect(projectMocks.load).not.toHaveBeenCalled()
  })
})
