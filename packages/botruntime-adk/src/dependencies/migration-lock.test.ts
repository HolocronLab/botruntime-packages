import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const fsProbe = vi.hoisted(() => ({
  directFinalLockOpens: [] as string[],
  lockPublications: [] as string[],
  failPendingCheckpointCount: 0,
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    open: async (filePath: fs.PathLike, flags: string | number, mode?: number) => {
      const value = String(filePath)
      if (value.endsWith(`${path.sep}migration.lock`) && String(flags).includes('x')) {
        fsProbe.directFinalLockOpens.push(String(flags))
      }
      return actual.open(filePath, flags as any, mode)
    },
    link: async (existingPath: fs.PathLike, newPath: fs.PathLike) => {
      if (String(newPath).endsWith(`${path.sep}migration.lock`)) {
        fsProbe.lockPublications.push(await actual.readFile(existingPath, 'utf8'))
      }
      return actual.link(existingPath, newPath)
    },
    rename: async (oldPath: fs.PathLike, newPath: fs.PathLike) => {
      if (
        String(newPath).endsWith(`${path.sep}migration.prod.pending.json`) &&
        fsProbe.failPendingCheckpointCount > 0
      ) {
        fsProbe.failPendingCheckpointCount -= 1
        throw Object.assign(new Error('injected pending checkpoint failure'), { code: 'EIO' })
      }
      return actual.rename(oldPath, newPath)
    },
  }
})

vi.mock('@holocronlab/botruntime-runtime', () => ({ extractMissingRequiredFields: vi.fn(() => []) }))

import { DependencyMigrationManager } from './migration.js'
import { IntegrationResolver } from './resolvers/integration-resolver.js'

type Environment = 'dev' | 'prod'
type Target = { env: Environment; apiUrl: string; workspaceId: string; botId: string }
type IntegrationEntry = {
  name: string
  version: string
  enabled: boolean
  config: Record<string, unknown>
}
type LegacyState = {
  version: 1
  env: Environment
  integrations: Record<string, IntegrationEntry>
  plugins: Record<string, never>
}

const PROD_TARGET: Target = {
  env: 'prod',
  apiUrl: 'https://authority.example',
  workspaceId: 'workspace_exact',
  botId: 'bot_prod',
}
const DEV_TARGET: Target = {
  env: 'dev',
  apiUrl: PROD_TARGET.apiUrl,
  workspaceId: PROD_TARGET.workspaceId,
  botId: '42',
}
const DEV_RUNTIME_BOT_ID = 'dev_runtime_exact'

function legacyState(aliases: string[], env: Environment = 'prod'): LegacyState {
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

function cloudIntegration(entry: IntegrationEntry, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `integration_${entry.name}`,
    installationId: `installation_${entry.name}`,
    name: entry.name,
    version: entry.version,
    enabled: entry.enabled,
    configuration: entry.config,
    configurationType: 'manual',
    configurationRevision: `sha256:${crypto
      .createHash('sha256')
      .update(JSON.stringify(entry.config))
      .digest('hex')}`,
    status: 'registered',
    statusReason: '',
    ...overrides,
  }
}

function cloudBot(opts: {
  target: Target
  runtimeBotId?: string
  integrations?: Record<string, Record<string, unknown>>
  integrationAuthority?: 'authoritative' | 'unknown'
}): any {
  const integrationAuthority = opts.integrationAuthority ?? 'authoritative'
  return {
    bot: {
      id: opts.runtimeBotId ?? opts.target.botId,
      updatedAt: '2026-07-10T00:00:00.000Z',
      dev: opts.target.env === 'dev',
      tags:
        opts.target.env === 'dev'
          ? { 'botruntime.devTargetBotId': opts.target.botId }
          : {},
      integrations: opts.integrations ?? {},
      plugins: {},
      devReadiness: {
        schemaVersion: 1,
        integrations:
          integrationAuthority === 'authoritative'
            ? { authority: 'authoritative', source: 'integration_installation' }
            : { authority: 'unknown', reason: 'integration_installations_not_persisted' },
        plugins: { authority: 'authoritative', source: 'bot_definition_plugins' },
        lastDevDeployment: { authority: 'unknown', reason: 'not_required_by_migration_test' },
      },
    },
  }
}

