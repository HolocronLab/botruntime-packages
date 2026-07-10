import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const projectMocks = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('../agent-project/agent-project.js', () => ({ AgentProject: { load: projectMocks.load } }))
vi.mock('@holocronlab/botruntime-runtime', () => ({ extractMissingRequiredFields: vi.fn(() => []) }))

import { DependencyManager } from './dependency-manager.js'
import { DependencyMigrationManager } from './migration.js'

const API_URL = 'https://prod.example'
const WORKSPACE_ID = 'prod_ws'

const cloudBot = (id: string, targetBotId = '42') => ({
  bot: {
    id,
    name: id,
    dev: id.includes('opaque'),
    tags: id.includes('opaque') ? { 'botruntime.devTargetBotId': targetBotId } : {},
    integrations: {},
    plugins: {},
    devReadiness: {
      schemaVersion: 1,
      integrations: { authority: 'authoritative', source: 'integration_installation' },
      plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
      lastDevDeployment: { authority: 'unknown', reason: 'successful_dev_deployments_not_persisted' },
    },
  },
})

describe('dependency dev target identity', () => {
  let projectPath: string
  let getBot: ReturnType<typeof vi.fn>

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-dependency-target-'))
    fs.writeFileSync(
      path.join(projectPath, 'agent.json'),
      JSON.stringify({ botId: 'prod_bot', workspaceId: 'prod_ws', apiUrl: 'https://prod.example' })
    )
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'poison_bot',
        workspaceId: WORKSPACE_ID,
        apiUrl: API_URL,
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: API_URL,
        devWorkspaceId: WORKSPACE_ID,
      })
    )
    getBot = vi.fn(({ id }: { id: string }) => Promise.resolve(cloudBot(id)))
    projectMocks.load.mockReset()
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('uses the numeric target for dev dependency reads', async () => {
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_bot', devId: 'dev_opaque', devTargetBotId: '42' },
    })
    const manager = await DependencyManager.fromProject({
      projectPath,
      env: 'dev',
      client: { getBot } as any,
      apiUrl: API_URL,
      workspaceId: WORKSPACE_ID,
    })

    await manager.snapshotStateFromCloud()

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_opaque', 'dev_opaque'])
  })

  it('rejects a selected authority that does not match the raw environment link before Cloud access', async () => {
    await expect(
      DependencyManager.fromProject({
        projectPath,
        env: 'dev',
        client: { getBot } as any,
        apiUrl: 'https://foreign.example',
        workspaceId: WORKSPACE_ID,
      })
    ).rejects.toThrow(/apiUrl\/workspaceId|environment-specific project link/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it('rejects an explicit bot override that differs from the raw environment link before Cloud access', async () => {
    await expect(
      DependencyManager.fromProject({
        projectPath,
        env: 'dev',
        client: { getBot } as any,
        botId: '99',
        apiUrl: API_URL,
        workspaceId: WORKSPACE_ID,
      })
    ).rejects.toThrow(/bot.*project link|project link.*bot/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it('rejects cross-authority copy before reading Cloud or writing a target snapshot', async () => {
    const manager = new DependencyManager({
      projectPath,
      target: { env: 'prod', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: 'prod_bot' },
      client: { getBot } as any,
    })

    await expect(
      manager.copy({
        from: 'dev',
        to: 'prod',
        sourceTarget: {
          env: 'dev',
          apiUrl: 'https://foreign.example',
          workspaceId: WORKSPACE_ID,
          botId: '42',
        },
        dryRun: true,
      })
    ).rejects.toThrow(/Cross-authority dependency copy/i)

    expect(getBot).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
  })

  it('rejects copy when the raw source link authority is foreign even if sourceTarget is mislabeled', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        apiUrl: 'https://foreign.example',
        workspaceId: 'foreign_ws',
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: 'https://foreign.example',
        devWorkspaceId: 'foreign_ws',
      })
    )
    const manager = new DependencyManager({
      projectPath,
      target: { env: 'prod', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: 'prod_bot' },
      client: { getBot } as any,
    })

    await expect(
      manager.copy({
        from: 'dev',
        to: 'prod',
        sourceTarget: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
        dryRun: true,
      })
    ).rejects.toThrow(/source.*project link.*authority|apiUrl|workspaceId/i)

    expect(getBot).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'dev.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
  })

  it('rejects a dev destination copy on pure authority mismatch before dev verification network', async () => {
    const manager = new DependencyManager({
      projectPath,
      target: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
      runtimeBotId: 'dev_opaque',
      client: { getBot } as any,
    })

    await expect(
      manager.copy({
        from: 'prod',
        to: 'dev',
        sourceTarget: {
          env: 'prod',
          apiUrl: 'https://foreign.example',
          workspaceId: WORKSPACE_ID,
          botId: 'prod_bot',
        },
        dryRun: true,
      })
    ).rejects.toThrow(/Cross-authority dependency copy/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it('preserves a foreign snapshot substituted before copy rollback delete', async () => {
    const manager = new DependencyManager({
      projectPath,
      target: { env: 'prod', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: 'prod_bot' },
      client: { getBot } as any,
    })
    const snapshotPath = path.join(projectPath, '.adk', 'dependencies', 'prod.json')
    const foreignBytes = JSON.stringify({
      version: 2,
      env: 'prod',
      target: { apiUrl: 'https://foreign.example', workspaceId: WORKSPACE_ID, botId: 'prod_bot' },
      fetchedAt: '2026-07-10T00:00:00.000Z',
      integrations: {},
      plugins: {},
    })
    ;(manager as any).apply = vi.fn(async () => {
      fs.writeFileSync(snapshotPath, foreignBytes)
      throw new Error('apply failed after target write')
    })

    await expect(
      manager.copy({
        from: 'dev',
        to: 'prod',
        sourceTarget: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
        dryRun: true,
      })
    ).rejects.toThrow(/apply failed after target write/)

    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(foreignBytes)
  })

  it('accepts a trailing-slash-equivalent raw source authority during copy', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        apiUrl: `${API_URL}///`,
        workspaceId: WORKSPACE_ID,
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: `${API_URL}///`,
        devWorkspaceId: WORKSPACE_ID,
      })
    )
    const manager = new DependencyManager({
      projectPath,
      target: { env: 'prod', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: 'prod_bot' },
      client: { getBot } as any,
    })

    const result = await manager.copy({
      from: 'dev',
      to: 'prod',
      sourceTarget: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
      dryRun: true,
    })

    expect(result.dryRun).toBe(true)
    expect(getBot).toHaveBeenCalled()
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
  })

  it('rejects the same source and dev destination bot before target verification network', async () => {
    fs.writeFileSync(
      path.join(projectPath, 'agent.json'),
      JSON.stringify({ botId: '42', apiUrl: API_URL, workspaceId: WORKSPACE_ID })
    )
    const manager = new DependencyManager({
      projectPath,
      target: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
      runtimeBotId: 'dev_opaque',
      client: { getBot } as any,
    })

    await expect(
      manager.copy({
        from: 'prod',
        to: 'dev',
        sourceTarget: { env: 'prod', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
        dryRun: true,
      })
    ).rejects.toThrow(/same Cloud bot|SAME_SOURCE_TARGET/i)

    expect(getBot).not.toHaveBeenCalled()
  })

  it('does not turn a foreign snapshot into an empty successful list result', async () => {
    const snapshotPath = path.join(projectPath, '.adk', 'dependencies', 'prod.json')
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({
        version: 2,
        env: 'prod',
        target: { apiUrl: 'https://foreign.example', workspaceId: WORKSPACE_ID, botId: 'prod_bot' },
        fetchedAt: '2026-07-10T00:00:00.000Z',
        integrations: {},
        plugins: {},
      })
    )
    const before = fs.readFileSync(snapshotPath)
    const manager = new DependencyManager({
      projectPath,
      target: { env: 'prod', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: 'prod_bot' },
      client: { getBot } as any,
    })

    await expect(manager.list()).rejects.toThrow(/another target/i)

    expect(getBot).not.toHaveBeenCalled()
    expect(fs.readFileSync(snapshotPath)).toEqual(before)
  })

  it('fails dev dependency construction without a numeric target and never falls back to prod', async () => {
    fs.writeFileSync(path.join(projectPath, 'agent.local.json'), JSON.stringify({ devId: 'dev_opaque' }))
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_bot', devId: 'dev_opaque' },
    })

    await expect(
      DependencyManager.fromProject({
        projectPath,
        env: 'dev',
        client: { getBot } as any,
        apiUrl: API_URL,
        workspaceId: WORKSPACE_ID,
      })
    ).rejects.toThrow(/No dev bot ID/)
    expect(getBot).not.toHaveBeenCalled()
  })

  it('uses agent.json for prod identity and never lets local overrides select the bot', async () => {
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'poison_bot', workspaceId: 'poison_ws', apiUrl: 'http://poison.invalid' },
    })
    const relativeProjectPath = path.relative(process.cwd(), projectPath)
    const manager = await DependencyManager.fromProject({
      projectPath: relativeProjectPath,
      env: 'prod',
      client: { getBot } as any,
      apiUrl: API_URL,
      workspaceId: WORKSPACE_ID,
    })

    await manager.snapshotStateFromCloud()

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['prod_bot'])
    expect(projectMocks.load).not.toHaveBeenCalled()
    expect((manager as any).projectPath).toBe(projectPath)
  })

  it('fails dev dependency construction when the runtime tag does not match the numeric target', async () => {
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_bot', devId: 'dev_opaque', devTargetBotId: '42' },
    })
    getBot.mockResolvedValue(cloudBot('dev_opaque', '99'))

    const manager = await DependencyManager.fromProject({
      projectPath,
      env: 'dev',
      client: { getBot } as any,
      apiUrl: API_URL,
      workspaceId: WORKSPACE_ID,
    })

    await expect(manager.snapshotStateFromCloud()).rejects.toThrow(/target|tag|42|99/i)
  })

  it('uses numeric identity for mutations and opaque identity for every bot-shaped read', async () => {
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_bot', devId: 'dev_opaque', devTargetBotId: '42' },
    })
    const applyToCloud = vi.fn().mockResolvedValue(undefined)
    const manager = await DependencyManager.fromProject({
      projectPath,
      env: 'dev',
      client: { getBot } as any,
      apiUrl: API_URL,
      workspaceId: WORKSPACE_ID,
      integrationResolver: { applyToCloud } as any,
    })

    await manager.add('integration', { name: 'telegram', version: '1.0.0' })

    expect(applyToCloud).toHaveBeenCalledWith(expect.objectContaining({ botId: '42' }))
    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_opaque', 'dev_opaque'])
  })

  it('migrates dev dependencies under the numeric target, not the opaque runtime id', async () => {
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_bot', devId: 'dev_opaque', devTargetBotId: '42' },
    })
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
      runtimeBotId: 'dev_opaque',
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })

    const result = await manager.run()

    expect(result.migrated).toEqual(['dev'])
    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_opaque'])
  })

  it('rejects a missing dev target without reading opaque or prod identity as dev', async () => {
    fs.writeFileSync(path.join(projectPath, 'agent.local.json'), JSON.stringify({ devId: 'dev_opaque' }))
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_bot', devId: 'dev_opaque' },
    })
    expect(
      () =>
        new DependencyMigrationManager({
          projectPath,
          client: { getBot } as any,
          target: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '' },
          runtimeBotId: 'dev_opaque',
          integrationResolver: { applyToCloud: vi.fn() },
          pluginResolver: { applyToCloud: vi.fn() },
        })
    ).toThrow(/target|botId|non-empty/i)

    expect(getBot).not.toHaveBeenCalled()
  })
})
