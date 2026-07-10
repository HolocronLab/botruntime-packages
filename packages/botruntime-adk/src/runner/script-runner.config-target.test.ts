import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const projectMocks = vi.hoisted(() => ({ load: vi.fn() }))
const generatorMocks = vi.hoisted(() => ({ generateBotProject: vi.fn() }))
const assetsMocks = vi.hoisted(() => ({ generateAssetsTypes: vi.fn(), generateAssetsRuntime: vi.fn() }))
const targetMocks = vi.hoisted(() => ({ verifyServerConfigTarget: vi.fn() }))
const resolverMocks = vi.hoisted(() => ({ readAgentInfo: vi.fn(), readAgentLocalInfo: vi.fn() }))
const authMocks = vi.hoisted(() => ({ getActiveCredentials: vi.fn(), assertCompleteCredentials: vi.fn() }))

vi.mock('../agent-project/index.js', () => ({ AgentProject: { load: projectMocks.load } }))
vi.mock('../bot-generator/index.js', () => ({ generateBotProject: generatorMocks.generateBotProject }))
vi.mock('../generators/assets.js', () => assetsMocks)
vi.mock('../integrations/config-utils.js', () => ({
  verifyServerConfigTarget: targetMocks.verifyServerConfigTarget,
}))
vi.mock('../agent-project/agent-resolver.js', () => resolverMocks)
vi.mock('../auth/index.js', () => ({
  auth: authMocks,
  assertCompleteCredentials: authMocks.assertCompleteCredentials,
}))
vi.mock('../config/manager.js', () => ({
  ConfigManager: class ConfigManager {
    async getAll() {
      return {}
    }
  },
}))
vi.mock('../commands/bp-build-command.js', () => ({ BpBuildCommand: class BpBuildCommand {} }))

import { ScriptRunner, setupTestRuntime } from './script-runner.js'

const CREDENTIALS = {
  token: 'runner_token',
  apiUrl: 'https://runner.example',
  workspaceId: 'runner_ws',
}

