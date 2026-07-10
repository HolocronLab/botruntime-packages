import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const projectMocks = vi.hoisted(() => ({ load: vi.fn() }))

vi.mock('../agent-project/agent-project.js', () => ({ AgentProject: { load: projectMocks.load } }))
vi.mock('@holocronlab/botruntime-runtime', () => ({ extractMissingRequiredFields: vi.fn(() => []) }))

import { DependencyMigrationManager } from './migration.js'

const API_URL = 'https://prod.example'
const WORKSPACE_ID = 'prod_ws'
const PROD_TARGET = {
  env: 'prod' as const,
  apiUrl: API_URL,
  workspaceId: WORKSPACE_ID,
  botId: 'prod_bot',
}
const DEV_TARGET = {
  env: 'dev' as const,
  apiUrl: API_URL,
  workspaceId: WORKSPACE_ID,
  botId: '42',
}

const legacyState = (env: 'dev' | 'prod') => ({
  version: 1,
  env,
  integrations: {
    telegram: { name: 'telegram', version: '1.0.0', enabled: true, config: {} },
  },
  plugins: {},
})

const cloudBot = (
  id: string,
  targetBotId = '42',
  options: {
    integrationAuthority?: 'authoritative' | 'unknown'
    pluginAuthority?: 'authoritative' | 'unknown'
    pluginSource?: string
    integrations?: Record<string, unknown>
    plugins?: Record<string, unknown>
  } = {}
) => ({
  bot: {
    id,
    updatedAt: '2026-07-09T00:00:00.000Z',
    dev: id === 'dev_opaque',
    tags: id === 'dev_opaque' ? { 'botruntime.devTargetBotId': targetBotId } : {},
    integrations:
      options.integrations ?? {
        telegram: {
          id: 'integration_telegram',
          installationId: 'installation_telegram',
          name: 'telegram',
          version: '1.0.0',
          enabled: true,
          configurationType: 'manual',
          configurationRevision: `sha256:${'a'.repeat(64)}`,
          status: 'registered',
          statusReason: '',
        },
      },
    plugins: options.plugins ?? {},
    devReadiness: {
      schemaVersion: 1,
      integrations:
        options.integrationAuthority === 'unknown'
          ? { authority: 'unknown', reason: 'integration_installations_not_persisted' }
          : { authority: 'authoritative', source: 'integration_installation' },
      plugins:
        options.pluginAuthority === 'unknown'
          ? { authority: 'unknown', reason: 'plugin_installations_not_persisted' }
          : { authority: 'authoritative', source: options.pluginSource ?? 'bot_definition_plugins' },
      lastDevDeployment: { authority: 'unknown', reason: 'successful_dev_deployments_not_persisted' },
    },
  },
})

const changedCloudBot = (id: string, targetBotId = '42') =>
  cloudBot(id, targetBotId, {
    integrations: {
      telegram: {
        id: 'integration_telegram',
        installationId: 'installation_telegram',
        name: 'telegram',
        version: '1.0.0',
        enabled: true,
        configurationType: 'manual',
        configurationRevision: `sha256:${'a'.repeat(64)}`,
        status: 'registered',
        statusReason: '',
      },
      linear: {
        id: 'integration_linear',
        installationId: 'installation_linear',
        name: 'linear',
        version: '2.0.0',
        enabled: true,
        configurationType: 'manual',
        configurationRevision: `sha256:${'b'.repeat(64)}`,
        status: 'registered',
        statusReason: '',
      },
    },
    plugins: {
      assistant: {
        id: '701',
        name: 'assistant',
        version: '3.0.0',
        enabled: true,
        configuration: { mode: 'safe' },
        interfaces: {
          messages: {
            integrationId: 'integration_linear',
            integrationAlias: 'linear',
            integrationInterfaceAlias: 'messages',
          },
        },
        integrations: {},
      },
    },
  })

