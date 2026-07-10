import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({ getProjectClient: vi.fn() }))
const projectMocks = vi.hoisted(() => ({ load: vi.fn() }))
const assetsMocks = vi.hoisted(() => ({ initAssets: vi.fn() }))
const devIdMocks = vi.hoisted(() => ({
  constructor: vi.fn(),
  restoreDevId: vi.fn(),
}))

vi.mock('../auth/index.js', () => ({
  getProjectClient: authMocks.getProjectClient,
}))
vi.mock('../agent-project/index.js', () => ({
  AgentProject: class AgentProject {
    static load = projectMocks.load
  },
}))
vi.mock('@holocronlab/botruntime-runtime/internal', () => ({
  BuiltInActions: {},
  BuiltInWorkflows: {},
  Errors: {},
  Primitives: { Definitions: {} },
  Workflow: {},
  setAdkCommand: vi.fn(),
}))
vi.mock('@holocronlab/botruntime-runtime/definition', () => ({
  BUILT_IN_TAGS: { workflow: {}, user: {}, message: {}, conversation: {} },
}))
vi.mock('@holocronlab/botruntime-runtime', () => ({
  Autonomous: {},
  defineConfig: <T>(config: T) => config,
}))
vi.mock('../integrations/manager.js', () => ({
  IntegrationManager: class IntegrationManager {},
}))
vi.mock('../plugins/manager.js', () => ({
  PluginManager: class PluginManager {},
}))
vi.mock('../interfaces/manager.js', () => ({
  InterfaceManager: class InterfaceManager {},
}))
vi.mock('./dev-id-manager.js', () => ({
  DevIdManager: class DevIdManager {
    constructor(
      projectPath: string,
      botProjectPath: string,
      options: {
        loadAgentProject?: (projectPath: string) => Promise<unknown>
      } = {}
    ) {
      devIdMocks.constructor(projectPath, botProjectPath, options)
    }

    async restoreDevId(target?: {
      devId: string
      devTargetBotId: string
      devApiUrl: string
      devWorkspaceId: string
    }) {
      devIdMocks.restoreDevId(target)
    }
  },
}))
vi.mock('./integration-sync.js', () => ({
  IntegrationSync: class IntegrationSync {
    async syncIntegrations() {
      return { errors: [] }
    }
  },
}))
vi.mock('./interface-sync.js', () => ({
  InterfaceSync: class InterfaceSync {
    async syncInterfaces() {
      return { errors: [] }
    }
  },
}))
vi.mock('./plugin-sync.js', () => ({
  PluginSync: class PluginSync {
    async syncPlugins() {
      return { errors: [] }
    }
  },
}))
vi.mock('../generators/assets.js', () => ({
  initAssets: assetsMocks.initAssets,
}))
vi.mock('../utils/link-sdk.js', () => ({ linkSdk: vi.fn() }))

import { BotGenerator, generateBotProject, type BotGenerationMode } from './generator.js'

const DEV_SECRET_SENTINEL = 'DEV_SECRET_SENTINEL'
const PROD_SECRET_SENTINEL = 'PROD_SECRET_SENTINEL'
const MERGED_LOCAL_OVERRIDE_SENTINEL = 'MERGED_LOCAL_OVERRIDE_SENTINEL'
const DEV_CONNECTION = {
  token: 'dev_token',
  apiUrl: 'https://dev.local',
  workspaceId: 'dev_ws',
}
const PROD_CONNECTION = {
  token: 'prod_token',
  apiUrl: 'https://cloud.example',
  workspaceId: 'prod_ws',
}

