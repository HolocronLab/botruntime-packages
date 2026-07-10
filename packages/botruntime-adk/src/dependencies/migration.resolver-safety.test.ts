import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@holocronlab/botruntime-runtime', () => ({ extractMissingRequiredFields: vi.fn(() => []) }))

import { DependencyMigrationManager } from './migration.js'
import { IntegrationResolver } from './resolvers/integration-resolver.js'
import { PluginResolver } from './resolvers/plugin-resolver.js'

const TARGET = {
  env: 'prod' as const,
  apiUrl: 'https://authority.example',
  workspaceId: 'workspace_exact',
  botId: 'bot_prod',
}

type IntegrationEntry = {
  name: string
  version: string
  enabled: boolean
  config: Record<string, unknown>
  configurationType?: string
}

const cloudIntegration = (entry: IntegrationEntry): Record<string, unknown> => ({
  id: `integration_${entry.name}`,
  installationId: `installation_${entry.name}`,
  name: entry.name,
  version: entry.version,
  enabled: entry.enabled,
  configuration: entry.config,
  configurationType: entry.configurationType ?? 'manual',
  status: 'registered',
  statusReason: '',
})

const cloudBot = (integrations: Record<string, Record<string, unknown>> = {}) => ({
  bot: {
    id: TARGET.botId,
    updatedAt: '2026-07-10T00:00:00.000Z',
    dev: false,
    tags: {},
    integrations,
    plugins: {},
    devReadiness: {
      schemaVersion: 1,
      integrations: { authority: 'authoritative', source: 'integration_installation' },
      plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
      lastDevDeployment: { authority: 'unknown', reason: 'not_required_by_migration_test' },
    },
  },
})

