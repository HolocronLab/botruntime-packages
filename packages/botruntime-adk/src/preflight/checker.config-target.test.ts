import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const generatorMocks = vi.hoisted(() => ({ generateBotProject: vi.fn() }))
const projectMocks = vi.hoisted(() => ({ load: vi.fn() }))
const authMocks = vi.hoisted(() => ({ getProjectClient: vi.fn() }))
const resolverMocks = vi.hoisted(() => ({ readAgentInfo: vi.fn(), readAgentLocalInfo: vi.fn() }))
const managerMocks = vi.hoisted(() => ({
  tableOptions: [] as any[],
  knowledgeOptions: [] as any[],
  assetsOptions: [] as any[],
  tablePlan: vi.fn(),
  knowledgePlan: vi.fn(),
  orphanedKnowledge: vi.fn(),
  assetsPlan: vi.fn(),
}))

vi.mock('../bot-generator/generator.js', () => ({ generateBotProject: generatorMocks.generateBotProject }))
vi.mock('../agent-project/agent-project.js', () => ({
  AgentProject: class AgentProject {
    static load = projectMocks.load
  },
}))
vi.mock('../auth/index.js', () => ({ getProjectClient: authMocks.getProjectClient }))
vi.mock('../agent-project/agent-resolver.js', () => resolverMocks)
vi.mock('../tables/table-manager.js', () => ({
  TableManager: class TableManager {
    constructor(options: unknown) {
      managerMocks.tableOptions.push(options)
    }
    createSyncPlan = managerMocks.tablePlan
  },
}))
vi.mock('../knowledge/manager.js', () => ({
  KnowledgeManager: class KnowledgeManager {
    constructor(options: unknown) {
      managerMocks.knowledgeOptions.push(options)
    }
    createSyncPlan = managerMocks.knowledgePlan
    getOrphanedKBs = managerMocks.orphanedKnowledge
  },
}))
vi.mock('../assets/manager.js', () => ({
  AssetsManager: class AssetsManager {
    constructor(options: unknown) {
      managerMocks.assetsOptions.push(options)
    }
    createSyncPlan = managerMocks.assetsPlan
  },
}))
vi.mock('@holocronlab/botruntime-runtime', () => ({
  Autonomous: {},
  defineConfig: <T>(config: T) => config,
}))
vi.mock('@holocronlab/botruntime-runtime/internal', () => ({
  BuiltInActions: {},
  BuiltInWorkflows: {},
  Errors: {},
  Primitives: { Definitions: {} },
  setAdkCommand: vi.fn(),
}))
vi.mock('@holocronlab/botruntime-runtime/definition', () => ({
  BUILT_IN_TAGS: { workflow: {}, user: {}, message: {}, conversation: {} },
}))

import { PreflightChecker } from './checker.js'

const CREDENTIALS = {
  token: 'explicit_token',
  apiUrl: 'https://cloud.example',
  workspaceId: 'explicit_ws',
}