describe('dependency migration completion marker', () => {
  let projectPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-dependency-migration-'))
    fs.writeFileSync(
      path.join(projectPath, 'agent.config.ts'),
      `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: {
    integrations: {
      telegram: 'telegram@1.0.0',
    },
  },
})
`
    )
    for (const env of ['dev', 'prod'] as const) {
      fs.writeFileSync(path.join(projectPath, `dependencies.${env}.lock.json`), JSON.stringify(legacyState(env)))
    }
    fs.writeFileSync(
      path.join(projectPath, 'agent.json'),
      JSON.stringify({ botId: 'prod_bot', workspaceId: 'prod_ws', apiUrl: 'https://prod.example' })
    )
    fs.writeFileSync(
      path.join(projectPath, 'agent.local.json'),
      JSON.stringify({
        botId: 'poison_bot',
        apiUrl: API_URL,
        workspaceId: WORKSPACE_ID,
        devId: 'dev_opaque',
        devTargetBotId: '42',
        devApiUrl: API_URL,
        devWorkspaceId: WORKSPACE_ID,
      })
    )
    projectMocks.load.mockReset()
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'prod_bot', devId: 'dev_opaque', devTargetBotId: '42' },
    })
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.clearAllMocks()
  })

  it('migrates only the selected exact target and checkpoints a v2 authority record', async () => {
    const getBot = vi.fn().mockResolvedValue(cloudBot('prod_bot'))
    const applyIntegration = vi.fn().mockResolvedValue(undefined)
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: PROD_TARGET,
      integrationResolver: { applyToCloud: applyIntegration },
      pluginResolver: { applyToCloud: vi.fn() },
    } as any)

    const result = await manager.run()

    expect(result.migrated).toEqual(['prod'])
    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['prod_bot'])
    expect(applyIntegration).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(projectPath, 'dependencies.dev.lock.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectPath, 'dependencies.prod.lock.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'migration.prod.pending.json'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'), 'utf8')))
      .toMatchObject({
        version: 2,
        records: {
          prod: {
            target: PROD_TARGET,
            completed: { integrations: ['telegram'], plugins: [] },
          },
        },
      })
  })

  it('consumes the fresh provision-before-PUT platform response and writes an empty v2 prod snapshot', async () => {
    fs.rmSync(path.join(projectPath, 'dependencies.prod.lock.json'))
    fs.rmSync(path.join(projectPath, 'agent.config.ts'))
    const getBot = vi.fn().mockResolvedValue(
      cloudBot('prod_bot', '42', { integrations: {}, plugins: {} })
    )
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: PROD_TARGET,
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    } as any)

    const result = await manager.run()

    expect(result.migrated).toEqual(['prod'])
    expect(getBot).toHaveBeenCalledWith({ id: 'prod_bot' })
    expect(JSON.parse(fs.readFileSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'), 'utf8')))
      .toMatchObject({
        version: 2,
        env: 'prod',
        target: { apiUrl: PROD_TARGET.apiUrl, workspaceId: PROD_TARGET.workspaceId, botId: PROD_TARGET.botId },
        integrations: {},
        plugins: {},
      })
  })

  it.each([
    { label: 'prod', target: PROD_TARGET, addressBotId: 'prod_bot', runtimeBotId: undefined },
    { label: 'dev', target: DEV_TARGET, addressBotId: 'dev_opaque', runtimeBotId: 'dev_opaque' },
  ])(
    'a completed $label marker still reconciles the exact Cloud target before generation can continue',
    async ({ target, addressBotId, runtimeBotId }) => {
      const getBot = vi.fn().mockResolvedValue(cloudBot(addressBotId))
      const applyIntegration = vi.fn().mockResolvedValue(undefined)
      const applyPlugin = vi.fn().mockResolvedValue(undefined)
      const manager = new DependencyMigrationManager({
        projectPath,
        client: { getBot } as any,
        target,
        ...(runtimeBotId ? { runtimeBotId } : {}),
        integrationResolver: { applyToCloud: applyIntegration },
        pluginResolver: { applyToCloud: applyPlugin },
      })

      await manager.run()
      getBot.mockReset()
      getBot.mockResolvedValue(changedCloudBot(addressBotId))
      applyIntegration.mockClear()
      applyPlugin.mockClear()

      const result = await manager.run()

      expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual([addressBotId])
      expect(applyIntegration).not.toHaveBeenCalled()
      expect(applyPlugin).not.toHaveBeenCalled()
      expect(result.skipped).toEqual([{ env: target.env, reason: 'migration already completed' }])
      expect(result.snapshotWrites).toEqual([target.env])
      expect(JSON.parse(fs.readFileSync(path.join(projectPath, '.adk', 'dependencies', `${target.env}.json`), 'utf8')))
        .toMatchObject({
          version: 2,
          env: target.env,
          target: { apiUrl: target.apiUrl, workspaceId: target.workspaceId, botId: target.botId },
          integrations: {
            linear: { name: 'linear', version: '2.0.0', enabled: true },
          },
          plugins: {
            assistant: {
              name: 'assistant',
              version: '3.0.0',
              enabled: true,
              config: { mode: 'safe' },
              dependencies: { messages: { integrationAlias: 'linear' } },
            },
          },
        })
    }
  )

  it.each([
    {
      label: 'unknown authority',
      target: PROD_TARGET,
      addressBotId: 'prod_bot',
      runtimeBotId: undefined,
      failure: cloudBot('prod_bot', '42', { pluginAuthority: 'unknown' }),
      error: /plugin.*readiness|plugin.*authority|readiness.*plugin/i,
    },
    {
      label: 'dev identity mismatch',
      target: DEV_TARGET,
      addressBotId: 'dev_opaque',
      runtimeBotId: 'dev_opaque',
      failure: cloudBot('dev_opaque', '99'),
      error: /dev target verification failed/i,
    },
    {
      label: 'network failure',
      target: PROD_TARGET,
      addressBotId: 'prod_bot',
      runtimeBotId: undefined,
      failure: new Error('completed-marker network unavailable'),
      error: /completed-marker network unavailable/i,
    },
  ])(
    'completed-marker reconciliation fails closed on $label and preserves prior snapshot bytes',
    async ({ target, addressBotId, runtimeBotId, failure, error }) => {
      const getBot = vi.fn().mockResolvedValue(cloudBot(addressBotId))
      const applyIntegration = vi.fn().mockResolvedValue(undefined)
      const applyPlugin = vi.fn().mockResolvedValue(undefined)
      const manager = new DependencyMigrationManager({
        projectPath,
        client: { getBot } as any,
        target,
        ...(runtimeBotId ? { runtimeBotId } : {}),
        integrationResolver: { applyToCloud: applyIntegration },
        pluginResolver: { applyToCloud: applyPlugin },
      })

      await manager.run()
      const snapshotPath = path.join(projectPath, '.adk', 'dependencies', `${target.env}.json`)
      const priorBytes = fs.readFileSync(snapshotPath)
      getBot.mockReset()
      if (failure instanceof Error) getBot.mockRejectedValue(failure)
      else getBot.mockResolvedValue(failure)
      applyIntegration.mockClear()
      applyPlugin.mockClear()

      await expect(manager.run()).rejects.toThrow(error)

      expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual([addressBotId])
      expect(applyIntegration).not.toHaveBeenCalled()
      expect(applyPlugin).not.toHaveBeenCalled()
      expect(fs.readFileSync(snapshotPath)).toEqual(priorBytes)
    }
  )

  it('preserves every legacy source and omits the global marker after a dev network failure', async () => {
    const getBot = vi.fn(() => Promise.reject(new Error('dev network unavailable')))
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: DEV_TARGET,
      runtimeBotId: 'dev_opaque',
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })

    await expect(manager.run()).rejects.toThrow(/dev network unavailable/i)

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_opaque'])
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'dev.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, 'dependencies.dev.lock.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectPath, 'dependencies.prod.lock.json'))).toBe(true)
    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toContain('dependencies')
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'))).toBe(false)
  })

  it('fails loud on a dev identity mismatch before touching prod and preserves every legacy source', async () => {
    const getBot = vi.fn(({ id }: { id: string }) =>
      Promise.resolve(id === 'dev_opaque' ? cloudBot('dev_opaque', '99') : cloudBot('prod_bot'))
    )
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: DEV_TARGET,
      runtimeBotId: 'dev_opaque',
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })

    await expect(manager.run()).rejects.toThrow(/dev target verification failed/i)

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['dev_opaque'])
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, 'dependencies.dev.lock.json'))).toBe(true)
    expect(fs.existsSync(path.join(projectPath, 'dependencies.prod.lock.json'))).toBe(true)
    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toContain('dependencies')
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'))).toBe(false)
  })

  it('removes legacy sources and writes the marker after both environments migrate', async () => {
    const getBot = vi.fn(({ id }: { id: string }) => Promise.resolve(cloudBot(id)))
    const prodManager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: PROD_TARGET,
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })
    const devManager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: DEV_TARGET,
      runtimeBotId: 'dev_opaque',
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })

    const prodResult = await prodManager.run()
    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toContain('dependencies')
    const devResult = await devManager.run()

    expect(prodResult.migrated).toEqual(['prod'])
    expect(devResult.migrated).toEqual(['dev'])
    expect(fs.existsSync(path.join(projectPath, 'dependencies.dev.lock.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, 'dependencies.prod.lock.json'))).toBe(false)
    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).not.toContain('dependencies')
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'))).toBe(true)
  })

  it('migrates prod from agent.json even when the merged project view is locally poisoned', async () => {
    projectMocks.load.mockResolvedValue({
      path: projectPath,
      agentInfo: { botId: 'poison_bot', devId: 'dev_opaque', devTargetBotId: '42' },
    })
    const getBot = vi.fn(({ id }: { id: string }) => Promise.resolve(cloudBot(id)))
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: PROD_TARGET,
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })

    await manager.run()

    expect(getBot.mock.calls.map(([arg]) => arg.id)).toEqual(['prod_bot'])
    expect(projectMocks.load).not.toHaveBeenCalled()
  })

  it('rejects unknown readiness even when the returned kind is empty and legacy says it was empty', async () => {
    const getBot = vi.fn().mockResolvedValue(cloudBot('prod_bot', '42', { pluginAuthority: 'unknown' }))
    const manager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: PROD_TARGET,
      integrationResolver: { applyToCloud: vi.fn() },
      pluginResolver: { applyToCloud: vi.fn() },
    })

    await expect(manager.run()).rejects.toThrow(/plugins.*readiness|plugins.*authority/i)

    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
    expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'))).toBe(false)
  })

  it.each(['plugin_installation', 'arbitrary_projection'])(
    'rejects authoritative plugin source %s before any migration commit',
    async (pluginSource) => {
      const getBot = vi.fn().mockResolvedValue(cloudBot('prod_bot', '42', { pluginSource }))
      const manager = new DependencyMigrationManager({
        projectPath,
        client: { getBot } as any,
        target: PROD_TARGET,
        integrationResolver: { applyToCloud: vi.fn() },
        pluginResolver: { applyToCloud: vi.fn() },
      })

      await expect(manager.run()).rejects.toThrow(/plugins.*readiness|plugins.*authority|bot_definition_plugins/i)
      expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
      expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'))).toBe(false)
    }
  )

  it.each(['planned', 'nonempty', 'no-legacy'] as const)(
    'rejects unknown readiness for a %s dependency kind before any local commit',
    async (variant) => {
      if (variant === 'no-legacy') {
        fs.rmSync(path.join(projectPath, 'dependencies.prod.lock.json'))
        fs.rmSync(path.join(projectPath, 'agent.config.ts'))
      }
      const plugins =
        variant === 'nonempty'
          ? {
              cloudOnly: {
                id: 'plugin_cloud_only',
                name: 'cloud-only',
                version: '1.0.0',
                enabled: true,
                configuration: {},
                interfaces: {},
              },
            }
          : {}
      const getBot = vi.fn().mockResolvedValue(
        cloudBot('prod_bot', '42', {
          integrationAuthority: variant === 'planned' ? 'unknown' : 'authoritative',
          pluginAuthority: variant === 'planned' ? 'authoritative' : 'unknown',
          plugins,
        })
      )
      const manager = new DependencyMigrationManager({
        projectPath,
        client: { getBot } as any,
        target: PROD_TARGET,
        integrationResolver: { applyToCloud: vi.fn() },
        pluginResolver: { applyToCloud: vi.fn() },
      })

      await expect(manager.run()).rejects.toThrow(/readiness|authority|cannot safely/i)

      expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'prod.json'))).toBe(false)
      expect(fs.existsSync(path.join(projectPath, '.adk', 'dependencies', 'migration.json'))).toBe(false)
    }
  )
})