describe('dependency migration resolver safety', () => {
  let projectPath: string

  const pendingPath = () =>
    path.join(projectPath, '.adk', 'dependencies', 'migration.prod.pending.json')

  const writeLock = (options: {
    integrations: Record<string, IntegrationEntry>
    plugins?: Record<string, unknown>
  }): void => {
    fs.writeFileSync(
      path.join(projectPath, 'dependencies.prod.lock.json'),
      `${JSON.stringify({
        version: 1,
        env: 'prod',
        integrations: options.integrations,
        plugins: options.plugins ?? {},
      })}\n`
    )
  }

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-migration-resolver-safety-'))
    fs.writeFileSync(
      path.join(projectPath, 'agent.json'),
      `${JSON.stringify({
        botId: TARGET.botId,
        apiUrl: TARGET.apiUrl,
        workspaceId: TARGET.workspaceId,
      })}\n`
    )
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('preserves configurationType in the exact integration update payload', async () => {
    const updateBot = vi.fn(async () => undefined)
    const resolver = new IntegrationResolver({
      registry: { getSpec: vi.fn(async () => ({ id: 'integration_exact' })) } as any,
      client: { updateBot } as any,
    })

    await resolver.applyToCloud({
      botId: TARGET.botId,
      alias: 'chat',
      entry: {
        name: 'chat',
        version: '1.2.3',
        enabled: true,
        config: { endpoint: 'https://chat.example' },
        configurationType: 'oauth',
      },
    })

    expect(updateBot).toHaveBeenCalledWith({
      id: TARGET.botId,
      integrations: {
        chat: {
          integrationId: 'integration_exact',
          enabled: true,
          configurationType: 'oauth',
          configuration: { endpoint: 'https://chat.example' },
        },
      },
    })
  })

  it('resolves the full ordered integration plan before journal creation or the first update', async () => {
    writeLock({
      integrations: {
        a_good: { name: 'good', version: '1.0.0', enabled: true, config: {} },
        z_bad: { name: 'bad', version: '1.0.0', enabled: true, config: {} },
      },
    })
    const getSpec = vi.fn(async (name: string) => {
      if (name === 'bad') throw new Error('late integration resolution failure')
      return { id: `integration_${name}` }
    })
    const updateBot = vi.fn(async () => undefined)
    const client = { getBot: vi.fn(async () => cloudBot()), updateBot }
    const integrationResolver = new IntegrationResolver({ registry: { getSpec } as any, client: client as any })

    const manager = new DependencyMigrationManager({
      projectPath,
      client: client as any,
      target: TARGET,
      integrationResolver,
      pluginResolver: { applyToCloud: vi.fn() },
    })

    await expect(manager.run()).rejects.toThrow(/late integration resolution failure/i)

    expect(getSpec.mock.calls.map(([name]) => name)).toEqual(['good', 'bad'])
    expect(updateBot).not.toHaveBeenCalled()
    expect(fs.existsSync(pendingPath())).toBe(false)
  })

  it('validates plugins before any prepared integration update or journal creation', async () => {
    writeLock({
      integrations: {
        chat: { name: 'chat', version: '1.0.0', enabled: true, config: {} },
      },
      plugins: {
        toolkit: {
          name: 'toolkit',
          version: '2.0.0',
          enabled: true,
          config: {},
          dependencies: {},
        },
      },
    })
    const updateBot = vi.fn(async () => undefined)
    const client = { getBot: vi.fn(async () => cloudBot()), updateBot }
    const integrationRegistry = { getSpec: vi.fn(async () => ({ id: 'integration_chat' })) }
    const integrationResolver = new IntegrationResolver({
      registry: integrationRegistry as any,
      client: client as any,
    })
    const pluginResolver = new PluginResolver({
      registry: {
        getSpec: vi.fn(async () => ({
          id: 'plugin_toolkit',
          dependencies: { interfaces: { messages: { name: 'messaging' } } },
        })),
      } as any,
      integrationRegistry: integrationRegistry as any,
      client: client as any,
    })

    const manager = new DependencyMigrationManager({
      projectPath,
      client: client as any,
      target: TARGET,
      integrationResolver,
      pluginResolver,
    })

    await expect(manager.run()).rejects.toThrow(/missing dependency.*messages/i)

    expect(updateBot).not.toHaveBeenCalled()
    expect(fs.existsSync(pendingPath())).toBe(false)
  })

  it('prepares every remaining operation in an existing journal before any retry update', async () => {
    const entries = {
      a_done: { name: 'done', version: '1.0.0', enabled: true, config: {} },
      b_good: { name: 'good', version: '1.0.0', enabled: true, config: {} },
      z_bad: { name: 'bad', version: '1.0.0', enabled: true, config: {} },
    }
    writeLock({ integrations: entries })
    const installed: Record<string, Record<string, unknown>> = {}
    const seedApply = vi.fn(async ({ alias, entry }: { alias: string; entry: IntegrationEntry }) => {
      if (alias === 'b_good') throw new Error('seed partial journal')
      installed[alias] = cloudIntegration(entry)
    })
    const getBot = vi.fn(async () => cloudBot(installed))
    const seedManager = new DependencyMigrationManager({
      projectPath,
      client: { getBot } as any,
      target: TARGET,
      integrationResolver: { applyToCloud: seedApply },
      pluginResolver: { applyToCloud: vi.fn() },
    })
    await expect(seedManager.run()).rejects.toThrow(/seed partial journal/i)
    const pendingRaw = fs.readFileSync(pendingPath(), 'utf8')
    expect(JSON.parse(pendingRaw).completed.integrations).toEqual(['a_done'])

    const getSpec = vi.fn(async (name: string) => {
      if (name === 'bad') throw new Error('remaining integration resolution failure')
      return { id: `integration_${name}` }
    })
    const updateBot = vi.fn(async () => undefined)
    const retryClient = { getBot, updateBot }
    const retryManager = new DependencyMigrationManager({
      projectPath,
      client: retryClient as any,
      target: TARGET,
      integrationResolver: new IntegrationResolver({
        registry: { getSpec } as any,
        client: retryClient as any,
      }),
      pluginResolver: { applyToCloud: vi.fn() },
    })

    await expect(retryManager.run()).rejects.toThrow(/remaining integration resolution failure/i)

    expect(getSpec.mock.calls.map(([name]) => name)).toEqual(['good', 'bad'])
    expect(updateBot).not.toHaveBeenCalled()
    expect(fs.readFileSync(pendingPath(), 'utf8')).toBe(pendingRaw)
  })
})