describe('PreflightChecker generation target', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    managerMocks.tableOptions.length = 0
    managerMocks.knowledgeOptions.length = 0
    managerMocks.assetsOptions.length = 0
    managerMocks.tablePlan.mockResolvedValue({ totalDelete: 0 })
    managerMocks.knowledgePlan.mockResolvedValue({ orphanedSourcesToDelete: 0 })
    managerMocks.orphanedKnowledge.mockResolvedValue([])
    managerMocks.assetsPlan.mockResolvedValue({ totalDelete: 0 })
    resolverMocks.readAgentInfo.mockResolvedValue({
      botId: 'prod_bot',
      workspaceId: CREDENTIALS.workspaceId,
      apiUrl: CREDENTIALS.apiUrl,
    })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      botId: 'poison_bot',
      workspaceId: 'poison_workspace',
      apiUrl: 'http://poison.invalid',
      devId: 'dev_opaque',
      devTargetBotId: '42',
      devApiUrl: CREDENTIALS.apiUrl,
      devWorkspaceId: CREDENTIALS.workspaceId,
    })
    projectMocks.load.mockResolvedValue({
      path: '/agent',
      agentInfo: { botId: 'poison_bot', workspaceId: 'poison_workspace', apiUrl: 'http://poison.invalid' },
      config: {},
      tables: [],
      knowledge: [],
      hasAssetsDirectory: vi.fn().mockResolvedValue(false),
    })
    authMocks.getProjectClient.mockResolvedValue({
      getBot: vi.fn().mockResolvedValue({ bot: { id: 'prod_bot', name: 'prod', integrations: {} } }),
    })
  })

  it.each([
    {
      env: 'dev' as const,
      adkCommand: 'adk-dev' as const,
      botId: 'dev_opaque',
      configTarget: {
        environment: 'dev' as const,
        botId: '42',
        runtimeBotId: 'dev_opaque',
        credentials: CREDENTIALS,
      },
    },
    {
      env: 'prod' as const,
      adkCommand: 'adk-deploy' as const,
      botId: 'prod_bot',
      configTarget: { environment: 'prod' as const, botId: 'prod_bot', credentials: CREDENTIALS },
    },
  ])('passes the explicit $env target for regeneration', async ({ env, adkCommand, botId, configTarget }) => {
    const checker = new PreflightChecker('/agent', { credentials: CREDENTIALS })
    ;(checker as any).client = {}
    ;(checker as any).project = { agentInfo: { devTargetBotId: '42' } }

    await (checker as any).apply(botId, { agentConfig: [], secretWarnings: [], env, hasChanges: false }, env, undefined)

    expect(generatorMocks.generateBotProject).toHaveBeenCalledWith(
      expect.objectContaining({
        adkCommand,
        configTarget,
      })
    )
  })

  it('fails before regeneration when a dev runtime has no numeric control target', async () => {
    resolverMocks.readAgentLocalInfo.mockResolvedValue({ devId: 'dev_opaque' })
    const checker = new PreflightChecker('/agent', { credentials: CREDENTIALS })
    ;(checker as any).client = {}
    ;(checker as any).project = { agentInfo: { botId: 'prod_bot', devId: 'dev_opaque' } }

    await expect(
      (checker as any).apply(
        'dev_opaque',
        { agentConfig: [], secretWarnings: [], env: 'dev', hasChanges: false },
        'dev',
        undefined
      )
    ).rejects.toThrow(/complete scoped dev target|devTargetBotId/)

    expect(generatorMocks.generateBotProject).not.toHaveBeenCalled()
  })

  it('derives prod from agent.json and performs only a target-bound online project load', async () => {
    const checker = new PreflightChecker('/agent', { credentials: CREDENTIALS })

    await checker.computeDeployPlan('prod_bot', 'prod')

    expect(resolverMocks.readAgentInfo).toHaveBeenCalledWith('/agent')
    expect(resolverMocks.readAgentLocalInfo).not.toHaveBeenCalled()
    expect(projectMocks.load).toHaveBeenCalledTimes(1)
    expect(projectMocks.load).toHaveBeenCalledWith('/agent', {
      adkCommand: 'adk-deploy',
      configTarget: { environment: 'prod', botId: 'prod_bot', credentials: CREDENTIALS },
    })
    expect(authMocks.getProjectClient).toHaveBeenCalledWith({
      credentials: CREDENTIALS,
      apiUrl: CREDENTIALS.apiUrl,
      workspaceId: CREDENTIALS.workspaceId,
    })
    expect(JSON.stringify(projectMocks.load.mock.calls)).not.toContain('poison')
  })

  it('fails closed on a foreign prod dependency snapshot and never reads the local link', async () => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-preflight-foreign-snapshot-'))
    try {
      const snapshotPath = path.join(projectPath, '.adk', 'dependencies', 'prod.json')
      fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
      fs.writeFileSync(
        snapshotPath,
        JSON.stringify({
          version: 2,
          env: 'prod',
          target: {
            apiUrl: 'https://foreign.example',
            workspaceId: CREDENTIALS.workspaceId,
            botId: 'prod_bot',
          },
          fetchedAt: '2026-07-10T00:00:00.000Z',
          integrations: {},
          plugins: {},
        })
      )
      const before = fs.readFileSync(snapshotPath)
      const checker = new PreflightChecker(projectPath, { credentials: CREDENTIALS })

      await expect(checker.computeDeployPlan('prod_bot', 'prod')).rejects.toThrow(/snapshot.*another target|foreign/i)

      expect(resolverMocks.readAgentLocalInfo).not.toHaveBeenCalled()
      expect(generatorMocks.generateBotProject).not.toHaveBeenCalled()
      expect(fs.readFileSync(snapshotPath)).toEqual(before)
    } finally {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  it('uses opaque identity for dev bot reads and numeric identity for all control managers', async () => {
    const getBot = vi.fn().mockResolvedValue({
      bot: {
        id: 'dev_opaque',
        dev: true,
        tags: { 'botruntime.devTargetBotId': '42' },
        name: 'dev',
        integrations: {},
      },
    })
    const checker = new PreflightChecker('/agent', { credentials: CREDENTIALS })
    ;(checker as any).client = { getBot }
    ;(checker as any).project = {
      agentInfo: {
        botId: 'poison_bot',
        workspaceId: 'poison_workspace',
        apiUrl: 'http://poison.invalid',
        devId: 'dev_opaque',
        devTargetBotId: '42',
      },
      config: {},
      tables: [{}],
      knowledge: [{}],
      hasAssetsDirectory: vi.fn().mockResolvedValue(true),
    }

    await checker.computeDeployPlan('dev_opaque', 'dev')

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_opaque'])
    expect(managerMocks.tableOptions).toEqual([expect.objectContaining({ botId: '42' })])
    expect(managerMocks.knowledgeOptions).toEqual([expect.objectContaining({ botId: '42' })])
    expect(managerMocks.assetsOptions).toEqual([
      expect.objectContaining({
        botId: '42',
        credentials: CREDENTIALS,
        cacheScope: {
          environment: 'dev',
          botId: '42',
          apiUrl: CREDENTIALS.apiUrl,
          workspaceId: CREDENTIALS.workspaceId,
        },
        failOnRemoteFetchError: false,
      }),
    ])
    expect(managerMocks.tableOptions[0]).toMatchObject({
      credentials: CREDENTIALS,
      project: {
        agentInfo: {
          botId: '42',
          workspaceId: CREDENTIALS.workspaceId,
          apiUrl: CREDENTIALS.apiUrl,
          devId: 'dev_opaque',
          devTargetBotId: '42',
        },
      },
    })
    expect(managerMocks.knowledgeOptions[0]).toMatchObject(managerMocks.tableOptions[0])
    expect(JSON.stringify([...managerMocks.tableOptions, ...managerMocks.knowledgeOptions, ...managerMocks.assetsOptions]))
      .not.toContain('poison')
  })

  it.each([
    {
      label: 'mismatched reserved tag',
      response: {
        bot: {
          id: 'dev_opaque',
          dev: true,
          tags: { 'botruntime.devTargetBotId': '99' },
          integrations: {},
        },
      },
    },
    {
      label: 'non-dev response',
      response: {
        bot: {
          id: 'dev_opaque',
          dev: false,
          tags: { 'botruntime.devTargetBotId': '42' },
          integrations: {},
        },
      },
    },
  ])('fails closed before manager calls for $label', async ({ response }) => {
    const checker = new PreflightChecker('/agent', { credentials: CREDENTIALS })
    ;(checker as any).client = { getBot: vi.fn().mockResolvedValue(response) }
    ;(checker as any).project = {
      agentInfo: { devId: 'dev_opaque', devTargetBotId: '42' },
      config: {},
      tables: [{}],
      knowledge: [{}],
      hasAssetsDirectory: vi.fn().mockResolvedValue(true),
    }

    await expect(checker.computeDeployPlan('dev_opaque', 'dev')).rejects.toThrow(/dev|target|tag/i)

    expect(managerMocks.tablePlan).not.toHaveBeenCalled()
    expect(managerMocks.knowledgePlan).not.toHaveBeenCalled()
    expect(managerMocks.assetsPlan).not.toHaveBeenCalled()
  })

  it('fails closed on runtime lookup errors before manager calls', async () => {
    const checker = new PreflightChecker('/agent', { credentials: CREDENTIALS })
    ;(checker as any).client = { getBot: vi.fn().mockRejectedValue(new Error('network unavailable')) }
    ;(checker as any).project = {
      agentInfo: { devId: 'dev_opaque', devTargetBotId: '42' },
      config: {},
      tables: [{}],
      knowledge: [{}],
      hasAssetsDirectory: vi.fn().mockResolvedValue(true),
    }

    await expect(checker.computeDeployPlan('dev_opaque', 'dev')).rejects.toThrow(/network unavailable/)

    expect(managerMocks.tablePlan).not.toHaveBeenCalled()
    expect(managerMocks.knowledgePlan).not.toHaveBeenCalled()
    expect(managerMocks.assetsPlan).not.toHaveBeenCalled()
  })
})
