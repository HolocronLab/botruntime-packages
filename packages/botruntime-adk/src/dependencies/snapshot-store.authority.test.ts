import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as snapshotModule from './snapshot-store.js'

type Target = {
  env: 'dev' | 'prod'
  apiUrl: string
  workspaceId: string
  botId: string
}

const TARGET: Target = {
  env: 'dev',
  apiUrl: 'https://stack-a.example',
  workspaceId: '900719925474099312345',
  botId: '900719925474099398765',
}

function v2Snapshot(target: Target, marker = 'A') {
  return {
    version: 2,
    env: target.env,
    target: {
      apiUrl: target.apiUrl.replace(/\/+$/, ''),
      workspaceId: target.workspaceId,
      botId: target.botId,
    },
    fetchedAt: '2026-07-10T00:00:00.000Z',
    integrations: {
      telegram: {
        name: `telegram-${marker}`,
        version: '1.0.0',
        enabled: true,
        config: {},
      },
    },
    plugins: {},
  }
}

function v1Snapshot(botId = TARGET.botId) {
  return {
    version: 1,
    env: 'dev',
    botId,
    fetchedAt: '2026-07-10T00:00:00.000Z',
    integrations: {},
    plugins: {},
  }
}

describe('DependencySnapshotStore authority scope', () => {
  let projectPath: string
  let store: snapshotModule.DependencySnapshotStore
  let snapshotPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-snapshot-authority-'))
    store = new snapshotModule.DependencySnapshotStore({ projectPath })
    snapshotPath = store.getSnapshotPath('dev')
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('normalizes only trailing API slashes while preserving opaque IDs exactly', () => {
    const normalize = (snapshotModule as any).normalizeDependencySnapshotTarget as (target: Target) => Target

    expect(normalize({ ...TARGET, apiUrl: 'https://stack-a.example///' })).toEqual(TARGET)
  })

  it.each([
    ['blank apiUrl', { ...TARGET, apiUrl: '' }],
    ['blank workspaceId', { ...TARGET, workspaceId: '   ' }],
    ['blank botId', { ...TARGET, botId: '' }],
  ])('rejects %s in the expected target', (_label, target) => {
    const normalize = (snapshotModule as any).normalizeDependencySnapshotTarget as (target: Target) => Target

    expect(() => normalize(target)).toThrow(/target|apiUrl|workspaceId|botId/i)
  })

  it('rejects a legacy v1 snapshot instead of consuming it or returning empty', async () => {
    fs.writeFileSync(snapshotPath, JSON.stringify(v1Snapshot()))

    await expect((store as any).read(TARGET)).rejects.toThrow(/snapshot.*version|legacy|refresh/i)
  })

  it.each([
    ['env', { ...TARGET, env: 'prod' as const }],
    ['apiUrl', { ...TARGET, apiUrl: 'https://stack-b.example' }],
    ['workspaceId', { ...TARGET, workspaceId: '900719925474099312346' }],
  ])('rejects the same bot ID from another %s authority', async (_field, foreignTarget) => {
    fs.writeFileSync(snapshotPath, JSON.stringify(v2Snapshot(foreignTarget, 'FOREIGN')))

    await expect((store as any).read(TARGET)).rejects.toThrow(/snapshot.*target|authority|refresh/i)
  })

  it('rejects a persisted non-canonical API URL instead of normalizing repository bytes silently', async () => {
    const snapshot = v2Snapshot(TARGET)
    snapshot.target.apiUrl = 'https://stack-a.example/'
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot))

    await expect((store as any).read(TARGET)).rejects.toThrow(/snapshot.*apiUrl|canonical|refresh/i)
  })

  it('requires an expected target on every public read, write, and refresh operation', async () => {
    await expect((store as any).read()).rejects.toThrow(/target/i)
    await expect((store as any).write(v2Snapshot(TARGET))).rejects.toThrow(/target/i)
    await expect((store as any).refreshFromCloud({ client: { getBot: vi.fn() } })).rejects.toThrow(/target/i)
  })

  it('rejects write(target, snapshot) when the snapshot target differs', async () => {
    const foreign = v2Snapshot({ ...TARGET, apiUrl: 'https://stack-b.example' }, 'FOREIGN')

    await expect((store as any).write(TARGET, foreign)).rejects.toThrow(/snapshot.*target|authority/i)
    expect(fs.existsSync(snapshotPath)).toBe(false)
  })

  it.each([
    ['foreign v2', () => JSON.stringify(v2Snapshot({ ...TARGET, apiUrl: 'https://stack-b.example' }, 'FOREIGN'))],
    ['legacy v1', () => JSON.stringify(v1Snapshot())],
    ['corrupt JSON', () => '{not-json'],
  ])('preserves exact bytes when delete(target) finds %s data', async (_label, bytesFactory) => {
    const bytes = bytesFactory()
    fs.writeFileSync(snapshotPath, bytes)

    await expect(store.delete(TARGET)).rejects.toThrow(/snapshot|legacy|corrupt|target/i)

    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(bytes)
    expect(fs.readdirSync(path.dirname(snapshotPath)).sort()).toEqual(['dev.json'])
  })

  it('deletes only a matching target snapshot and treats a missing file as a no-op', async () => {
    fs.writeFileSync(snapshotPath, JSON.stringify(v2Snapshot(TARGET)))

    await store.delete(TARGET)
    expect(fs.existsSync(snapshotPath)).toBe(false)
    await expect(store.delete(TARGET)).resolves.toBeUndefined()
  })

  it('accepts a slash-equivalent target and preserves IDs beyond Number.MAX_SAFE_INTEGER', async () => {
    fs.writeFileSync(snapshotPath, JSON.stringify(v2Snapshot(TARGET)))

    const snapshot = await (store as any).read({ ...TARGET, apiUrl: 'https://stack-a.example/' })

    expect(snapshot.target).toEqual({
      apiUrl: 'https://stack-a.example',
      workspaceId: '900719925474099312345',
      botId: '900719925474099398765',
    })
  })

  it('does not use a v1 or foreign previous snapshot when Cloud readiness authority is unknown', async () => {
    const previousBytes = JSON.stringify({
      ...v1Snapshot(),
      integrations: {
        poisoned: { name: 'foreign', version: '9.9.9', enabled: true, config: { poison: true } },
      },
    })
    fs.writeFileSync(snapshotPath, previousBytes)
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: {
          id: 'dev_runtime',
          dev: true,
          tags: { 'botruntime.devTargetBotId': TARGET.botId },
          updatedAt: '2026-07-10T01:00:00.000Z',
          integrations: {},
          plugins: {},
          devReadiness: {
            schemaVersion: 1,
            lastDevDeployment: { authority: 'unknown', reason: 'not_deployed' },
            integrations: { authority: 'unknown', reason: 'not_available' },
            plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
          },
        },
      }),
    }

    await expect(
      (store as any).refreshFromCloud({ client, target: TARGET, runtimeBotId: 'dev_runtime' })
    ).rejects.toThrow(
      /authority.*unknown|readiness/i
    )
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(previousBytes)
  })

  it('rejects a foreign previous snapshot in the exported converter before unknown-authority reuse', () => {
    const foreignPrevious = v2Snapshot({ ...TARGET, apiUrl: 'https://stack-b.example' }, 'FOREIGN')
    const bot = {
      id: 'dev_runtime',
      integrations: {},
      plugins: {},
      devReadiness: {
        schemaVersion: 1,
        lastDevDeployment: { authority: 'unknown', reason: 'not_deployed' },
        integrations: { authority: 'unknown', reason: 'not_available' },
        plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
      },
    }

    expect(() =>
      snapshotModule.dependencySnapshotFromBot({
        bot: bot as any,
        target: TARGET,
        fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
        previous: foreignPrevious,
      })
    ).toThrow(/previous.*target|another target|authority/i)
  })

  it('rejects a forged v1 previous even when it carries a matching target object', () => {
    const forgedPrevious = {
      ...v1Snapshot(),
      target: v2Snapshot(TARGET).target,
      integrations: {
        poisoned: { name: 'poisoned', version: '9.9.9', enabled: true, config: { poison: true } },
      },
    }
    const bot = {
      id: 'dev_runtime',
      integrations: {},
      plugins: {},
      devReadiness: {
        schemaVersion: 1,
        lastDevDeployment: { authority: 'unknown', reason: 'not_deployed' },
        integrations: { authority: 'unknown', reason: 'not_available' },
        plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
      },
    }

    expect(() =>
      snapshotModule.dependencySnapshotFromBot({
        bot: bot as any,
        target: TARGET,
        fetchedAt: new Date('2026-07-10T01:00:00.000Z'),
        previous: forgedPrevious as any,
      })
    ).toThrow(/version|literal|2/i)
  })

  it('requires an explicit dev runtime id before fetching Cloud', async () => {
    const client = { getBot: vi.fn() }

    await expect(store.refreshFromCloud({ client: client as any, target: TARGET })).rejects.toThrow(
      /runtimeBotId|dev runtime/i
    )
    expect(client.getBot).not.toHaveBeenCalled()
  })

  it('rejects a dev runtime response bound to another target and preserves prior bytes', async () => {
    const previousBytes = JSON.stringify(v2Snapshot(TARGET))
    fs.writeFileSync(snapshotPath, previousBytes)
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: {
          id: 'dev_runtime',
          dev: true,
          tags: { 'botruntime.devTargetBotId': '99' },
          integrations: {},
          plugins: {},
          devReadiness: {
            schemaVersion: 1,
            lastDevDeployment: { authority: 'unknown', reason: 'not_deployed' },
            integrations: { authority: 'authoritative', source: 'integration_installation' },
            plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
          },
        },
      }),
    }

    await expect(
      store.refreshFromCloud({ client: client as any, target: TARGET, runtimeBotId: 'dev_runtime' })
    ).rejects.toThrow(/target|tag|99/i)
    expect(client.getBot).toHaveBeenCalledWith({ id: 'dev_runtime' })
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(previousBytes)
  })

  it('rejects runtimeBotId for prod before Cloud and requires the exact target address', async () => {
    const prodTarget: Target = { ...TARGET, env: 'prod', botId: 'prod_exact' }
    const client = { getBot: vi.fn() }

    await expect(
      store.refreshFromCloud({ client: client as any, target: prodTarget, runtimeBotId: 'foreign_runtime' })
    ).rejects.toThrow(/prod.*target\.botId|runtimeBotId/i)
    expect(client.getBot).not.toHaveBeenCalled()
  })

  it('rejects a mismatched prod response without rewriting prior bytes', async () => {
    const prodTarget: Target = { ...TARGET, env: 'prod', botId: 'prod_exact' }
    const prodPath = store.getSnapshotPath('prod')
    const previousBytes = JSON.stringify(v2Snapshot(prodTarget))
    fs.writeFileSync(prodPath, previousBytes)
    const client = {
      getBot: vi.fn().mockResolvedValue({
        bot: {
          id: 'other_prod',
          integrations: {},
          plugins: {},
          devReadiness: {
            schemaVersion: 1,
            lastDevDeployment: { authority: 'unknown', reason: 'not_deployed' },
            integrations: { authority: 'authoritative', source: 'integration_installation' },
            plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
          },
        },
      }),
    }

    await expect(store.refreshFromCloud({ client: client as any, target: prodTarget })).rejects.toThrow(
      /other_prod|prod_exact|exact target/i
    )
    expect(client.getBot).toHaveBeenCalledWith({ id: 'prod_exact' })
    expect(fs.readFileSync(prodPath, 'utf8')).toBe(previousBytes)
  })

  it('preserves prior bytes when the exact Cloud fetch fails', async () => {
    const previousBytes = JSON.stringify(v2Snapshot(TARGET))
    fs.writeFileSync(snapshotPath, previousBytes)
    const client = { getBot: vi.fn().mockRejectedValue(new Error('network down')) }

    await expect(
      (store as any).refreshFromCloud({ client, target: TARGET, runtimeBotId: 'dev_runtime' })
    ).rejects.toThrow(/network down/)
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(previousBytes)
  })

  it('replaces a legacy v1 snapshot only after a successful authoritative fetch', async () => {
    const previousBytes = JSON.stringify(v1Snapshot())
    fs.writeFileSync(snapshotPath, previousBytes)
    const client = {
      getBot: vi.fn().mockImplementation(async () => {
        expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(previousBytes)
        return {
          bot: {
            id: 'dev_runtime',
            dev: true,
            tags: { 'botruntime.devTargetBotId': TARGET.botId },
            updatedAt: '2026-07-10T01:00:00.000Z',
            integrations: {},
            plugins: {},
            devReadiness: {
              schemaVersion: 1,
              lastDevDeployment: { authority: 'authoritative', revision: 'revision-1' },
              integrations: { authority: 'authoritative', source: 'integration_installation' },
              plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
            },
          },
        }
      }),
    }

    const refreshed = await (store as any).refreshFromCloud({
      client,
      target: TARGET,
      runtimeBotId: 'dev_runtime',
    })

    expect(refreshed).toMatchObject({ version: 2, env: 'dev', target: v2Snapshot(TARGET).target })
    expect(JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))).toMatchObject({
      version: 2,
      env: 'dev',
      target: v2Snapshot(TARGET).target,
    })
  })
})
