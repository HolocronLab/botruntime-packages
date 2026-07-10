import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DependencySnapshotStore, dependencySnapshotFromBot } from './snapshot-store.js'
import type { DependencySnapshotData, DependencySnapshotTarget } from './types.js'

const REVISION_A = `sha256:${'a'.repeat(64)}`
const REVISION_B = `sha256:${'b'.repeat(64)}`
const OLD_TIME = new Date('2001-01-01T00:00:00.000Z')
const TARGET: DependencySnapshotTarget = {
  env: 'dev',
  apiUrl: 'https://authority.example',
  workspaceId: 'workspace_exact',
  botId: '42',
}

function previousSnapshot(): DependencySnapshotData {
  return {
    version: 2,
    env: 'dev',
    target: {
      apiUrl: 'https://authority.example',
      workspaceId: 'workspace_exact',
      botId: '42',
    },
    fetchedAt: '2026-07-10T00:00:00.000Z',
    botUpdatedAt: '2026-07-10T00:00:00.000Z',
    integrations: {
      telegram: {
        name: 'telegram',
        version: '1.0.0',
        enabled: true,
        config: { delivery: { mode: 'threaded' } },
        configurationType: 'manual',
        configurationRevision: REVISION_A,
        cloudId: '17',
        cloudAlias: 'telegram',
      },
    },
    plugins: {
      audit: {
        name: 'audit-plugin',
        version: '2.0.0',
        enabled: true,
        config: { level: 'strict' },
        dependencies: {},
        cloudId: '31',
        cloudAlias: 'audit',
      },
    },
  }
}

function cloudBot(opts: {
  integrationAuthority?: 'authoritative' | 'unknown' | 'omitted'
  pluginAuthority?: 'authoritative' | 'unknown' | 'omitted'
  integrations?: Record<string, Record<string, unknown>>
  plugins?: Record<string, Record<string, unknown>>
  schemaVersion?: number
  pluginSource?: string
} = {}): any {
  const integrationAuthority = opts.integrationAuthority ?? 'authoritative'
  const pluginAuthority = opts.pluginAuthority ?? 'unknown'
  const devReadiness: Record<string, unknown> = {
    schemaVersion: opts.schemaVersion ?? 1,
    lastDevDeployment: {
      authority: 'unknown',
      reason: 'successful_dev_deployments_not_persisted',
    },
  }
  if (integrationAuthority !== 'omitted') {
    devReadiness.integrations =
      integrationAuthority === 'authoritative'
        ? { authority: 'authoritative', source: 'integration_installation' }
        : { authority: 'unknown', reason: 'integration_store_unavailable' }
  }
  if (pluginAuthority !== 'omitted') {
    devReadiness.plugins =
      pluginAuthority === 'authoritative'
        ? { authority: 'authoritative', source: opts.pluginSource ?? 'bot_definition_plugins' }
        : { authority: 'unknown', reason: 'plugin_installations_not_persisted' }
  }
  return {
    id: 'dev_opaque',
    dev: true,
    tags: { 'botruntime.devTargetBotId': TARGET.botId },
    updatedAt: '2026-07-10T00:00:00.000Z',
    integrations: opts.integrations ?? {},
    plugins: opts.plugins ?? {},
    devReadiness,
  }
}

function cloudIntegration(configurationRevision = REVISION_A): Record<string, unknown> {
  return {
    id: '17',
    installationId: '91',
    name: 'telegram',
    version: '1.0.0',
    enabled: true,
    configurationType: 'manual',
    configurationRevision,
    status: 'registered',
    statusReason: '',
  }
}

function cloudPlugin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: '31',
    name: 'audit-plugin',
    version: '2.0.0',
    enabled: true,
    configuration: { level: 'strict' },
    interfaces: {},
    integrations: {},
    ...overrides,
  }
}

