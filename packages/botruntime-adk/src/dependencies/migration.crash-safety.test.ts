import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsProbe = vi.hoisted(() => ({
  events: [] as Array<{ operation: 'rename' | 'unlink'; path: string; ok: boolean }>,
  failUnlinkSuffix: undefined as string | undefined,
  failUnlinkCount: 0,
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    rename: async (from: fs.PathLike, to: fs.PathLike) => {
      const destination = String(to)
      fsProbe.events.push({ operation: 'rename', path: destination, ok: true })
      return actual.rename(from, to)
    },
    unlink: async (filePath: fs.PathLike) => {
      const value = String(filePath)
      if (
        fsProbe.failUnlinkSuffix &&
        value.endsWith(fsProbe.failUnlinkSuffix) &&
        fsProbe.failUnlinkCount > 0
      ) {
        fsProbe.failUnlinkCount -= 1
        fsProbe.events.push({ operation: 'unlink', path: value, ok: false })
        throw Object.assign(new Error(`injected unlink failure for ${value}`), { code: 'EACCES' })
      }
      fsProbe.events.push({ operation: 'unlink', path: value, ok: true })
      return actual.unlink(filePath)
    },
  }
})

vi.mock('@holocronlab/botruntime-runtime', () => ({ extractMissingRequiredFields: vi.fn(() => []) }))

import { DependencyMigrationManager } from './migration.js'

type Environment = 'dev' | 'prod'
type Target = { env: Environment; apiUrl: string; workspaceId: string; botId: string }
type LegacyIntegration = {
  name: string
  version: string
  enabled: boolean
  config: Record<string, unknown>
}
type LegacyPlugin = {
  name: string
  version: string
  enabled: boolean
  config: Record<string, unknown>
  dependencies: Record<string, { integrationAlias: string }>
}
type LegacyState = {
  version: 1
  env: Environment
  integrations: Record<string, LegacyIntegration>
  plugins: Record<string, LegacyPlugin>
}

const TARGET: Target = {
  env: 'prod',
  apiUrl: 'https://authority.example',
  workspaceId: 'workspace_exact',
  botId: 'bot_prod',
}
const DEV_TARGET: Target = {
  env: 'dev',
  apiUrl: TARGET.apiUrl,
  workspaceId: TARGET.workspaceId,
  botId: '42',
}
const SHA256_RE = /^sha256:[0-9a-f]{64}$/

function digest(raw: string): string {
  return `sha256:${crypto.createHash('sha256').update(raw).digest('hex')}`
}

function legacyState(
  aliases: string[] = ['alias1', 'alias2'],
  env: Environment = 'prod'
): LegacyState {
  return {
    version: 1,
    env,
    integrations: Object.fromEntries(
      aliases.map((alias, index) => [
        alias,
        {
          name: `integration-${index + 1}`,
          version: `${index + 1}.0.0`,
          enabled: true,
          config: { ordinal: index + 1 },
        },
      ])
    ),
    plugins: {},
  }
}

function cloudBot(
  target: Target,
  state: LegacyState,
  installedIntegrations: Iterable<string>,
  installedPlugins: Iterable<string>,
  runtimeBotId?: string
): any {
  const integrations = Object.fromEntries(
    [...installedIntegrations].map((alias) => {
      const entry = state.integrations[alias]!
      return [
        alias,
        {
          id: `integration_${alias}`,
          installationId: `installation_${alias}`,
          name: entry.name,
          version: entry.version,
          enabled: entry.enabled,
          configuration: entry.config,
          configurationType: 'manual',
          configurationRevision: digest(JSON.stringify(entry.config)),
          status: 'registered',
          statusReason: '',
        },
      ]
    })
  )
  const plugins = Object.fromEntries(
    [...installedPlugins].map((alias, index) => {
      const entry = state.plugins[alias]!
      return [
        alias,
        {
          id: String(index + 1),
          name: entry.name,
          version: entry.version,
          enabled: entry.enabled,
          configuration: entry.config,
          interfaces: Object.fromEntries(
            Object.entries(entry.dependencies).map(([interfaceAlias, mapping]) => [
              interfaceAlias,
              {
                integrationId: `integration_${mapping.integrationAlias}`,
                integrationAlias: mapping.integrationAlias,
                integrationInterfaceAlias: interfaceAlias,
              },
            ])
          ),
          integrations: {},
        },
      ]
    })
  )

  return {
    bot: {
      id: runtimeBotId ?? target.botId,
      updatedAt: '2026-07-10T00:00:00.000Z',
      dev: target.env === 'dev',
      tags: target.env === 'dev' ? { 'botruntime.devTargetBotId': target.botId } : {},
      integrations,
      plugins,
      devReadiness: {
        schemaVersion: 1,
        integrations: { authority: 'authoritative', source: 'integration_installation' },
        plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
        lastDevDeployment: { authority: 'unknown', reason: 'not_required_by_migration_test' },
      },
    },
  }
}