describe('ScriptRunner generation target', () => {
  const temporaryProjects: string[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    assetsMocks.generateAssetsTypes.mockResolvedValue(undefined)
    assetsMocks.generateAssetsRuntime.mockResolvedValue(undefined)
    targetMocks.verifyServerConfigTarget.mockResolvedValue(undefined)
    resolverMocks.readAgentInfo.mockResolvedValue({
      botId: 'prod_bot',
      workspaceId: 'runner_ws',
      apiUrl: 'https://runner.example',
    })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      workspaceId: 'runner_ws',
      apiUrl: 'https://runner.example',
      devId: 'dev_opaque',
      devTargetBotId: '42',
      devApiUrl: CREDENTIALS.apiUrl,
      devWorkspaceId: CREDENTIALS.workspaceId,
    })
    authMocks.getActiveCredentials.mockResolvedValue(CREDENTIALS)
    authMocks.assertCompleteCredentials.mockImplementation((credentials: typeof CREDENTIALS) => {
      if (!credentials.token || !credentials.apiUrl || !credentials.workspaceId) {
        throw new Error('incomplete active credentials')
      }
    })
    projectMocks.load.mockResolvedValue({
      path: '/agent',
      agentInfo: {
        devId: 'dev_opaque',
        devTargetBotId: '42',
        botId: 'prod_bot',
        apiUrl: 'https://dev-local.example',
        workspaceId: 'dev_local_ws',
      },
    })
  })

  afterEach(() => {
    for (const projectPath of temporaryProjects.splice(0)) {
      fs.rmSync(projectPath, { recursive: true, force: true })
    }
  })

  const writeCompleteArtifacts = (target?: unknown): { projectPath: string; botPath: string } => {
    const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-script-runner-target-'))
    temporaryProjects.push(projectPath)
    const botPath = path.join(projectPath, '.adk', 'bot')
    fs.mkdirSync(path.join(botPath, 'src'), { recursive: true })
    fs.mkdirSync(path.join(botPath, '.botpress', 'implementation'), { recursive: true })
    fs.writeFileSync(path.join(botPath, 'src', 'script-runner.ts'), '// existing runner\n')
    fs.writeFileSync(path.join(botPath, '.botpress', 'implementation', 'index.ts'), '// existing types\n')
    if (target !== undefined) {
      fs.writeFileSync(path.join(botPath, '.botruntime-script-target.json'), JSON.stringify(target))
    }
    return { projectPath, botPath }
  }

  it.each([
    {
      prod: false,
      adkCommand: 'adk-dev' as const,
      environment: 'dev' as const,
      botId: '42',
      runtimeBotId: 'dev_opaque',
      assetsDev: true,
    },
    {
      prod: true,
      adkCommand: 'adk-deploy' as const,
      environment: 'prod' as const,
      botId: 'prod_bot',
      runtimeBotId: undefined,
      assetsDev: false,
    },
  ])(
    'uses explicit runner credentials and the $environment snapshot',
    async ({ prod, adkCommand, environment, botId, runtimeBotId, assetsDev }) => {
      const runner = new ScriptRunner({ projectPath: '/agent', credentials: CREDENTIALS, forceRegenerate: true, prod })
      ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
      ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)
      ;(runner as any).writeArtifactTarget = vi.fn().mockResolvedValue(undefined)

      await runner.prepare()

      expect(projectMocks.load).toHaveBeenCalledWith('/agent', {
        adkCommand,
        configTarget:
          environment === 'dev'
            ? { environment, botId, runtimeBotId, credentials: CREDENTIALS }
            : { environment, botId, credentials: CREDENTIALS },
      })
      expect(assetsMocks.generateAssetsRuntime).toHaveBeenCalledWith('/agent', botId, {
        dev: assetsDev,
        credentials: CREDENTIALS,
        cacheScope: {
          environment,
          botId,
          apiUrl: CREDENTIALS.apiUrl,
          workspaceId: CREDENTIALS.workspaceId,
        },
        failOnRemoteFetchError: prod,
      })
      expect(generatorMocks.generateBotProject).toHaveBeenCalledWith({
        projectPath: '/agent',
        outputPath: '/agent/.adk/bot',
        adkCommand,
        configTarget:
          environment === 'dev'
            ? { environment, botId, runtimeBotId, credentials: CREDENTIALS }
            : { environment, botId, credentials: CREDENTIALS },
      })
    }
  )

  it('derives prod from agent.json only and never performs an ambient load with poisoned local metadata', async () => {
    const runner = new ScriptRunner({
      projectPath: '/agent',
      credentials: CREDENTIALS,
      forceRegenerate: true,
      prod: true,
    })
    ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).writeArtifactTarget = vi.fn().mockResolvedValue(undefined)

    await runner.prepare()

    expect(resolverMocks.readAgentInfo).toHaveBeenCalledWith('/agent')
    expect(resolverMocks.readAgentLocalInfo).not.toHaveBeenCalled()
    expect(projectMocks.load).toHaveBeenCalledTimes(1)
    expect(projectMocks.load).toHaveBeenCalledWith('/agent', {
      adkCommand: 'adk-deploy',
      configTarget: {
        environment: 'prod',
        botId: 'prod_bot',
        credentials: CREDENTIALS,
      },
    })
    expect(JSON.stringify(projectMocks.load.mock.calls)).not.toContain('poison')
  })

  it('verifies the resolved dev pair before assets or generated artifacts', async () => {
    targetMocks.verifyServerConfigTarget.mockRejectedValue(new Error('dev target tag mismatch'))
    const runner = new ScriptRunner({
      projectPath: '/agent',
      credentials: CREDENTIALS,
      forceRegenerate: true,
      prod: false,
    })
    ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)

    await expect(runner.prepare()).rejects.toThrow(/tag mismatch/)

    expect(targetMocks.verifyServerConfigTarget).toHaveBeenCalledWith(expect.objectContaining({ path: '/agent' }), {
      environment: 'dev',
      botId: '42',
      runtimeBotId: 'dev_opaque',
      credentials: CREDENTIALS,
    })
    expect(assetsMocks.generateAssetsTypes).not.toHaveBeenCalled()
    expect(assetsMocks.generateAssetsRuntime).not.toHaveBeenCalled()
    expect(generatorMocks.generateBotProject).not.toHaveBeenCalled()
  })

  it('regenerates target-specific artifacts when provenance belongs to another dev bot', async () => {
    const { projectPath, botPath } = writeCompleteArtifacts({
      version: 1,
      environment: 'dev',
      botId: '41',
      runtimeBotId: 'dev_target_a',
    })
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: {
        devId: 'dev_target_b',
        devTargetBotId: '42',
        apiUrl: 'https://dev-local.example',
        workspaceId: 'dev_local_ws',
      },
    })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      devId: 'dev_target_b',
      devTargetBotId: '42',
      devApiUrl: CREDENTIALS.apiUrl,
      devWorkspaceId: CREDENTIALS.workspaceId,
    })
    const runner = new ScriptRunner({ projectPath, credentials: CREDENTIALS, prod: false })
    ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)

    await runner.prepare()

    expect(generatorMocks.generateBotProject).toHaveBeenCalledWith({
      projectPath,
      outputPath: botPath,
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'dev_target_b',
        credentials: CREDENTIALS,
      },
    })
    expect(assetsMocks.generateAssetsRuntime).toHaveBeenCalledWith(projectPath, '42', expect.any(Object))
    expect(JSON.parse(fs.readFileSync(path.join(botPath, '.botruntime-script-target.json'), 'utf8'))).toEqual({
      version: 1,
      environment: 'dev',
      botId: '42',
      runtimeBotId: 'dev_target_b',
      apiUrl: CREDENTIALS.apiUrl,
      workspaceId: CREDENTIALS.workspaceId,
    })
  })

  it.each([
    { label: 'missing', target: undefined },
    { label: 'invalid', target: { version: 1, environment: 'dev', botId: '42' } },
  ])('regenerates complete-looking artifacts with $label provenance', async ({ target }) => {
    const { projectPath } = writeCompleteArtifacts(target)
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { devId: 'dev_target_b', devTargetBotId: '42' },
    })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      devId: 'dev_target_b',
      devTargetBotId: '42',
      devApiUrl: CREDENTIALS.apiUrl,
      devWorkspaceId: CREDENTIALS.workspaceId,
    })
    const runner = new ScriptRunner({ projectPath, credentials: CREDENTIALS, prod: false })
    ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)

    await runner.prepare()

    expect(generatorMocks.generateBotProject).toHaveBeenCalledOnce()
  })

  it('reuses artifacts only when dev provenance matches the verified pair', async () => {
    const { projectPath } = writeCompleteArtifacts({
      version: 1,
      environment: 'dev',
      botId: '42',
      runtimeBotId: 'dev_target_b',
      apiUrl: CREDENTIALS.apiUrl,
      workspaceId: CREDENTIALS.workspaceId,
    })
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { devId: 'dev_target_b', devTargetBotId: '42' },
    })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      devId: 'dev_target_b',
      devTargetBotId: '42',
      devApiUrl: CREDENTIALS.apiUrl,
      devWorkspaceId: CREDENTIALS.workspaceId,
    })
    const runner = new ScriptRunner({ projectPath, credentials: CREDENTIALS, prod: false })

    await runner.prepare()

    expect(generatorMocks.generateBotProject).not.toHaveBeenCalled()
    expect(assetsMocks.generateAssetsRuntime).not.toHaveBeenCalled()
  })

  it('does not reuse artifacts from another stack with the same dev IDs', async () => {
    const { projectPath } = writeCompleteArtifacts({
      version: 1,
      environment: 'dev',
      botId: '42',
      runtimeBotId: 'dev_target_b',
      apiUrl: 'https://other-stack.example',
      workspaceId: 'other_workspace',
    })
    projectMocks.load.mockResolvedValue({ path: projectPath, agentInfo: {} })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      devId: 'dev_target_b',
      devTargetBotId: '42',
      apiUrl: CREDENTIALS.apiUrl,
      workspaceId: CREDENTIALS.workspaceId,
      devApiUrl: CREDENTIALS.apiUrl,
      devWorkspaceId: CREDENTIALS.workspaceId,
    })
    const runner = new ScriptRunner({ projectPath, credentials: CREDENTIALS, prod: false })
    ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)

    await runner.prepare()

    expect(generatorMocks.generateBotProject).toHaveBeenCalledOnce()
  })

  it('keeps provenance invalidated when dev asset generation fails during a target change', async () => {
    const { projectPath, botPath } = writeCompleteArtifacts({
      version: 1,
      environment: 'dev',
      botId: '42',
      runtimeBotId: 'dev_target_b',
      apiUrl: 'https://foreign-stack.example',
      workspaceId: 'foreign_workspace',
    })
    fs.writeFileSync(path.join(projectPath, '.adk', 'assets-runtime.ts'), 'FOREIGN_ASSET_RUNTIME')
    projectMocks.load.mockResolvedValue({ path: projectPath, agentInfo: {} })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      devId: 'dev_target_b',
      devTargetBotId: '42',
      apiUrl: CREDENTIALS.apiUrl,
      workspaceId: CREDENTIALS.workspaceId,
      devApiUrl: CREDENTIALS.apiUrl,
      devWorkspaceId: CREDENTIALS.workspaceId,
    })
    assetsMocks.generateAssetsRuntime.mockRejectedValue(new Error('asset artifact write failed'))
    const runner = new ScriptRunner({ projectPath, credentials: CREDENTIALS, prod: false })
    ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)

    await expect(runner.prepare()).rejects.toThrow(/asset artifact write failed/)

    expect(fs.existsSync(path.join(botPath, '.botruntime-script-target.json'))).toBe(false)
    expect(fs.readFileSync(path.join(projectPath, '.adk', 'assets-runtime.ts'), 'utf8')).toBe('FOREIGN_ASSET_RUNTIME')
    expect(generatorMocks.generateBotProject).not.toHaveBeenCalled()
  })

  it('rejects incomplete auto-loaded active credentials before project or artifact access', async () => {
    authMocks.getActiveCredentials.mockResolvedValue({ ...CREDENTIALS, token: '' })

    await expect(setupTestRuntime({ projectPath: '/agent', prod: true })).rejects.toThrow(/incomplete active credentials/)

    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(assetsMocks.generateAssetsRuntime).not.toHaveBeenCalled()
  })

  it.each([
    {
      label: 'prod',
      prod: true,
      configurePoison: () =>
        resolverMocks.readAgentInfo.mockResolvedValue({
          botId: 'prod_bot',
          workspaceId: 'poison_workspace',
          apiUrl: 'https://poison.invalid',
        }),
    },
    {
      label: 'dev',
      prod: false,
      configurePoison: () =>
        resolverMocks.readAgentLocalInfo.mockResolvedValue({
          devId: 'dev_opaque',
          devTargetBotId: '42',
          workspaceId: 'poison_workspace',
          apiUrl: 'https://poison.invalid',
          devApiUrl: 'https://poison.invalid',
          devWorkspaceId: 'poison_workspace',
        }),
    },
  ])('auto credentials reject poisoned $label authority before any online load', async ({ prod, configurePoison }) => {
    configurePoison()

    await expect(setupTestRuntime({ projectPath: '/agent', prod })).rejects.toThrow(/does not match/)

    expect(authMocks.getActiveCredentials).toHaveBeenCalledOnce()
    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(targetMocks.verifyServerConfigTarget).not.toHaveBeenCalled()
    expect(generatorMocks.generateBotProject).not.toHaveBeenCalled()
  })

  it('auto credentials ignore poisoned local stack fields for a coherent prod authority', async () => {
    const { projectPath } = writeCompleteArtifacts({
      version: 1,
      environment: 'prod',
      botId: 'prod_bot',
      apiUrl: CREDENTIALS.apiUrl,
      workspaceId: CREDENTIALS.workspaceId,
    })
    projectMocks.load.mockResolvedValue({ path: projectPath, agentInfo: {} })
    resolverMocks.readAgentLocalInfo.mockResolvedValue({
      botId: 'poison_bot',
      workspaceId: 'poison_workspace',
      apiUrl: 'https://poison.invalid',
      devId: 'poison_dev',
      devTargetBotId: '666',
    })

    const result = await setupTestRuntime({ projectPath, prod: true })

    expect(result.botId).toBe('prod_bot')
    expect(authMocks.getActiveCredentials).toHaveBeenCalledOnce()
    expect(resolverMocks.readAgentLocalInfo).not.toHaveBeenCalled()
    expect(projectMocks.load).toHaveBeenCalledWith(projectPath, {
      adkCommand: 'adk-deploy',
      configTarget: {
        environment: 'prod',
        botId: 'prod_bot',
        credentials: CREDENTIALS,
      },
    })
    expect(JSON.stringify(projectMocks.load.mock.calls)).not.toContain('poison')
  })

  it('regenerates artifacts when prod provenance belongs to another bot', async () => {
    const { projectPath } = writeCompleteArtifacts({
      version: 1,
      environment: 'prod',
      botId: 'prod_target_a',
    })
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_target_b' },
    })
    resolverMocks.readAgentInfo.mockResolvedValue({
      botId: 'prod_target_b',
      workspaceId: CREDENTIALS.workspaceId,
      apiUrl: CREDENTIALS.apiUrl,
    })
    const runner = new ScriptRunner({ projectPath, credentials: CREDENTIALS, prod: true })
    ;(runner as any).generateScriptRunner = vi.fn().mockResolvedValue(undefined)
    ;(runner as any).runBpBuild = vi.fn().mockResolvedValue(undefined)

    await runner.prepare()

    expect(generatorMocks.generateBotProject).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath,
        configTarget: { environment: 'prod', botId: 'prod_target_b', credentials: CREDENTIALS },
      })
    )
  })
})
