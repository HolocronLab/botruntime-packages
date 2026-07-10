import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { refreshCompletedDependencySnapshot } from './completed-snapshot-refresh.js'
import { DependencySnapshotStore } from './snapshot-store.js'

const TARGET = {
  env: 'prod' as const,
  apiUrl: 'https://refresh.example',
  workspaceId: 'workspace_exact',
  botId: 'bot_exact',
}

function cloudBot(version: string) {
  return {
    bot: {
      id: TARGET.botId,
      updatedAt: '2026-07-10T00:00:00.000Z',
      dev: false,
      tags: {},
      integrations: {
        telegram: {
          id: 'integration_telegram',
          installationId: 'installation_telegram',
          name: 'telegram',
          version,
          enabled: true,
          configurationType: 'manual',
          configurationRevision: `sha256:${'a'.repeat(64)}`,
          status: 'registered',
          statusReason: '',
        },
      },
      plugins: {},
      devReadiness: {
        schemaVersion: 1,
        integrations: { authority: 'authoritative', source: 'integration_installation' },
        plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
        lastDevDeployment: { authority: 'unknown', reason: 'not_required_by_refresh_test' },
      },
    },
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

describe('completed dependency snapshot refresh', () => {
  let projectPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-completed-refresh-'))
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('returns not-initialized without Cloud access when the exact target has no completion record', async () => {
    const getBot = vi.fn()

    await expect(
      refreshCompletedDependencySnapshot({
        projectPath,
        client: { getBot } as any,
        target: TARGET,
      })
    ).resolves.toEqual({ status: 'not-initialized' })

    expect(getBot).not.toHaveBeenCalled()
  })

  it('uses the migration mutex as a barrier so a late old GET cannot overwrite a newer refresh', async () => {
    const store = new DependencySnapshotStore({ projectPath })
    await store.commitMigrationCompletion({
      target: TARGET,
      provenance: { kind: 'cloud' },
      plan: { integrations: [], plugins: [] },
      completed: { integrations: [], plugins: [] },
      completedAt: '2026-07-10T00:00:00.000Z',
    })

    const oldReadEntered = deferred()
    const releaseOldRead = deferred()
    const oldGetBot = vi.fn(async () => {
      oldReadEntered.resolve()
      await releaseOldRead.promise
      return cloudBot('1.0.0')
    })
    const newerGetBot = vi.fn(async () => cloudBot('2.0.0'))

    const oldRefresh = refreshCompletedDependencySnapshot({
      projectPath,
      client: { getBot: oldGetBot } as any,
      target: TARGET,
    })
    await oldReadEntered.promise

    await expect(
      refreshCompletedDependencySnapshot({
        projectPath,
        client: { getBot: newerGetBot } as any,
        target: TARGET,
      })
    ).rejects.toThrow(/migration.*(lock|already running|active)/i)
    expect(newerGetBot).not.toHaveBeenCalled()

    releaseOldRead.resolve()
    await expect(oldRefresh).resolves.toEqual({ status: 'refreshed' })

    await expect(
      refreshCompletedDependencySnapshot({
        projectPath,
        client: { getBot: newerGetBot } as any,
        target: TARGET,
      })
    ).resolves.toEqual({ status: 'refreshed' })

    expect((await store.read(TARGET))?.integrations.telegram?.version).toBe('2.0.0')
  })

  it('requires authoritative readiness and preserves the prior snapshot bytes on rejection', async () => {
    const store = new DependencySnapshotStore({ projectPath })
    await store.commitMigrationCompletion({
      target: TARGET,
      provenance: { kind: 'cloud' },
      plan: { integrations: [], plugins: [] },
      completed: { integrations: [], plugins: [] },
      completedAt: '2026-07-10T00:00:00.000Z',
    })
    await store.write(TARGET, {
      version: 2,
      env: 'prod',
      target: { apiUrl: TARGET.apiUrl, workspaceId: TARGET.workspaceId, botId: TARGET.botId },
      fetchedAt: '2026-07-10T00:00:00.000Z',
      integrations: {},
      plugins: {},
    })
    const snapshotPath = store.getSnapshotPath('prod')
    const priorBytes = fs.readFileSync(snapshotPath)
    const response = cloudBot('2.0.0')
    response.bot.devReadiness.plugins = {
      authority: 'unknown',
      reason: 'plugin_projection_unavailable',
    } as any

    await expect(
      refreshCompletedDependencySnapshot({
        projectPath,
        client: { getBot: vi.fn().mockResolvedValue(response) } as any,
        target: TARGET,
      })
    ).rejects.toThrow(/plugin.*(readiness|authority)|readiness.*plugin/i)

    expect(fs.readFileSync(snapshotPath)).toEqual(priorBytes)
  })
})