describe('dependency migration crash safety and authority', () => {
  let projectPath: string

  const dependenciesDir = () => path.join(projectPath, '.adk', 'dependencies')
  const lockPath = (env: Environment = 'prod') => path.join(projectPath, `dependencies.${env}.lock.json`)
  const pendingPath = (env: Environment = 'prod') =>
    path.join(dependenciesDir(), `migration.${env}.pending.json`)
  const markerPath = () => path.join(dependenciesDir(), 'migration.json')
  const snapshotPath = (env: Environment = 'prod') => path.join(dependenciesDir(), `${env}.json`)

  const writeRaw = (filePath: string, raw: string): void => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, raw)
  }

  const writeJson = (filePath: string, value: unknown): string => {
    const raw = `${JSON.stringify(value, null, 2)}\n`
    writeRaw(filePath, raw)
    return raw
  }

  const readJson = (filePath: string): any => JSON.parse(fs.readFileSync(filePath, 'utf8'))

  const writeLock = (state: LegacyState = legacyState()): { raw: string; digest: string } => {
    const raw = writeJson(lockPath(state.env), state)
    return { raw, digest: digest(raw) }
  }

  const makeManager = (opts: {
    target?: Target
    runtimeBotId?: string
    getBot: ReturnType<typeof vi.fn>
    integrationApply?: ReturnType<typeof vi.fn>
    pluginApply?: ReturnType<typeof vi.fn>
  }): DependencyMigrationManager =>
    new DependencyMigrationManager({
      projectPath,
      client: { getBot: opts.getBot } as any,
      target: opts.target ?? TARGET,
      ...(opts.runtimeBotId ? { runtimeBotId: opts.runtimeBotId } : {}),
      integrationResolver: { applyToCloud: opts.integrationApply ?? vi.fn() },
      pluginResolver: { applyToCloud: opts.pluginApply ?? vi.fn() },
    } as any)

  const eventIndex = (operation: 'rename' | 'unlink', suffix: string, ok = true): number =>
    fsProbe.events.findIndex(
      (event) => event.operation === operation && event.ok === ok && event.path.endsWith(suffix)
    )

  const assertPendingPlan = (opts: {
    pending: any
    target?: Target
    sources: Array<{ kind: 'lock' | 'agentConfig'; digest: string }>
    integrations: string[]
    plugins?: string[]
    completedIntegrations: string[]
    completedPlugins?: string[]
  }): void => {
    expect(opts.pending).toMatchObject({
      version: 2,
      target: opts.target ?? TARGET,
      sources: opts.sources,
      plan: {
        integrations: opts.integrations,
        plugins: opts.plugins ?? [],
      },
      completed: {
        integrations: opts.completedIntegrations,
        plugins: opts.completedPlugins ?? [],
      },
      createdAt: expect.any(String),
      updatedAt: expect.any(String),
    })
    expect(opts.pending.plan.digest).toMatch(SHA256_RE)
  }

  const assertLegacyMarkerRecord = (opts: {
    marker: any
    target?: Target
    sources: Array<{ kind: 'lock' | 'agentConfig'; digest: string }>
    planDigest: string
    integrations: string[]
    plugins?: string[]
  }): void => {
    const record = opts.marker.records[(opts.target ?? TARGET).env]
    expect(record).toMatchObject({
      target: opts.target ?? TARGET,
      provenance: {
        kind: 'legacy',
        sources: opts.sources,
        planDigest: opts.planDigest,
      },
      plan: { integrations: opts.integrations, plugins: opts.plugins ?? [] },
      completed: { integrations: opts.integrations, plugins: opts.plugins ?? [] },
      completedAt: expect.any(String),
    })
  }

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-migration-crash-safety-'))
    writeJson(path.join(projectPath, 'agent.json'), {
      botId: TARGET.botId,
      apiUrl: TARGET.apiUrl,
      workspaceId: TARGET.workspaceId,
    })
    fsProbe.events.length = 0
    fsProbe.failUnlinkSuffix = undefined
    fsProbe.failUnlinkCount = 0
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    fsProbe.events.length = 0
    fsProbe.failUnlinkSuffix = undefined
    fsProbe.failUnlinkCount = 0
    vi.restoreAllMocks()
  })

  it('journals each successful alias and resumes without duplicate Cloud writes in crash-safe commit order', async () => {
    const state = legacyState()
    const source = writeLock(state)
    const installed = new Set<string>()
    let failAlias2 = true
    const integrationApply = vi.fn(async ({ alias }: { alias: string }) => {
      if (alias === 'alias2' && failAlias2) throw new Error('injected alias2 failure')
      installed.add(alias)
    })
    const pluginApply = vi.fn()
    const getBot = vi.fn(async () => cloudBot(TARGET, state, installed, []))

    await expect(
      makeManager({ getBot, integrationApply, pluginApply }).run()
    ).rejects.toThrow(/alias2 failure/i)

    const firstPendingRaw = fs.readFileSync(pendingPath(), 'utf8')
    const firstPending = JSON.parse(firstPendingRaw)
    assertPendingPlan({
      pending: firstPending,
      sources: [{ kind: 'lock', digest: source.digest }],
      integrations: ['alias1', 'alias2'],
      completedIntegrations: ['alias1'],
    })
    expect(fs.readFileSync(lockPath(), 'utf8')).toBe(source.raw)
    expect(fs.existsSync(snapshotPath())).toBe(false)
    expect(fs.existsSync(markerPath())).toBe(false)

    failAlias2 = false
    fsProbe.events.length = 0
    await makeManager({ getBot, integrationApply, pluginApply }).run()

    expect(integrationApply.mock.calls.map(([arg]) => arg.alias)).toEqual(['alias1', 'alias2', 'alias2'])
    expect(pluginApply).not.toHaveBeenCalled()
    expect(fs.existsSync(pendingPath())).toBe(false)
    expect(fs.existsSync(lockPath())).toBe(false)
    expect(readJson(snapshotPath())).toMatchObject({
      version: 2,
      env: 'prod',
      target: { apiUrl: TARGET.apiUrl, workspaceId: TARGET.workspaceId, botId: TARGET.botId },
    })

    const marker = readJson(markerPath())
    expect(marker.version).toBe(2)
    assertLegacyMarkerRecord({
      marker,
      sources: [{ kind: 'lock', digest: source.digest }],
      planDigest: firstPending.plan.digest,
      integrations: ['alias1', 'alias2'],
    })

    const snapshotCommit = eventIndex('rename', `${path.sep}prod.json`)
    const markerCommit = eventIndex('rename', `${path.sep}migration.json`)
    const pendingDelete = eventIndex('unlink', `${path.sep}migration.prod.pending.json`)
    const cleanup = eventIndex('unlink', `${path.sep}dependencies.prod.lock.json`)
    expect([snapshotCommit, markerCommit, pendingDelete, cleanup].every((index) => index >= 0)).toBe(true)
    expect(snapshotCommit).toBeLessThan(markerCommit)
    expect(markerCommit).toBeLessThan(pendingDelete)
    expect(pendingDelete).toBeLessThan(cleanup)
  })

  it('does not repeat completed imports when the post-import Cloud GET failed', async () => {
    const state = legacyState()
    const source = writeLock(state)
    const installed = new Set<string>()
    const integrationApply = vi.fn(async ({ alias }: { alias: string }) => installed.add(alias))
    const getBot = vi.fn(async () => {
      if (getBot.mock.calls.length === 2) throw new Error('injected post-import GET failure')
      return cloudBot(TARGET, state, installed, [])
    })

    await makeManager({ getBot, integrationApply }).run().catch(() => undefined)

    const pending = readJson(pendingPath())
    assertPendingPlan({
      pending,
      sources: [{ kind: 'lock', digest: source.digest }],
      integrations: ['alias1', 'alias2'],
      completedIntegrations: ['alias1', 'alias2'],
    })
    expect(integrationApply).toHaveBeenCalledTimes(2)
    expect(fs.existsSync(snapshotPath())).toBe(false)
    expect(fs.existsSync(markerPath())).toBe(false)
    expect(fs.readFileSync(lockPath(), 'utf8')).toBe(source.raw)

    await makeManager({ getBot, integrationApply }).run()

    expect(integrationApply).toHaveBeenCalledTimes(2)
    expect(fs.existsSync(pendingPath())).toBe(false)
    expect(fs.existsSync(snapshotPath())).toBe(true)
    expect(fs.existsSync(markerPath())).toBe(true)
    expect(fs.existsSync(lockPath())).toBe(false)
  })

  it.each(['foreign', 'v1', 'corrupt'] as const)(
    'rejects a %s pending journal before Cloud and preserves its exact bytes',
    async (variant) => {
      const state = legacyState()
      const source = writeLock(state)
      const installed = new Set<string>()
      let failAlias2 = true
      const integrationApply = vi.fn(async ({ alias }: { alias: string }) => {
        if (alias === 'alias2' && failAlias2) throw new Error('seed pending')
        installed.add(alias)
      })
      const getBot = vi.fn(async () => cloudBot(TARGET, state, installed, []))
      await makeManager({ getBot, integrationApply }).run().catch(() => undefined)

      const valid = readJson(pendingPath())
      const raw =
        variant === 'corrupt'
          ? '{not-json\n'
          : `${JSON.stringify(
              variant === 'v1'
                ? { ...valid, version: 1 }
                : { ...valid, target: { ...valid.target, workspaceId: 'workspace_foreign' } },
              null,
              2
            )}\n`
      writeRaw(pendingPath(), raw)
      const cloudCalls = getBot.mock.calls.length
      const applyCalls = integrationApply.mock.calls.length
      failAlias2 = false

      await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(
        /migration\.prod\.pending|pending journal/i
      )

      expect(getBot).toHaveBeenCalledTimes(cloudCalls)
      expect(integrationApply).toHaveBeenCalledTimes(applyCalls)
      expect(fs.readFileSync(pendingPath(), 'utf8')).toBe(raw)
      expect(fs.readFileSync(lockPath(), 'utf8')).toBe(source.raw)
      expect(fs.existsSync(snapshotPath())).toBe(false)
      expect(fs.existsSync(markerPath())).toBe(false)
    }
  )

  it.each(['changed', 'missing'] as const)(
    'fails before Cloud when the legacy lock is %s after a pending journal was created',
    async (variant) => {
      const state = legacyState()
      writeLock(state)
      const installed = new Set<string>()
      let failAlias2 = true
      const integrationApply = vi.fn(async ({ alias }: { alias: string }) => {
        if (alias === 'alias2' && failAlias2) throw new Error('seed pending')
        installed.add(alias)
      })
      const getBot = vi.fn(async () => cloudBot(TARGET, state, installed, []))
      await makeManager({ getBot, integrationApply }).run().catch(() => undefined)
      const pendingRaw = fs.readFileSync(pendingPath(), 'utf8')
      const cloudCalls = getBot.mock.calls.length
      const applyCalls = integrationApply.mock.calls.length

      if (variant === 'changed') fs.appendFileSync(lockPath(), ' ')
      else fs.rmSync(lockPath())
      failAlias2 = false

      await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(
        /legacy.*(changed|missing)|source.*(changed|missing)|digest mismatch/i
      )
      expect(getBot).toHaveBeenCalledTimes(cloudCalls)
      expect(integrationApply).toHaveBeenCalledTimes(applyCalls)
      expect(fs.readFileSync(pendingPath(), 'utf8')).toBe(pendingRaw)
      expect(fs.existsSync(snapshotPath())).toBe(false)
      expect(fs.existsSync(markerPath())).toBe(false)
    }
  )

  it.each([
    [
      'dynamic dependencies object',
      `const dynamicDependencies = { integrations: { telegram: 'telegram@1.0.0' } }\n\nexport default defineConfig({ dependencies: dynamicDependencies })`,
    ],
    [
      'dynamic dependency version',
      `const version = 'telegram@1.0.0'\n\nexport default defineConfig({ dependencies: { integrations: { telegram: version } } })`,
    ],
  ])('fails loud on %s with zero Cloud writes and zero cleanup', async (_label, body) => {
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'\n\n${body}\n`
    writeRaw(path.join(projectPath, 'agent.config.ts'), configRaw)
    const getBot = vi.fn()
    const integrationApply = vi.fn()
    const pluginApply = vi.fn()

    await expect(makeManager({ getBot, integrationApply, pluginApply }).run()).rejects.toThrow(
      /dependencies.*(literal|static|dynamic|parse)/i
    )

    expect(getBot).not.toHaveBeenCalled()
    expect(integrationApply).not.toHaveBeenCalled()
    expect(pluginApply).not.toHaveBeenCalled()
    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toBe(configRaw)
    expect(fs.existsSync(pendingPath())).toBe(false)
    expect(fs.existsSync(snapshotPath())).toBe(false)
    expect(fs.existsSync(markerPath())).toBe(false)
  })

  it('merges disjoint lock and literal agent.config plans and preserves every literal field', async () => {
    const lockState = legacyState(['fromlock'])
    const lock = writeLock(lockState)
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: {
    integrations: {
      fromconfig: {
        version: '@scope/telegram@1.2.3',
        enabled: false,
        config: { token: 'opaque', nested: { mode: 'strict' } },
      },
      shorthand: 'plain-chat@3.0.0',
    },
    plugins: {
      toolkit: {
        version: 'toolkit@2.0.0',
        config: { feature: 'enabled' },
        dependencies: { chat: { integrationAlias: 'fromconfig' } },
      },
    },
  },
})
`
    writeRaw(path.join(projectPath, 'agent.config.ts'), configRaw)
    const configDigest = digest(configRaw)
    const mergedState: LegacyState = {
      version: 1,
      env: 'prod',
      integrations: {
        ...lockState.integrations,
        fromconfig: {
          name: '@scope/telegram',
          version: '1.2.3',
          enabled: false,
          config: { token: 'opaque', nested: { mode: 'strict' } },
        },
        shorthand: {
          name: 'plain-chat',
          version: '3.0.0',
          enabled: false,
          config: {},
        },
      },
      plugins: {
        toolkit: {
          name: 'toolkit',
          version: '2.0.0',
          enabled: true,
          config: { feature: 'enabled' },
          dependencies: { chat: { integrationAlias: 'fromconfig' } },
        },
      },
    }
    const installedIntegrations = new Set<string>()
    const installedPlugins = new Set<string>()
    const integrationApply = vi.fn(async ({ alias }: { alias: string }) => installedIntegrations.add(alias))
    const pluginApply = vi.fn(async ({ alias }: { alias: string }) => installedPlugins.add(alias))
    const getBot = vi.fn(async () =>
      cloudBot(TARGET, mergedState, installedIntegrations, installedPlugins)
    )

    await makeManager({ getBot, integrationApply, pluginApply }).run()

    expect(integrationApply.mock.calls.map(([arg]) => arg.alias)).toEqual([
      'fromconfig',
      'fromlock',
      'shorthand',
    ])
    expect(integrationApply).toHaveBeenCalledWith({
      botId: TARGET.botId,
      alias: 'fromconfig',
      entry: mergedState.integrations.fromconfig,
    })
    expect(integrationApply).toHaveBeenCalledWith({
      botId: TARGET.botId,
      alias: 'shorthand',
      entry: mergedState.integrations.shorthand,
    })
    expect(pluginApply).toHaveBeenCalledWith({
      botId: TARGET.botId,
      alias: 'toolkit',
      entry: mergedState.plugins.toolkit,
      state: mergedState,
    })

    const snapshot = readJson(snapshotPath())
    expect(snapshot.integrations.fromconfig).toMatchObject(mergedState.integrations.fromconfig)
    expect(snapshot.plugins.toolkit).toMatchObject(mergedState.plugins.toolkit)
    expect(fs.existsSync(lockPath())).toBe(false)
    // agent.config is shared by dev and prod; one exact marker record is not enough to clean it.
    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toBe(configRaw)

    const marker = readJson(markerPath())
    const sources = [
      { kind: 'agentConfig' as const, digest: configDigest },
      { kind: 'lock' as const, digest: lock.digest },
    ]
    expect(marker.records.prod.provenance.sources).toEqual(sources)
    expect(marker.records.prod.plan).toEqual({
      integrations: ['fromconfig', 'fromlock', 'shorthand'],
      plugins: ['toolkit'],
    })
    expect(marker.records.prod.completed).toEqual(marker.records.prod.plan)
  })

  it('rejects a same-alias lock/config conflict before Cloud and preserves both sources byte-for-byte', async () => {
    const lockState = legacyState(['shared'])
    const lock = writeLock(lockState)
    const configRaw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: { integrations: { shared: 'other-integration@9.9.9' } },
})
`
    writeRaw(path.join(projectPath, 'agent.config.ts'), configRaw)
    const getBot = vi.fn()
    const integrationApply = vi.fn()

    await expect(makeManager({ getBot, integrationApply }).run()).rejects.toThrow(/shared.*conflict|conflict.*shared/i)

    expect(getBot).not.toHaveBeenCalled()
    expect(integrationApply).not.toHaveBeenCalled()
    expect(fs.readFileSync(lockPath(), 'utf8')).toBe(lock.raw)
    expect(fs.readFileSync(path.join(projectPath, 'agent.config.ts'), 'utf8')).toBe(configRaw)
    expect(fs.existsSync(pendingPath())).toBe(false)
    expect(fs.existsSync(snapshotPath())).toBe(false)
    expect(fs.existsSync(markerPath())).toBe(false)
  })

  it.each(['foreign', 'v1', 'corrupt'] as const)(
    'does not count a %s marker and preserves its exact bytes while exact Cloud authority is unavailable',
    async (variant) => {
      const state = legacyState(['alias1'])
      const source = writeLock(state)
      const installed = new Set<string>()
      const integrationApply = vi.fn(async ({ alias }: { alias: string }) => installed.add(alias))
      const seedGetBot = vi.fn(async () => cloudBot(TARGET, state, installed, []))
      await makeManager({ getBot: seedGetBot, integrationApply }).run()
      const valid = readJson(markerPath())
      writeRaw(lockPath(), source.raw)

      const raw =
        variant === 'corrupt'
          ? '{broken-marker\n'
          : `${JSON.stringify(
              variant === 'v1'
                ? { ...valid, version: 1 }
                : {
                    ...valid,
                    records: {
                      ...valid.records,
                      prod: {
                        ...valid.records.prod,
                        target: { ...valid.records.prod.target, workspaceId: 'workspace_foreign' },
                      },
                    },
                  },
              null,
              2
            )}\n`
      writeRaw(markerPath(), raw)
      const getBot = vi.fn(async () => {
        throw new Error('exact Cloud authority unavailable')
      })
      const retryApply = vi.fn()

      await makeManager({ getBot, integrationApply: retryApply }).run().catch(() => undefined)

      expect(getBot).toHaveBeenCalledTimes(1)
      expect(retryApply).not.toHaveBeenCalled()
      expect(fs.readFileSync(markerPath(), 'utf8')).toBe(raw)
      expect(fs.readFileSync(lockPath(), 'utf8')).toBe(source.raw)
      expect(fs.existsSync(snapshotPath())).toBe(true)
    }
  )

  it('merges the selected environment into the global v2 marker without changing another exact record', async () => {
    const state = legacyState(['alias1'])
    const source = writeLock(state)
    const devRecord = {
      target: DEV_TARGET,
      provenance: { kind: 'cloud' },
      plan: { integrations: [], plugins: [] },
      completed: { integrations: [], plugins: [] },
      completedAt: '2026-07-09T00:00:00.000Z',
    }
    writeJson(markerPath(), { version: 2, records: { dev: devRecord } })
    const installed = new Set<string>()
    const integrationApply = vi.fn(async ({ alias }: { alias: string }) => installed.add(alias))
    const getBot = vi.fn(async () => cloudBot(TARGET, state, installed, []))

    await makeManager({ getBot, integrationApply }).run()

    const marker = readJson(markerPath())
    expect(marker).toMatchObject({ version: 2, records: { dev: devRecord } })
    expect(marker.records.dev).toEqual(devRecord)
    expect(marker.records.prod.target).toEqual(TARGET)
    expect(marker.records.prod.provenance).toMatchObject({
      kind: 'legacy',
      sources: [{ kind: 'lock', digest: source.digest }],
    })
    expect(integrationApply).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(lockPath())).toBe(false)
  })

  it('commits marker and removes pending before cleanup, then retries cleanup without Cloud writes', async () => {
    const state = legacyState(['alias1'])
    const source = writeLock(state)
    const installed = new Set<string>()
    const integrationApply = vi.fn(async ({ alias }: { alias: string }) => installed.add(alias))
    const getBot = vi.fn(async () => cloudBot(TARGET, state, installed, []))
    fsProbe.failUnlinkSuffix = 'dependencies.prod.lock.json'
    fsProbe.failUnlinkCount = 1

    await makeManager({ getBot, integrationApply }).run().catch(() => undefined)

    expect(fs.existsSync(markerPath())).toBe(true)
    expect(fs.existsSync(snapshotPath())).toBe(true)
    expect(fs.existsSync(pendingPath())).toBe(false)
    expect(fs.readFileSync(lockPath(), 'utf8')).toBe(source.raw)
    const markerCommit = eventIndex('rename', `${path.sep}migration.json`)
    const pendingDelete = eventIndex('unlink', `${path.sep}migration.prod.pending.json`)
    const failedCleanup = eventIndex('unlink', `${path.sep}dependencies.prod.lock.json`, false)
    expect(markerCommit).toBeGreaterThanOrEqual(0)
    expect(pendingDelete).toBeGreaterThan(markerCommit)
    expect(failedCleanup).toBeGreaterThan(pendingDelete)

    const markerRaw = fs.readFileSync(markerPath(), 'utf8')
    const cloudCalls = getBot.mock.calls.length
    const applyCalls = integrationApply.mock.calls.length
    fsProbe.failUnlinkSuffix = undefined
    fsProbe.failUnlinkCount = 0

    await makeManager({ getBot, integrationApply }).run()

    expect(getBot).toHaveBeenCalledTimes(cloudCalls + 1)
    expect(getBot).toHaveBeenLastCalledWith({ id: TARGET.botId })
    expect(integrationApply).toHaveBeenCalledTimes(applyCalls)
    expect(fs.existsSync(lockPath())).toBe(false)
    expect(fs.readFileSync(markerPath(), 'utf8')).toBe(markerRaw)
  })
})