describe('DependencySnapshotStore readiness refresh', () => {
  let projectPath: string
  let store: DependencySnapshotStore

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-readiness-snapshot-'))
    store = new DependencySnapshotStore({ projectPath })
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
  })

  it('copies the safe configurationRevision and preserves private local config omitted by Cloud', () => {
    const snapshot = dependencySnapshotFromBot({
      bot: cloudBot({ integrations: { telegram: cloudIntegration() } }),
      target: TARGET,
      fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
      previous: previousSnapshot(),
    })

    expect(snapshot.integrations.telegram.configurationRevision).toBe(REVISION_A)
    expect(snapshot.integrations.telegram.config).toEqual({ delivery: { mode: 'threaded' } })
  })

  it('creates a fresh v2 snapshot from authoritative empty projections without legacy state', async () => {
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: cloudBot({ pluginAuthority: 'authoritative', integrations: {}, plugins: {} }),
      }),
    }

    const refreshed = await store.refreshFromCloud({
      client: client as any,
      target: TARGET,
      runtimeBotId: 'dev_opaque',
    })

    expect(refreshed).toMatchObject({
      version: 2,
      env: 'dev',
      target: { apiUrl: TARGET.apiUrl, workspaceId: TARGET.workspaceId, botId: TARGET.botId },
      integrations: {},
      plugins: {},
    })
    expect(JSON.parse(fs.readFileSync(store.getSnapshotPath('dev'), 'utf8'))).toMatchObject({
      version: 2,
      integrations: {},
      plugins: {},
    })
  })

  it('round-trips a strict authoritative plugin projection', () => {
    const snapshot = dependencySnapshotFromBot({
      bot: cloudBot({
        pluginAuthority: 'authoritative',
        plugins: { audit: cloudPlugin() },
      }),
      target: TARGET,
      fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
      previous: null,
    })

    expect(snapshot.plugins.audit).toEqual({
      name: 'audit-plugin',
      version: '2.0.0',
      enabled: true,
      config: { level: 'strict' },
      dependencies: {},
      cloudId: '31',
      cloudAlias: 'audit',
    })
  })

  it('preserves the exact validated Cloud plugin alias and combines interface plus direct integration bindings', () => {
    const snapshot = dependencySnapshotFromBot({
      bot: cloudBot({
        pluginAuthority: 'authoritative',
        plugins: {
          'custom-alias': cloudPlugin({
            name: 'different-plugin-name',
            interfaces: {
              messageEvents: {
                integrationId: 'integration_telegram',
                integrationAlias: 'workspace-main/telegram-main',
                integrationInterfaceAlias: 'messageEvents',
              },
            },
            integrations: {
              auditStream: {
                integrationId: 'integration_audit',
                integrationAlias: 'audit-main',
              },
            },
          }),
        },
      }),
      target: TARGET,
      fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
      previous: null,
    })

    expect(Object.keys(snapshot.plugins)).toEqual(['custom-alias'])
    expect(snapshot.plugins['custom-alias']).toMatchObject({
      name: 'different-plugin-name',
      cloudAlias: 'custom-alias',
      dependencies: {
        messageEvents: { integrationAlias: 'workspace-main/telegram-main' },
        auditStream: { integrationAlias: 'audit-main' },
      },
    })
    expect(snapshot.plugins['different-plugin-name']).toBeUndefined()
  })

  it('rejects duplicate dependency keys across plugin interfaces and direct integrations', () => {
    expect(() =>
      dependencySnapshotFromBot({
        bot: cloudBot({
          pluginAuthority: 'authoritative',
          plugins: {
            'custom-alias': cloudPlugin({
              interfaces: {
                sharedKey: {
                  integrationId: 'integration_a',
                  integrationAlias: 'integration-a',
                  integrationInterfaceAlias: 'messages',
                },
              },
              integrations: {
                sharedKey: { integrationId: 'integration_b', integrationAlias: 'integration-b' },
              },
            }),
          },
        }),
        target: TARGET,
        fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
        previous: null,
      })
    ).toThrow(/duplicate|sharedKey|interfaces.*integrations/i)
  })

  it.each(['a', 'A-valid', `a${'b'.repeat(100)}`, 'prototype'])(
    'rejects noncanonical authoritative plugin alias %s',
    (alias) => {
      expect(() =>
        dependencySnapshotFromBot({
          bot: cloudBot({ pluginAuthority: 'authoritative', plugins: { [alias]: cloudPlugin() } }),
          target: TARGET,
          fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
          previous: null,
        })
      ).toThrow(/plugin alias/i)
    }
  )

  it.each([
    ['id', (row: Record<string, unknown>) => delete row.id],
    ['name', (row: Record<string, unknown>) => delete row.name],
    ['version', (row: Record<string, unknown>) => delete row.version],
    ['enabled', (row: Record<string, unknown>) => delete row.enabled],
    ['configuration', (row: Record<string, unknown>) => (row.configuration = [])],
    ['interfaces', (row: Record<string, unknown>) => (row.interfaces = [])],
    [
      'interface mapping',
      (row: Record<string, unknown>) =>
        (row.interfaces = { ticket: { integrationAlias: 42 } }),
    ],
  ] as const)('rejects an authoritative plugin row with invalid %s without rewriting', async (field, mutate) => {
    await store.write(TARGET, previousSnapshot())
    const snapshotPath = store.getSnapshotPath('dev')
    fs.utimesSync(snapshotPath, OLD_TIME, OLD_TIME)
    const before = fs.readFileSync(snapshotPath)
    const beforeMtime = fs.statSync(snapshotPath).mtimeMs
    const row = cloudPlugin()
    mutate(row)
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: cloudBot({ pluginAuthority: 'authoritative', plugins: { audit: row } }),
      }),
    }

    await expect(
      store.refreshFromCloud({ client: client as any, target: TARGET, runtimeBotId: 'dev_opaque' })
    ).rejects.toThrow(new RegExp(field, 'i'))
    expect(fs.readFileSync(snapshotPath)).toEqual(before)
    expect(fs.statSync(snapshotPath).mtimeMs).toBe(beforeMtime)
  })

  it.each(['plugin_installation', 'arbitrary_projection'])(
    'rejects authoritative plugin source %s without creating state',
    async (pluginSource) => {
      const client = {
        getBot: vi.fn().mockResolvedValue({
          bot: cloudBot({ pluginAuthority: 'authoritative', pluginSource, plugins: {} }),
        }),
      }

      await expect(
        store.refreshFromCloud({ client: client as any, target: TARGET, runtimeBotId: 'dev_opaque' })
      ).rejects.toThrow(/plugin.*source|bot_definition_plugins/i)
      expect(fs.existsSync(store.getSnapshotPath('dev'))).toBe(false)
    }
  )

  it.each([
    ['id', (row: Record<string, unknown>) => delete row.id],
    ['installationId', (row: Record<string, unknown>) => delete row.installationId],
    ['configurationRevision', (row: Record<string, unknown>) => (row.configurationRevision = 'sha256:INVALID')],
    ['status', (row: Record<string, unknown>) => (row.status = 'active')],
    ['statusReason', (row: Record<string, unknown>) => delete row.statusReason],
  ] as const)('rejects an authoritative integration row with invalid %s without rewriting', async (field, mutate) => {
    await store.write(TARGET, previousSnapshot())
    const snapshotPath = store.getSnapshotPath('dev')
    fs.utimesSync(snapshotPath, OLD_TIME, OLD_TIME)
    const before = fs.readFileSync(snapshotPath)
    const beforeMtime = fs.statSync(snapshotPath).mtimeMs
    const row = cloudIntegration()
    mutate(row)
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: cloudBot({ integrations: { telegram: row } }),
      }),
    }

    await expect(
      store.refreshFromCloud({ client: client as any, target: TARGET, runtimeBotId: 'dev_opaque' })
    ).rejects.toThrow(
      new RegExp(field, 'i')
    )
    expect(fs.readFileSync(snapshotPath)).toEqual(before)
    expect(fs.statSync(snapshotPath).mtimeMs).toBe(beforeMtime)
  })

  it('matches an opaque Cloud alias by persisted cloudAlias plus identity and revision, preserving the right config', () => {
    const previous = previousSnapshot()
    previous.integrations.telegram.cloudAlias = 'opaque:91'
    previous.integrations.telegram.config = { selected: 'wrong' }
    previous.integrations.secondary = {
      ...previous.integrations.telegram,
      cloudAlias: 'opaque:92',
      cloudId: '18',
      configurationRevision: REVISION_B,
      config: { selected: 'right' },
    }
    const snapshot = dependencySnapshotFromBot({
      bot: cloudBot({
        integrations: {
          'opaque:92': {
            ...cloudIntegration(REVISION_B),
            id: '18',
            installationId: '92',
          },
        },
      }),
      target: TARGET,
      fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
      previous,
    })

    expect(Object.keys(snapshot.integrations)).toEqual(['secondary'])
    expect(snapshot.integrations.secondary.cloudAlias).toBe('opaque:92')
    expect(snapshot.integrations.secondary.config).toEqual({ selected: 'right' })
  })

  it.each(['unknown', 'omitted'] as const)(
    'preserves previous integration and plugin maps byte-for-byte when authority is %s',
    async (authority) => {
      await store.write(TARGET, previousSnapshot())
      const snapshotPath = store.getSnapshotPath('dev')
      fs.utimesSync(snapshotPath, OLD_TIME, OLD_TIME)
      const before = fs.readFileSync(snapshotPath)
      const beforeMtime = fs.statSync(snapshotPath).mtimeMs
      const client = {
        getBot: vi.fn().mockResolvedValue({
          bot: cloudBot({ integrationAuthority: authority, pluginAuthority: authority }),
        }),
      }

      const refreshed = await store.refreshFromCloud({
        client: client as any,
        target: TARGET,
        runtimeBotId: 'dev_opaque',
      })

      expect(refreshed.integrations).toEqual(previousSnapshot().integrations)
      expect(refreshed.plugins).toEqual(previousSnapshot().plugins)
      expect(fs.readFileSync(snapshotPath)).toEqual(before)
      expect(fs.statSync(snapshotPath).mtimeMs).toBe(beforeMtime)
    }
  )

  it('fails closed and creates no snapshot when authority is unknown and there is no previous state', async () => {
    const snapshotPath = store.getSnapshotPath('dev')
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: cloudBot({ integrationAuthority: 'unknown', pluginAuthority: 'unknown' }),
      }),
    }

    await expect(
      store.refreshFromCloud({ client: client as any, target: TARGET, runtimeBotId: 'dev_opaque' })
    ).rejects.toThrow(
      /authority/i
    )
    expect(fs.existsSync(snapshotPath)).toBe(false)
  })

  it('clears an authoritative-empty integration map but preserves unknown plugins', async () => {
    await store.write(TARGET, previousSnapshot())
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: cloudBot({ integrations: {}, pluginAuthority: 'unknown' }),
      }),
    }

    const refreshed = await store.refreshFromCloud({
      client: client as any,
      target: TARGET,
      runtimeBotId: 'dev_opaque',
    })

    expect(refreshed.integrations).toEqual({})
    expect(refreshed.plugins).toEqual(previousSnapshot().plugins)
  })

  it('rejects malformed authority metadata without changing existing snapshot bytes or mtime', async () => {
    await store.write(TARGET, previousSnapshot())
    const snapshotPath = store.getSnapshotPath('dev')
    fs.utimesSync(snapshotPath, OLD_TIME, OLD_TIME)
    const before = fs.readFileSync(snapshotPath)
    const beforeMtime = fs.statSync(snapshotPath).mtimeMs
    const client = {
      getBot: vi.fn().mockResolvedValue({ bot: cloudBot({ schemaVersion: 0, integrations: {} }) }),
    }

    await expect(
      store.refreshFromCloud({ client: client as any, target: TARGET, runtimeBotId: 'dev_opaque' })
    ).rejects.toThrow(
      /schemaVersion|authority/i
    )
    expect(fs.readFileSync(snapshotPath)).toEqual(before)
    expect(fs.statSync(snapshotPath).mtimeMs).toBe(beforeMtime)
  })

  it('does not rewrite an unchanged authoritative revision', async () => {
    await store.write(TARGET, previousSnapshot())
    const snapshotPath = store.getSnapshotPath('dev')
    fs.utimesSync(snapshotPath, OLD_TIME, OLD_TIME)
    const before = fs.readFileSync(snapshotPath)
    const beforeMtime = fs.statSync(snapshotPath).mtimeMs
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: cloudBot({ integrations: { telegram: cloudIntegration(REVISION_A) } }),
      }),
    }

    const refreshed = await store.refreshFromCloud({
      client: client as any,
      target: TARGET,
      runtimeBotId: 'dev_opaque',
    })

    expect(refreshed.integrations.telegram.configurationRevision).toBe(REVISION_A)
    expect(fs.readFileSync(snapshotPath)).toEqual(before)
    expect(fs.statSync(snapshotPath).mtimeMs).toBe(beforeMtime)
  })

  it('atomically rewrites a normal refresh when the authoritative revision changes', async () => {
    await store.write(TARGET, previousSnapshot())
    const snapshotPath = store.getSnapshotPath('dev')
    fs.utimesSync(snapshotPath, OLD_TIME, OLD_TIME)
    const before = fs.readFileSync(snapshotPath)
    const beforeMtime = fs.statSync(snapshotPath).mtimeMs
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: cloudBot({ integrations: { telegram: cloudIntegration(REVISION_B) } }),
      }),
    }

    const refreshed = await store.refreshFromCloud({
      client: client as any,
      target: TARGET,
      runtimeBotId: 'dev_opaque',
    })

    expect(refreshed.integrations.telegram.configurationRevision).toBe(REVISION_B)
    expect(fs.readFileSync(snapshotPath)).not.toEqual(before)
    expect(fs.statSync(snapshotPath).mtimeMs).toBeGreaterThan(beforeMtime)
  })
})
