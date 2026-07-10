import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const clientMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  getBot: vi.fn(),
  listFiles: vi.fn(),
}))

vi.mock('@holocronlab/botruntime-client', () => ({
  Client: class Client {
    constructor(options: unknown) {
      clientMocks.constructor(options)
    }

    getBot = clientMocks.getBot
    listFiles = clientMocks.listFiles
  },
}))
vi.mock('@holocronlab/botruntime-runtime', () => ({
  DataSource: { isWebsite: () => false, isDirectory: () => false },
}))

import { AssetsManager } from '../assets/manager.js'
import { auth, clearProjectClientCache, getProjectClient } from '../auth/index.js'
import { KnowledgeManager } from '../knowledge/manager.js'
import { TableManager } from '../tables/table-manager.js'
import { fetchServerIntegrationConfigs, fetchServerPluginConfigs } from './config-utils.js'

const PROD_CONNECTION = {
  token: 'prod_token',
  apiUrl: 'https://cloud.example',
  workspaceId: 'prod_ws',
}

const DEV_CONNECTION = {
  token: 'dev_token',
  apiUrl: 'https://dev.local',
  workspaceId: 'dev_ws',
  botId: 'local_override',
}

describe('authoritative server connection', () => {
  let projectPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-server-connection-'))
    fs.writeFileSync(
      path.join(projectPath, 'agent.json'),
      JSON.stringify({
        botId: 'prod_from_file',
        workspaceId: 'prod_file_ws',
        apiUrl: 'https://prod-file.example',
      })
    )
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'local_override',
        workspaceId: 'dev_ws',
        apiUrl: 'https://dev.local',
      })
    )
    clientMocks.getBot.mockResolvedValue({
      bot: { integrations: {}, plugins: {} },
    })
    clientMocks.listFiles.mockResolvedValue({ files: [] })
    clearProjectClientCache()
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    clearProjectClientCache()
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  it('constructs the real config client only from explicit prod credentials', async () => {
    const getAgentCredentials = vi.spyOn(auth, 'getAgentCredentials').mockResolvedValue(DEV_CONNECTION)
    const project = {
      path: projectPath,
      agentInfo: {
        botId: DEV_CONNECTION.botId,
        workspaceId: DEV_CONNECTION.workspaceId,
        apiUrl: DEV_CONNECTION.apiUrl,
      },
    } as any
    const target = {
      environment: 'prod' as const,
      botId: 'prod_canonical',
      credentials: PROD_CONNECTION,
    }

    await fetchServerIntegrationConfigs(project, target)
    await fetchServerPluginConfigs(project, target)

    expect(getAgentCredentials).not.toHaveBeenCalled()
    expect(clientMocks.constructor).toHaveBeenCalledTimes(1)
    expect(clientMocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        token: PROD_CONNECTION.token,
        apiUrl: PROD_CONNECTION.apiUrl,
        workspaceId: PROD_CONNECTION.workspaceId,
        botId: 'prod_canonical',
      })
    )
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('dev.local')
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('dev_ws')
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('local_override')
  })

  it('constructs the real assets client only from explicit prod credentials', async () => {
    const manager = new AssetsManager({
      projectPath,
      botId: 'prod_canonical',
      credentials: PROD_CONNECTION,
    })

    await manager.getRemoteAssets()

    expect(clientMocks.constructor).toHaveBeenCalledTimes(1)
    expect(clientMocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        token: PROD_CONNECTION.token,
        apiUrl: PROD_CONNECTION.apiUrl,
        workspaceId: PROD_CONNECTION.workspaceId,
        botId: 'prod_canonical',
      })
    )
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('dev.local')
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('dev_ws')
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('local_override')
  })

  it.each([
    ['table', TableManager],
    ['knowledge', KnowledgeManager],
  ] as const)('%s manager keeps complete credentials authoritative over poisoned project metadata', async (_label, Manager) => {
    const project = {
      path: projectPath,
      agentInfo: {
        botId: 'poison_bot',
        workspaceId: 'poison_workspace',
        apiUrl: 'https://poison.invalid',
      },
    } as any
    const manager = new Manager({ project, botId: 'prod_canonical', credentials: PROD_CONNECTION })

    await (manager as any).getClient()

    expect(clientMocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        token: PROD_CONNECTION.token,
        apiUrl: PROD_CONNECTION.apiUrl,
        workspaceId: PROD_CONNECTION.workspaceId,
        botId: 'prod_canonical',
      })
    )
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('poison')
  })

  it.each([
    ['table', TableManager],
    ['knowledge', KnowledgeManager],
  ] as const)('%s manager rejects a partial PAT before poisoned project metadata reaches a client', async (_label, Manager) => {
    const project = {
      path: projectPath,
      agentInfo: {
        botId: 'poison_bot',
        workspaceId: 'poison_workspace',
        apiUrl: 'https://poison.invalid',
      },
    } as any
    const manager = new Manager({
      project,
      botId: 'prod_canonical',
      credentials: { token: 'partial_pat', apiUrl: 'https://selected.example' },
    })

    await expect((manager as any).getClient()).rejects.toThrow(/workspace|complete|partial/i)
    expect(clientMocks.constructor).not.toHaveBeenCalled()
  })

  it('rejects unmatched explicit coordinates before an ambient PAT reaches a client', async () => {
    const getAuthorityCredentials = vi
      .spyOn(auth, 'getAuthorityCredentials')
      .mockRejectedValue(new Error('no matching profile authority'))

    await expect(
      getProjectClient({ apiUrl: 'https://poison.invalid', workspaceId: 'poison_workspace' })
    ).rejects.toThrow(/matching profile authority/)

    expect(getAuthorityCredentials).toHaveBeenCalledWith('https://poison.invalid', 'poison_workspace')
    expect(clientMocks.constructor).not.toHaveBeenCalled()
  })

  it('uses the opaque runtime id for dev config addressing while retaining the numeric control target', async () => {
    const project = { path: projectPath } as any
    const target = {
      environment: 'dev' as const,
      botId: '42',
      runtimeBotId: 'dev_opaque',
      credentials: DEV_CONNECTION,
    }

    await fetchServerIntegrationConfigs(project, target)
    await fetchServerPluginConfigs(project, target)

    expect(clientMocks.constructor).toHaveBeenCalledTimes(1)
    expect(clientMocks.constructor).toHaveBeenCalledWith(
      expect.objectContaining({
        token: DEV_CONNECTION.token,
        apiUrl: DEV_CONNECTION.apiUrl,
        workspaceId: DEV_CONNECTION.workspaceId,
        botId: 'dev_opaque',
      })
    )
    expect(clientMocks.getBot).toHaveBeenCalledWith({ id: 'dev_opaque' })
    expect(JSON.stringify(clientMocks.constructor.mock.calls)).not.toContain('prod_from_file')
  })
})