function lockOwner(overrides: Partial<Record<'version' | 'token' | 'pid' | 'hostname' | 'startedAt', unknown>> = {}) {
  return {
    version: 1,
    token: crypto.randomUUID(),
    pid: process.pid,
    hostname: os.hostname(),
    startedAt: new Date().toISOString(),
    ...overrides,
  }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

async function waitForGateOrFailure(run: Promise<unknown>, gate: Promise<void>): Promise<void> {
  const outcome = await Promise.race([
    gate.then(() => ({ kind: 'entered' as const })),
    run.then(
      () => ({ kind: 'completed' as const }),
      (error: unknown) => ({ kind: 'failed' as const, error })
    ),
  ])
  if (outcome.kind === 'failed') throw outcome.error
  if (outcome.kind === 'completed') throw new Error('migration completed before reaching the gated Cloud read')
}

describe('dependency migration mutex and no-journal reconciliation', () => {
  let projectPath: string

  const dependenciesDir = () => path.join(projectPath, '.adk', 'dependencies')
  const migrationLockPath = () => path.join(dependenciesDir(), 'migration.lock')
  const markerPath = () => path.join(dependenciesDir(), 'migration.json')
  const pendingPath = (env: Environment = 'prod') =>
    path.join(dependenciesDir(), `migration.${env}.pending.json`)
  const snapshotPath = (env: Environment = 'prod') => path.join(dependenciesDir(), `${env}.json`)
  const legacyLockPath = (env: Environment = 'prod') =>
    path.join(projectPath, `dependencies.${env}.lock.json`)

  const writeRaw = (filePath: string, raw: string): string => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, raw)
    return raw
  }

  const writeJson = (filePath: string, value: unknown): string =>
    writeRaw(filePath, `${JSON.stringify(value, null, 2)}\n`)

  const readJson = (filePath: string): any => JSON.parse(fs.readFileSync(filePath, 'utf8'))

  const writeLegacyLock = (state: LegacyState): string => writeJson(legacyLockPath(state.env), state)

  const writeConfig = (dependencies: string): string => {
    const raw = `import { defineConfig } from '@holocronlab/botruntime-runtime'

export default defineConfig({
  dependencies: ${dependencies},
})
`
    return writeRaw(path.join(projectPath, 'agent.config.ts'), raw)
  }

  const makeManager = (opts: {
    target?: Target
    runtimeBotId?: string
    client?: Record<string, unknown>
    getBot?: ReturnType<typeof vi.fn>
    integrationApply?: ReturnType<typeof vi.fn> | IntegrationResolver
    pluginApply?: ReturnType<typeof vi.fn>
  }): DependencyMigrationManager => {
    const target = opts.target ?? PROD_TARGET
    return new DependencyMigrationManager({
      projectPath,
      client: (opts.client ?? { getBot: opts.getBot ?? vi.fn() }) as any,
      target,
      ...(opts.runtimeBotId ? { runtimeBotId: opts.runtimeBotId } : {}),
      integrationResolver:
        opts.integrationApply instanceof IntegrationResolver
          ? opts.integrationApply
          : { applyToCloud: opts.integrationApply ?? vi.fn() },
      pluginResolver: { applyToCloud: opts.pluginApply ?? vi.fn() },
    } as any)
  }

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-migration-mutex-'))
    writeJson(path.join(projectPath, 'agent.json'), {
      botId: PROD_TARGET.botId,
      apiUrl: PROD_TARGET.apiUrl,
      workspaceId: PROD_TARGET.workspaceId,
    })
    writeJson(path.join(projectPath, 'agent.local.json'), {
      devId: DEV_RUNTIME_BOT_ID,
      devTargetBotId: DEV_TARGET.botId,
      apiUrl: DEV_TARGET.apiUrl,
      workspaceId: DEV_TARGET.workspaceId,
    })
    fsProbe.directFinalLockOpens.length = 0
    fsProbe.lockPublications.length = 0
    fsProbe.failPendingCheckpointCount = 0
  })

  afterEach(() => {
    fs.rmSync(projectPath, { recursive: true, force: true })
    fsProbe.directFinalLockOpens.length = 0
    fsProbe.lockPublications.length = 0
    fsProbe.failPendingCheckpointCount = 0
    vi.restoreAllMocks()
  })

  it('publishes a fully materialized owner atomically before the first Cloud read', async () => {
    const enteredCloud = deferred()
    const releaseCloud = deferred()
    const getBot = vi.fn(async () => {
      enteredCloud.resolve()
      await releaseCloud.promise
      return cloudBot({ target: PROD_TARGET })
    })

    const run = makeManager({ getBot }).run()
    try {
      await waitForGateOrFailure(run, enteredCloud.promise)

      expect(fsProbe.directFinalLockOpens).toEqual([])
      expect(fsProbe.lockPublications).toHaveLength(1)
      const publishedOwner = JSON.parse(fsProbe.lockPublications[0]!)
      expect(publishedOwner).toMatchObject({
        version: 1,
        pid: process.pid,
        hostname: os.hostname(),
        token: expect.any(String),
        startedAt: expect.any(String),
      })
      expect(JSON.parse(fs.readFileSync(migrationLockPath(), 'utf8'))).toEqual(publishedOwner)
    } finally {
      releaseCloud.resolve()
      await run.catch(() => undefined)
    }
    await run
    expect(fs.existsSync(migrationLockPath())).toBe(false)
  })

  it('preserves a live same-host owner and blocks before Cloud', async () => {
    const raw = writeJson(migrationLockPath(), lockOwner())
    const getBot = vi.fn()

    await expect(makeManager({ getBot }).run()).rejects.toThrow(/migration.*(lock|already running|active)/i)

    expect(getBot).not.toHaveBeenCalled()
    expect(fs.readFileSync(migrationLockPath(), 'utf8')).toBe(raw)
  })

  it('recovers a dead same-host owner, then releases its own successor lock', async () => {
    const deadPid = 2_147_483_647
    writeJson(migrationLockPath(), lockOwner({ pid: deadPid }))
    vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      if (pid === deadPid) {
        throw Object.assign(new Error('no such process'), { code: 'ESRCH' })
      }
      return true
    }) as typeof process.kill)
    const getBot = vi.fn(async () => cloudBot({ target: PROD_TARGET }))

    await makeManager({ getBot }).run()

    expect(getBot).toHaveBeenCalledTimes(1)
    expect(fs.existsSync(migrationLockPath())).toBe(false)
    expect(fsProbe.lockPublications).toHaveLength(1)
  })

  it.each([
    ['corrupt', '{not-json\n'],
    [
      'cross-host',
      `${JSON.stringify(lockOwner({ hostname: 'other-host.example' }), null, 2)}\n`,
    ],
  ])('preserves a %s owner and blocks before Cloud', async (_variant, raw) => {
    writeRaw(migrationLockPath(), raw)
    const getBot = vi.fn()

    await expect(makeManager({ getBot }).run()).rejects.toThrow(/migration.*(lock|owner|corrupt|active)/i)

    expect(getBot).not.toHaveBeenCalled()
    expect(fs.readFileSync(migrationLockPath(), 'utf8')).toBe(raw)
  })

  it('does not let an old token release a successor owner', async () => {
    const enteredCloud = deferred()
    const releaseCloud = deferred()
    const getBot = vi.fn(async () => {
      enteredCloud.resolve()
      await releaseCloud.promise
      return cloudBot({ target: PROD_TARGET })
    })
    const run = makeManager({ getBot }).run()
    let successorRaw = ''
    try {
      await waitForGateOrFailure(run, enteredCloud.promise)

      const original = readJson(migrationLockPath())
      const successor = { ...original, token: crypto.randomUUID(), startedAt: new Date().toISOString() }
      successorRaw = `${JSON.stringify(successor, null, 2)}\n`
      const successorTmp = `${migrationLockPath()}.successor`
      writeRaw(successorTmp, successorRaw)
      fs.renameSync(successorTmp, migrationLockPath())
    } finally {
      releaseCloud.resolve()
      await run.catch(() => undefined)
    }
    await run

    expect(fs.readFileSync(migrationLockPath(), 'utf8')).toBe(successorRaw)
  })

  it('serializes dev and prod completion so the global marker retains both records', async () => {
    const prodEnteredCloud = deferred()
    const releaseProdCloud = deferred()
    const prodGetBot = vi.fn(async () => {
      prodEnteredCloud.resolve()
      await releaseProdCloud.promise
      return cloudBot({ target: PROD_TARGET })
    })
    const firstProdRun = makeManager({ getBot: prodGetBot }).run()
    try {
      await waitForGateOrFailure(firstProdRun, prodEnteredCloud.promise)

      const blockedDevGetBot = vi.fn()
      await expect(
        makeManager({
          target: DEV_TARGET,
          runtimeBotId: DEV_RUNTIME_BOT_ID,
          getBot: blockedDevGetBot,
        }).run()
      ).rejects.toThrow(/migration.*(lock|already running|active)/i)
      expect(blockedDevGetBot).not.toHaveBeenCalled()
    } finally {
      releaseProdCloud.resolve()
      await firstProdRun.catch(() => undefined)
    }
    await firstProdRun

    const retryDevGetBot = vi.fn(async () =>
      cloudBot({ target: DEV_TARGET, runtimeBotId: DEV_RUNTIME_BOT_ID })
    )
    await makeManager({
      target: DEV_TARGET,
      runtimeBotId: DEV_RUNTIME_BOT_ID,
      getBot: retryDevGetBot,
    }).run()

    const marker = readJson(markerPath())
    expect(marker).toMatchObject({
      version: 2,
      records: {
        prod: { target: PROD_TARGET },
        dev: { target: DEV_TARGET },
      },
    })
    expect(fs.existsSync(migrationLockPath())).toBe(false)
  })

  it.each(['exact', 'superset'] as const)(
    'completes a no-journal %s-compatible legacy plan without Cloud writes',
    async (variant) => {
      const state = legacyState(['alias1'])
      writeLegacyLock(state)
      const integrations: Record<string, Record<string, unknown>> = {
        alias1: cloudIntegration(state.integrations.alias1!),
      }
      if (variant === 'superset') {
        integrations.cloudOnly = cloudIntegration({
          name: 'cloud-only',
          version: '9.0.0',
          enabled: true,
          config: { source: 'cloud' },
        })
      }
      const integrationApply = vi.fn()
      const pluginApply = vi.fn()
      const getBot = vi.fn(async () => cloudBot({ target: PROD_TARGET, integrations }))

      await makeManager({ getBot, integrationApply, pluginApply }).run()

      expect(integrationApply).not.toHaveBeenCalled()
      expect(pluginApply).not.toHaveBeenCalled()
      expect(fs.existsSync(legacyLockPath())).toBe(false)
      const snapshot = readJson(snapshotPath())
      expect(snapshot.integrations.alias1).toMatchObject(state.integrations.alias1)
      if (variant === 'superset') {
        expect(snapshot.integrations.cloudOnly).toMatchObject({
          name: 'cloud-only',
          version: '9.0.0',
          enabled: true,
          config: { source: 'cloud' },
        })
      }
      expect(readJson(markerPath())).toMatchObject({
        version: 2,
        records: { prod: { target: PROD_TARGET } },
      })
    }
  )

  it('keeps an already-enabled Cloud dependency enabled when legacy shorthand is compatible', async () => {
    writeConfig(`{ integrations: { telegram: 'telegram@1.0.0' } }`)
    const cloudEntry: IntegrationEntry = {
      name: 'telegram',
      version: '1.0.0',
      enabled: true,
      config: {},
    }
    const integrationApply = vi.fn()
    const getBot = vi.fn(async () =>
      cloudBot({
        target: PROD_TARGET,
        integrations: { telegram: cloudIntegration(cloudEntry) },
      })
    )

    await makeManager({ getBot, integrationApply }).run()

    expect(integrationApply).not.toHaveBeenCalled()
    expect(readJson(snapshotPath()).integrations.telegram.enabled).toBe(true)
    expect(readJson(markerPath())).toMatchObject({ version: 2, records: { prod: { target: PROD_TARGET } } })
  })

  it.each(['partial', 'conflicting', 'unknown readiness'] as const)(
    'fails a no-journal %s Cloud state with zero writes and zero cleanup',
    async (variant) => {
      const state = legacyState(['alias1', 'alias2'])
      const legacyRaw = writeLegacyLock(state)
      const integrations: Record<string, Record<string, unknown>> = {
        alias1: cloudIntegration(
          variant === 'conflicting'
            ? { ...state.integrations.alias1!, version: '99.0.0' }
            : state.integrations.alias1!
        ),
      }
      if (variant !== 'partial') {
        integrations.alias2 = cloudIntegration(state.integrations.alias2!)
      }
      const integrationApply = vi.fn()
      const pluginApply = vi.fn()
      const getBot = vi.fn(async () =>
        cloudBot({
          target: PROD_TARGET,
          integrations,
          integrationAuthority: variant === 'unknown readiness' ? 'unknown' : 'authoritative',
        })
      )

      await expect(makeManager({ getBot, integrationApply, pluginApply }).run()).rejects.toThrow(
        /(partial|conflict|ambiguous|readiness|authority|cannot safely)/i
      )

      expect(getBot).toHaveBeenCalledTimes(1)
      expect(integrationApply).not.toHaveBeenCalled()
      expect(pluginApply).not.toHaveBeenCalled()
      expect(fs.readFileSync(legacyLockPath(), 'utf8')).toBe(legacyRaw)
      expect(fs.existsSync(pendingPath())).toBe(false)
      expect(fs.existsSync(snapshotPath())).toBe(false)
      expect(fs.existsSync(markerPath())).toBe(false)
    }
  )

  it('imports config-only shorthand disabled when exact Cloud is empty', async () => {
    writeConfig(`{ integrations: { telegram: 'telegram@1.0.0' } }`)
    let installed: IntegrationEntry | undefined
    const integrationApply = vi.fn(async ({ entry }: { entry: IntegrationEntry }) => {
      installed = entry
    })
    const getBot = vi.fn(async () =>
      cloudBot({
        target: PROD_TARGET,
        integrations: installed ? { telegram: cloudIntegration(installed) } : {},
      })
    )

    await makeManager({ getBot, integrationApply }).run()

    expect(integrationApply).toHaveBeenCalledWith({
      botId: PROD_TARGET.botId,
      alias: 'telegram',
      entry: { name: 'telegram', version: '1.0.0', enabled: false, config: {} },
    })
    expect(readJson(snapshotPath()).integrations.telegram.enabled).toBe(false)
  })

  it('retries the exact same absolute update-by-alias payload after ACK but before its checkpoint', async () => {
    const state = legacyState(['alias1'])
    writeLegacyLock(state)
    const updateBot = vi.fn(async () => undefined)
    const getBot = vi.fn(async () =>
      getBot.mock.calls.length < 3
        ? cloudBot({ target: PROD_TARGET })
        : cloudBot({
            target: PROD_TARGET,
            integrations: { alias1: cloudIntegration(state.integrations.alias1!) },
          })
    )
    const client = { getBot, updateBot }
    const resolver = new IntegrationResolver({
      registry: { getSpec: vi.fn(async () => ({ id: 'integration_definition_exact' })) } as any,
      client: client as any,
    })
    fsProbe.failPendingCheckpointCount = 1

    await expect(makeManager({ client, integrationApply: resolver }).run()).rejects.toThrow(
      /injected pending checkpoint failure/i
    )
    expect(readJson(pendingPath()).completed.integrations).toEqual([])

    await makeManager({ client, integrationApply: resolver }).run()

    const expectedPayload = {
      id: PROD_TARGET.botId,
      integrations: {
        alias1: {
          integrationId: 'integration_definition_exact',
          enabled: true,
          configuration: { ordinal: 1 },
        },
      },
    }
    expect(updateBot).toHaveBeenCalledTimes(2)
    expect(updateBot.mock.calls[0]![0]).toEqual(expectedPayload)
    expect(updateBot.mock.calls[1]![0]).toEqual(expectedPayload)
    expect(updateBot.mock.calls[1]![0]).toEqual(updateBot.mock.calls[0]![0])
    expect(fs.existsSync(pendingPath())).toBe(false)
    expect(readJson(markerPath())).toMatchObject({ version: 2, records: { prod: { target: PROD_TARGET } } })
  })
})