describe('BotGenerator config target isolation', () => {
  let projectPath: string
  let outputPath: string
  let getBot: ReturnType<typeof vi.fn>

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-generator-target-'))
    outputPath = path.join(projectPath, '.adk', 'bot')
    fs.mkdirSync(path.join(outputPath, 'bp_modules', 'integration_telegram'), {
      recursive: true,
    })
    fs.mkdirSync(path.join(outputPath, 'bp_modules', 'plugin_crm'), {
      recursive: true,
    })

    const fakeProject = {
      path: projectPath,
      agentInfo: {
        devId: 'merged_dev_id',
        botId: 'merged_local_override_id',
        workspaceId: 'dev_ws',
        apiUrl: 'https://dev.local',
      },
      integrations: [
        {
          alias: 'telegram',
          ref: {
            name: 'telegram',
            version: '1.0.0',
            fullName: 'telegram@1.0.0',
          },
          enabled: true,
          config: { local: 'LOCAL_SENTINEL' },
        },
      ],
      dependencies: {
        integrations: { telegram: { version: '1.0.0', enabled: true } },
        plugins: {
          crm: { version: '1.0.0', config: { local: 'LOCAL_SENTINEL' } },
        },
      },
      config: { name: 'target-isolation' },
      triggers: [],
      workflows: [],
      actions: [],
      tables: [],
      conversations: [],
    }
    projectMocks.load.mockResolvedValue(fakeProject as any)

    getBot = vi.fn(async ({ id }: { id: string }) => {
      const sentinel =
        id === 'dev_explicit'
          ? DEV_SECRET_SENTINEL
          : id === 'prod_canonical'
            ? PROD_SECRET_SENTINEL
            : MERGED_LOCAL_OVERRIDE_SENTINEL
      return {
        bot: {
          id,
          dev: id === 'dev_explicit',
          tags: id === 'dev_explicit' ? { 'botruntime.devTargetBotId': '42' } : {},
          integrations: {
            telegram: {
              configuration: { secret: sentinel },
              enabled: true,
              identifier: 'connected',
            },
          },
          plugins: { crm: { configuration: { secret: sentinel } } },
        },
      }
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
    vi.clearAllMocks()
  })

  const generateDefinition = async (
    adkCommand: BotGenerationMode,
    configTarget: {
      environment: 'dev' | 'prod'
      botId?: string
      runtimeBotId?: string
      credentials?: typeof PROD_CONNECTION
    }
  ): Promise<string> => {
    const generator = new BotGenerator({
      projectPath,
      outputPath,
      adkCommand,
      configTarget,
    })
    await generator.emitDependencyArtifacts()
    return fs.readFileSync(path.join(outputPath, 'bot.definition.ts'), 'utf8')
  }

  const stubGenerationPhases = () => {
    vi.spyOn(BotGenerator.prototype, 'generate').mockResolvedValue(undefined)
    vi.spyOn(BotGenerator.prototype, 'generateAdkRuntime').mockResolvedValue(undefined)
    vi.spyOn(BotGenerator.prototype, 'copyAssetsRuntime').mockResolvedValue(undefined)
    vi.spyOn(BotGenerator.prototype, 'emitDependencyArtifacts').mockResolvedValue(undefined)
  }

  it('adk-dev embeds integration and plugin config only from the explicit dev target', async () => {
    const artifact = await generateDefinition('adk-dev', {
      environment: 'dev',
      botId: '42',
      runtimeBotId: 'dev_explicit',
      credentials: DEV_CONNECTION,
    })

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_explicit', 'dev_explicit', 'dev_explicit'])
    expect(artifact).toContain(DEV_SECRET_SENTINEL)
    expect(artifact).not.toContain(PROD_SECRET_SENTINEL)
    expect(artifact).not.toContain(MERGED_LOCAL_OVERRIDE_SENTINEL)
  })

  it.each(['adk-build', 'adk-deploy'] as const)(
    '%s embeds integration and plugin config only from the explicit canonical prod target',
    async (adkCommand) => {
      const artifact = await generateDefinition(adkCommand, {
        environment: 'prod',
        botId: 'prod_canonical',
        credentials: PROD_CONNECTION,
      })

      expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['prod_canonical', 'prod_canonical'])
      expect(artifact).toContain(PROD_SECRET_SENTINEL)
      expect(artifact).not.toContain(DEV_SECRET_SENTINEL)
      expect(artifact).not.toContain(MERGED_LOCAL_OVERRIDE_SENTINEL)
    }
  )

  it('adk-dev regenerates the asset runtime against only the explicit dev target', async () => {
    const generator = new BotGenerator({
      projectPath,
      outputPath,
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'dev_explicit',
        credentials: DEV_CONNECTION,
      },
    })

    await generator.copyAssetsRuntime()

    expect(assetsMocks.initAssets).toHaveBeenCalledWith(projectPath, '42', {
      dev: true,
      credentials: DEV_CONNECTION,
      cacheScope: {
        environment: 'dev',
        botId: '42',
        apiUrl: DEV_CONNECTION.apiUrl,
        workspaceId: DEV_CONNECTION.workspaceId,
      },
      failOnRemoteFetchError: false,
    })
  })

  it.each(['adk-build', 'adk-deploy'] as const)(
    '%s regenerates the shipping asset runtime against only the canonical prod target',
    async (adkCommand) => {
      const generator = new BotGenerator({
        projectPath,
        outputPath,
        adkCommand,
        configTarget: {
          environment: 'prod',
          botId: 'prod_canonical',
          credentials: PROD_CONNECTION,
        },
      })

      await generator.copyAssetsRuntime()

      expect(assetsMocks.initAssets).toHaveBeenCalledWith(projectPath, 'prod_canonical', {
        dev: false,
        credentials: PROD_CONNECTION,
        cacheScope: {
          environment: 'prod',
          botId: 'prod_canonical',
          apiUrl: PROD_CONNECTION.apiUrl,
          workspaceId: PROD_CONNECTION.workspaceId,
        },
        failOnRemoteFetchError: true,
      })
    }
  )

  it.each([
    {
      label: 'adk-dev with a prod target',
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'prod',
        botId: 'prod_canonical',
        credentials: PROD_CONNECTION,
      },
    },
    {
      label: 'adk-build with a dev target',
      adkCommand: 'adk-build',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'dev_explicit',
        credentials: DEV_CONNECTION,
      },
    },
    {
      label: 'adk-deploy without a prod bot id',
      adkCommand: 'adk-deploy',
      configTarget: { environment: 'prod', credentials: PROD_CONNECTION },
    },
    {
      label: 'adk-deploy without authoritative credentials',
      adkCommand: 'adk-deploy',
      configTarget: { environment: 'prod', botId: 'prod_canonical' },
    },
    {
      label: 'adk-dev with numeric control id but no opaque runtime id',
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        credentials: DEV_CONNECTION,
      },
    },
    {
      label: 'adk-dev with opaque runtime id but no numeric control id',
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        runtimeBotId: 'dev_explicit',
        credentials: DEV_CONNECTION,
      },
    },
  ] as const)('rejects $label before project load, network, or artifacts', ({ adkCommand, configTarget }) => {
    expect(
      () =>
        new BotGenerator({
          projectPath,
          outputPath,
          adkCommand,
          configTarget,
        } as any)
    ).toThrow(/generation|target|credentials|environment/i)

    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(authMocks.getProjectClient).not.toHaveBeenCalled()
    expect(assetsMocks.initAssets).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(outputPath, 'bot.definition.ts'))).toBe(false)
  })

  it('allows a first-session adk-dev target without a bot id', () => {
    expect(
      () =>
        new BotGenerator({
          projectPath,
          outputPath,
          adkCommand: 'adk-dev',
          configTarget: { environment: 'dev', credentials: DEV_CONNECTION },
        } as any)
    ).not.toThrow()
  })

  it('rejects credential-less dev bootstrap before ambient project or catalog resolution', () => {
    expect(
      () =>
        new BotGenerator({
          projectPath,
          outputPath,
          adkCommand: 'adk-dev',
          configTarget: { environment: 'dev' },
        })
    ).toThrow(/credentials|authority|token/i)

    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(authMocks.getProjectClient).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'mismatched reserved tag',
      result: {
        bot: {
          id: 'dev_explicit',
          dev: true,
          tags: { 'botruntime.devTargetBotId': '99' },
        },
      },
    },
    {
      label: 'wrong response id',
      result: {
        bot: {
          id: 'another_runtime',
          dev: true,
          tags: { 'botruntime.devTargetBotId': '42' },
        },
      },
    },
    {
      label: 'non-dev response',
      result: {
        bot: {
          id: 'dev_explicit',
          dev: false,
          tags: { 'botruntime.devTargetBotId': '42' },
        },
      },
    },
  ])('fails before generation artifacts for a resolved dev target with $label', async ({ result }) => {
    stubGenerationPhases()
    getBot.mockResolvedValue(result)

    await expect(
      generateBotProject({
        projectPath,
        outputPath,
        adkCommand: 'adk-dev',
        configTarget: {
          environment: 'dev',
          botId: '42',
          runtimeBotId: 'dev_explicit',
          credentials: DEV_CONNECTION,
        },
      })
    ).rejects.toThrow(/dev|target|tag|runtime/i)

    expect(BotGenerator.prototype.generate).not.toHaveBeenCalled()
    expect(assetsMocks.initAssets).not.toHaveBeenCalled()
  })

  it('fails before generation artifacts when resolved dev target verification cannot reach the server', async () => {
    stubGenerationPhases()
    getBot.mockRejectedValue(new Error('verification network failed'))

    await expect(
      generateBotProject({
        projectPath,
        outputPath,
        adkCommand: 'adk-dev',
        configTarget: {
          environment: 'dev',
          botId: '42',
          runtimeBotId: 'dev_explicit',
          credentials: DEV_CONNECTION,
        },
      })
    ).rejects.toThrow(/verification network failed/)

    expect(BotGenerator.prototype.generate).not.toHaveBeenCalled()
    expect(assetsMocks.initAssets).not.toHaveBeenCalled()
  })

  it('keeps dev bootstrap offline-capable when neither id exists', async () => {
    stubGenerationPhases()

    await generateBotProject({
      projectPath,
      outputPath,
      adkCommand: 'adk-dev',
      configTarget: { environment: 'dev', credentials: DEV_CONNECTION },
    })

    expect(authMocks.getProjectClient).not.toHaveBeenCalled()
    expect(getBot).not.toHaveBeenCalled()
    expect(devIdMocks.restoreDevId).toHaveBeenCalledWith(undefined)
  })

  it('fails closed before writing an artifact when prod config cannot be fetched', async () => {
    getBot.mockRejectedValue(new Error('prod auth failed'))
    const generator = new BotGenerator({
      projectPath,
      outputPath,
      adkCommand: 'adk-deploy',
      configTarget: {
        environment: 'prod',
        botId: 'prod_canonical',
        credentials: PROD_CONNECTION,
      },
    } as any)

    await expect(generator.emitDependencyArtifacts()).rejects.toThrow(/prod.*config|config.*prod/i)

    expect(getBot).toHaveBeenCalledOnce()
    expect(fs.existsSync(path.join(outputPath, 'bot.definition.ts'))).toBe(false)
  })

  it('rejects a dependency snapshot for another bot before project load, network, or artifacts', async () => {
    const snapshotDir = path.join(projectPath, '.adk', 'dependencies')
    fs.mkdirSync(snapshotDir, { recursive: true })
    fs.writeFileSync(
      path.join(snapshotDir, 'prod.json'),
      JSON.stringify({
        version: 2,
        env: 'prod',
        target: {
          apiUrl: PROD_CONNECTION.apiUrl,
          workspaceId: PROD_CONNECTION.workspaceId,
          botId: 'different_prod_bot',
        },
        fetchedAt: '2026-07-09T00:00:00.000Z',
        integrations: {},
        plugins: {},
      })
    )
    const generator = new BotGenerator({
      projectPath,
      outputPath,
      adkCommand: 'adk-build',
      configTarget: {
        environment: 'prod',
        botId: 'prod_canonical',
        credentials: PROD_CONNECTION,
      },
    } as any)

    await expect(generator.emitDependencyArtifacts()).rejects.toThrow(/snapshot.*bot|bot.*snapshot|target.*bot/i)

    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(authMocks.getProjectClient).not.toHaveBeenCalled()
    expect(assetsMocks.initAssets).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(outputPath, 'bot.definition.ts'))).toBe(false)
  })

  it.each(['adk-build', 'adk-deploy'] as const)(
    '%s skips the dev-id restore path and never performs a default dev project load',
    async (adkCommand) => {
      stubGenerationPhases()

      await generateBotProject({
        projectPath,
        outputPath,
        adkCommand,
        configTarget: {
          environment: 'prod',
          botId: 'prod_canonical',
          credentials: PROD_CONNECTION,
        },
      })

      expect(devIdMocks.constructor).not.toHaveBeenCalled()
      expect(devIdMocks.restoreDevId).not.toHaveBeenCalled()
      expect(projectMocks.load).toHaveBeenCalledTimes(1)
      expect(projectMocks.load).toHaveBeenCalledWith(projectPath, {
        adkCommand,
        configTarget: {
          environment: 'prod',
          botId: 'prod_canonical',
          credentials: PROD_CONNECTION,
        },
      })
    }
  )

  it('adk-dev restores only the explicit verified dev target into the nested cache', async () => {
    stubGenerationPhases()

    await generateBotProject({
      projectPath,
      outputPath,
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'dev_explicit',
        credentials: DEV_CONNECTION,
      },
    })

    expect(devIdMocks.constructor).toHaveBeenCalledOnce()
    expect(devIdMocks.constructor.mock.calls[0]?.[2]).toEqual({})
    expect(devIdMocks.restoreDevId).toHaveBeenCalledWith({
      devId: 'dev_explicit',
      devTargetBotId: '42',
      devApiUrl: 'https://dev.local',
      devWorkspaceId: 'dev_ws',
    })
    expect(projectMocks.load).toHaveBeenCalledTimes(1)
    expect(projectMocks.load).toHaveBeenCalledWith(projectPath, {
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'dev_explicit',
        credentials: DEV_CONNECTION,
      },
    })
  })

  it('memoizes the credentialed project within one generator instance', async () => {
    const generator = new BotGenerator({
      projectPath,
      outputPath,
      adkCommand: 'adk-build',
      configTarget: {
        environment: 'prod',
        botId: 'prod_canonical',
        credentials: PROD_CONNECTION,
      },
    })

    const first = await (generator as any).loadProject()
    const second = await (generator as any).loadProject()

    expect(second).toBe(first)
    expect(projectMocks.load).toHaveBeenCalledTimes(1)
  })
})
