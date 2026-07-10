import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authMocks = vi.hoisted(() => ({ getProjectClient: vi.fn() }))
const projectMocks = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('../auth/index.js', () => ({ getProjectClient: authMocks.getProjectClient }))
vi.mock('../agent-project/agent-project.js', () => ({ AgentProject: { load: projectMocks.load } }))
vi.mock('../agent-project/validation-errors.js', () => ({
  ValidationErrors: { agentNotLinked: () => new Error('agent not linked') },
}))

import { DevIdManager } from './dev-id-manager.js'

describe('DevIdManager explicit cache target', () => {
  let projectPath: string
  let botProjectPath: string
  let cachePath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-dev-id-source-'))
    botProjectPath = path.join(projectPath, '.adk', 'bot')
    cachePath = path.join(botProjectPath, '.botpress', 'project.cache.json')
    fs.mkdirSync(path.dirname(cachePath), { recursive: true })
    vi.clearAllMocks()
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('writes only the explicit verified dev pair and never reads stale agent metadata', async () => {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ botId: 'stale_nested_prod', devId: 'stale_nested_runtime', devTargetBotId: '11' })
    )
    const loadAgentProject = vi.fn().mockResolvedValue({
      agentInfo: {
        botId: 'stale_agent_prod',
        devId: 'stale_agent_runtime',
        devTargetBotId: '22',
      },
    })
    const manager = new DevIdManager(projectPath, botProjectPath, { loadAgentProject: loadAgentProject as any })

    await manager.restoreDevId({
      devId: 'verified_runtime',
      devTargetBotId: '42',
      devApiUrl: 'https://dev.example',
      devWorkspaceId: 'workspace',
    })

    expect(JSON.parse(fs.readFileSync(cachePath, 'utf8'))).toEqual({
      devId: 'verified_runtime',
      devTargetBotId: '42',
      devApiUrl: 'https://dev.example',
      devWorkspaceId: 'workspace',
    })
    expect(loadAgentProject).not.toHaveBeenCalled()
  })

  it('writes the complete verified target quartet to the nested cache', async () => {
    const manager = new DevIdManager(projectPath, botProjectPath)

    await manager.restoreDevId({
      devId: 'shared-runtime',
      devTargetBotId: '42',
      devApiUrl: 'https://cloud.example/',
      devWorkspaceId: 'cloud_ws',
    })

    expect(JSON.parse(fs.readFileSync(cachePath, 'utf8'))).toEqual({
      devId: 'shared-runtime',
      devTargetBotId: '42',
      devApiUrl: 'https://cloud.example',
      devWorkspaceId: 'cloud_ws',
    })
  })

  it('clears every stale nested identity during bootstrap without consulting agent metadata', async () => {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({ botId: 'stale_nested_prod', devId: 'stale_nested_runtime', devTargetBotId: '11' })
    )
    const loadAgentProject = vi.fn().mockResolvedValue({
      agentInfo: {
        botId: 'stale_agent_prod',
        devId: 'stale_agent_runtime',
        devTargetBotId: '22',
      },
    })
    const manager = new DevIdManager(projectPath, botProjectPath, { loadAgentProject: loadAgentProject as any })

    await manager.restoreDevId()

    expect(JSON.parse(fs.readFileSync(cachePath, 'utf8'))).toEqual({})
    expect(loadAgentProject).not.toHaveBeenCalled()
  })

  it('fails generation when the verified pair cannot replace the nested cache', async () => {
    const blockedBotPath = path.join(projectPath, 'blocked-bot-path')
    fs.writeFileSync(blockedBotPath, 'not a directory')
    const manager = new DevIdManager(projectPath, blockedBotPath)

    await expect(
      manager.restoreDevId({
        devId: 'verified_runtime',
        devTargetBotId: '42',
        devApiUrl: 'https://dev.example',
        devWorkspaceId: 'workspace',
      })
    ).rejects.toThrow()
  })

  it('propagates an atomic rename failure and removes the temporary cache file', async () => {
    fs.mkdirSync(cachePath)
    const manager = new DevIdManager(projectPath, botProjectPath)

    await expect(
      manager.restoreDevId({
        devId: 'verified_runtime',
        devTargetBotId: '42',
        devApiUrl: 'https://dev.example',
        devWorkspaceId: 'workspace',
      })
    ).rejects.toThrow()

    expect(fs.readdirSync(path.dirname(cachePath)).filter((name) => name.includes('.tmp-'))).toEqual([])
  })

  it('loads only offline when preserving a nested dev id into agent.local', async () => {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        devId: 'verified_runtime',
        devTargetBotId: '42',
        devApiUrl: 'https://dev.example',
        devWorkspaceId: 'workspace',
      })
    )
    const updateAgentLocalInfo = vi.fn().mockResolvedValue(undefined)
    projectMocks.load.mockResolvedValue({
      agentInfo: { devId: 'verified_runtime', devTargetBotId: '42' },
      updateAgentLocalInfo,
    })
    const manager = new DevIdManager(projectPath, botProjectPath)

    await manager.preserveDevId()

    expect(projectMocks.load).toHaveBeenCalledWith(projectPath, { offline: true })
    expect(updateAgentLocalInfo).toHaveBeenCalledWith({
      devId: 'verified_runtime',
      devTargetBotId: '42',
      devApiUrl: 'https://dev.example',
      devWorkspaceId: 'workspace',
    })
  })

  it('preserves the complete nested target quartet into agent.local', async () => {
    fs.writeFileSync(
      cachePath,
      JSON.stringify({
        devId: 'verified_runtime',
        devTargetBotId: '42',
        devApiUrl: 'https://dev.example',
        devWorkspaceId: 'explicit_workspace',
      })
    )
    const updateAgentLocalInfo = vi.fn().mockResolvedValue(undefined)
    projectMocks.load.mockResolvedValue({ agentInfo: { botId: 'prod' }, updateAgentLocalInfo })
    const manager = new DevIdManager(projectPath, botProjectPath)

    await manager.preserveDevId()

    expect(updateAgentLocalInfo).toHaveBeenCalledWith({
      devId: 'verified_runtime',
      devTargetBotId: '42',
      devApiUrl: 'https://dev.example',
      devWorkspaceId: 'explicit_workspace',
    })
  })

  it('does not address a dev tuple scoped to foreign credentials', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        devId: 'shared-runtime',
        devTargetBotId: '42',
        devApiUrl: 'http://local.example',
        devWorkspaceId: 'local_ws',
      })
    )
    const manager = new DevIdManager(projectPath, botProjectPath, {
      credentials: {
        token: 'cloud_token',
        apiUrl: 'https://cloud.example',
        workspaceId: 'cloud_ws',
      },
    })

    await expect(manager.checkDevBotExists()).resolves.toBe(false)

    expect(authMocks.getProjectClient).not.toHaveBeenCalled()
  })

  it('checks the raw dev target only through caller-supplied credentials', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'poison_bot',
        workspaceId: 'poison_workspace',
        apiUrl: 'http://poison.invalid',
        devId: 'verified_runtime',
        devTargetBotId: '42',
      })
    )
    const getBot = vi.fn().mockResolvedValue({
      bot: {
        id: 'verified_runtime',
        dev: true,
        tags: { 'botruntime.devTargetBotId': '42' },
      },
    })
    authMocks.getProjectClient.mockResolvedValue({ getBot })
    const credentials = {
      token: 'explicit_token',
      apiUrl: 'https://dev.example',
      workspaceId: 'explicit_workspace',
    }
    const manager = new DevIdManager(projectPath, botProjectPath, { credentials } as any)

    await expect(manager.checkDevBotExists()).resolves.toBe(true)

    expect(projectMocks.load).not.toHaveBeenCalled()
    expect(authMocks.getProjectClient).toHaveBeenCalledWith({
      credentials,
      apiUrl: credentials.apiUrl,
      workspaceId: credentials.workspaceId,
      headers: { 'x-multiple-integrations': 'true' },
    })
    expect(getBot).toHaveBeenCalledWith({ id: 'verified_runtime' })
    expect(JSON.stringify(authMocks.getProjectClient.mock.calls)).not.toContain('poison')
  })
})
