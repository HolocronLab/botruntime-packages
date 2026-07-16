import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adkBundle from '../adk-bundle'
import * as adkDevId from '../adk-dev-id'
import { CloudapiClient } from '../api/cloudapi-client'
import { HTTPError } from '../errors'
import { Logger } from '../logger'
import { TablesPublisher } from '../tables'
import * as utils from '../utils'
import { DeployCommand } from './deploy-command'
import { DevCommand } from './dev-command'
import { ProjectCommand } from './project-command'

function writeProfile(botpressHome: string): void {
  fs.writeFileSync(
    path.join(botpressHome, 'profiles.json'),
    JSON.stringify({
      default: {
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
        token: 'brt_pat_xxx',
      },
      local: {
        apiUrl: 'https://dev.local',
        workspaceId: 'dev_ws',
        token: 'brt_pat_local',
      },
      classicLocal: {
        apiUrl: 'https://dev.local',
        workspaceId: '9001',
        token: 'brt_pat_local',
      },
    })
  )
}

function writeProjectCache(workDir: string): void {
  const cachePath = path.join(workDir, '.botpress', 'project.cache.json')
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(
    cachePath,
    JSON.stringify({
      devId: 'dev_abc',
      devTargetBotId: '42',
      tunnelId: 'dev_abc',
    })
  )
}

function writeProjectCacheState(workDir: string, state: Record<string, unknown>): void {
  const cachePath = path.join(workDir, '.botpress', 'project.cache.json')
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  fs.writeFileSync(cachePath, JSON.stringify(state))
}

function readProjectCacheState(workDir: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(path.join(workDir, '.botpress', 'project.cache.json'), 'utf-8'))
}

function devBot(runtimeBotId: string, devTargetBotId: string) {
  return {
    id: runtimeBotId,
    createdAt: '2026-07-09T00:00:00.000Z',
    updatedAt: '2026-07-09T00:00:00.000Z',
    signingSecret: '',
    integrations: {},
    plugins: {},
    states: {},
    recurringEvents: {},
    events: {},
    actions: {},
    configuration: { data: {}, schema: {} },
    user: { tags: {} },
    conversation: { tags: {} },
    message: { tags: {} },
    tags: { 'botruntime.devTargetBotId': devTargetBotId },
    secrets: [],
    dev: true,
    url: `https://botruntime.ru/${runtimeBotId}`,
    status: 'active',
    type: 'adk',
    devReadiness: authoritativeDevReadiness(),
  }
}

function writeAgentProject(workDir: string): void {
  fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
  fs.writeFileSync(path.join(workDir, 'agent.local.json'), JSON.stringify({ devId: 'dev_agent', devTargetBotId: '42' }))
}

function writeDevDependencySnapshot(
  workDir: string,
  integrations: Record<string, Record<string, unknown>>,
  plugins: Record<string, Record<string, unknown>> = {},
  target: { apiUrl: string; workspaceId: string; botId: string } = {
    apiUrl: 'https://cloud.example',
    workspaceId: 'ws_123',
    botId: '42',
  }
): void {
  const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'dev.json')
  fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
  fs.writeFileSync(
    snapshotPath,
    JSON.stringify({
      version: 2,
      env: 'dev',
      target,
      fetchedAt: '2026-07-09T00:00:00.000Z',
      integrations,
      plugins,
    })
  )
}

function captureStream(): { stream: NodeJS.WriteStream; read: () => string } {
  let output = ''
  return {
    stream: {
      write: (chunk: string | Uint8Array) => {
        output += String(chunk)
        return true
      },
      isTTY: false,
    } as NodeJS.WriteStream,
    read: () => output,
  }
}

class TestDependencySnapshotStore {
  public constructor(private readonly opts: { projectPath: string }) {}

  public getSnapshotPath(env: 'dev' | 'prod'): string {
    return path.join(this.opts.projectPath, '.adk', 'dependencies', `${env}.json`)
  }

  public async read(expected: {
    env: 'dev' | 'prod'
    apiUrl: string
    workspaceId: string
    botId: string
  }): Promise<any | null> {
    const snapshotPath = this.getSnapshotPath(expected.env)
    if (!fs.existsSync(snapshotPath)) return null
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    const canonicalExpected = {
      ...expected,
      apiUrl: expected.apiUrl.replace(/\/+$/, ''),
    }
    if (
      snapshot.version !== 2 ||
      snapshot.env !== canonicalExpected.env ||
      snapshot.target?.apiUrl !== canonicalExpected.apiUrl ||
      snapshot.target?.workspaceId !== canonicalExpected.workspaceId ||
      snapshot.target?.botId !== canonicalExpected.botId
    ) {
      throw new Error(`dependency snapshot belongs to another target or is legacy/corrupt: ${snapshotPath}`)
    }
    return snapshot
  }
}

async function testResolveDependencyStatuses({ snapshot }: { snapshot: any }): Promise<any[]> {
  const statusOf = (entry: any) => {
    if (entry.missingFields?.length) return { state: 'unconfigured', missingFields: entry.missingFields }
    if (entry.authorizationPending) return { state: 'unconfigured', reason: 'requires authorization' }
    return { state: entry.enabled ? 'available' : 'disabled' }
  }
  return [
    ...Object.entries(snapshot.integrations ?? {}).map(([alias, entry]: [string, any]) => ({
      type: 'integration',
      alias,
      name: entry.name,
      version: entry.version,
      enabled: entry.enabled,
      ...statusOf(entry),
    })),
    ...Object.entries(snapshot.plugins ?? {}).map(([alias, entry]: [string, any]) => ({
      type: 'plugin',
      alias,
      name: entry.name,
      version: entry.version,
      enabled: entry.enabled,
      ...statusOf(entry),
    })),
  ]
}

async function testReconcileDependencyReadiness({
  snapshot,
  cloud,
  expectedTarget,
}: {
  snapshot: any
  cloud: any
  expectedTarget: {
    env: string
    apiUrl: string
    workspaceId: string
    botId: string
  }
}): Promise<any> {
  const statuses = await testResolveDependencyStatuses({ snapshot })
  const issues: any[] = []
  const canonicalExpectedApiUrl = expectedTarget.apiUrl.replace(/\/+$/, '')
  const canonicalSnapshotApiUrl = snapshot.target?.apiUrl?.replace(/\/+$/, '')
  if (snapshot.env !== expectedTarget.env) {
    issues.push({
      code: 'SNAPSHOT_ENV_MISMATCH',
      message: `expected ${expectedTarget.env}`,
    })
  }
  if (
    canonicalSnapshotApiUrl !== canonicalExpectedApiUrl ||
    snapshot.target?.workspaceId !== expectedTarget.workspaceId ||
    snapshot.target?.botId !== expectedTarget.botId
  ) {
    issues.push({
      code: 'SNAPSHOT_TARGET_MISMATCH',
      message: 'expected the selected dev target authority',
    })
  }
  if (snapshot.stale === true) issues.push({ code: 'SNAPSHOT_STALE', message: 'snapshot is stale' })
  if (cloud.integrations?.authority !== 'authoritative') {
    issues.push({
      code: 'CLOUD_AUTHORITY_UNKNOWN',
      message: `Cloud integration state is not authoritative: ${cloud.integrations?.reason ?? 'missing'}`,
    })
  }
  const blockingStatus = statuses.some((status) => status.state !== 'available' && status.state !== 'disabled')
  return {
    ok: issues.length === 0 && !blockingStatus,
    statuses,
    issues,
    revisions: {
      ...(snapshot.botUpdatedAt ? { snapshotBotUpdatedAt: snapshot.botUpdatedAt } : {}),
      ...(cloud.botUpdatedAt ? { cloudBotUpdatedAt: cloud.botUpdatedAt } : {}),
    },
  }
}

function authoritativeDevReadiness() {
  return {
    schemaVersion: 1,
    integrations: {
      authority: 'authoritative',
      source: 'integration_installation',
    },
    plugins: {
      authority: 'unknown',
      reason: 'plugin_installations_not_persisted',
    },
    lastDevDeployment: {
      authority: 'unknown',
      reason: 'successful_dev_deployments_not_persisted',
    },
  }
}

function authoritativeIntegration(overrides: Record<string, unknown> = {}) {
  return {
    id: 'int_telegram',
    installationId: '91',
    name: 'telegram',
    version: '0.0.1',
    enabled: true,
    configurationType: 'manual',
    configurationRevision: `sha256:${'a'.repeat(64)}`,
    status: 'registered',
    statusReason: '',
    ...overrides,
  }
}

function makeArgv(botpressHome: string, workDir: string) {
  return {
    verbose: false,
    confirm: true,
    json: false,
    botpressHome,
    profile: undefined,
    workDir,
    apiUrl: undefined,
    workspaceId: undefined,
    token: undefined,
    secrets: [],
    sourceMap: false,
    minify: true,
    watch: false,
    port: undefined,
    tunnelUrl: 'https://botruntime.ru',
    tunnelId: undefined,
    noSecretCaching: false,
    check: true,
    adk: false,
    local: false,
  }
}

function makeCommand(
  botpressHome: string,
  workDir: string,
  logger: Logger,
  argvOverrides: Record<string, unknown> = {}
): DevCommand {
  const cmd = new DevCommand({} as any, {} as any, logger, {
    ...makeArgv(botpressHome, workDir),
    ...argvOverrides,
  } as any)
  ;(cmd as any).readProjectDefinitionFromFS = () => ({
    projectType: 'bot',
    resolveProjectDefinition: async () => ({
      type: 'bot',
      definition: {
        integrations: {
          telegram: {
            id: 'int_telegram',
            name: 'telegram',
            version: '0.0.1',
            alias: 'telegram',
          },
        },
      },
    }),
  })
  return cmd
}

describe('DevCommand --check', () => {
  let botpressHome: string
  let workDir: string

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-dev-check-'))
    writeProfile(botpressHome)
    writeProjectCache(workDir)
    vi.spyOn(adkBundle, 'loadAdkDependencyTools').mockResolvedValue({
      DependencySnapshotStore: TestDependencySnapshotStore as any,
      reconcileDependencyReadiness: testReconcileDependencyReadiness as any,
    } as any)
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockImplementation(async (runtimeBotId) => ({
      bot: {
        id: runtimeBotId,
        dev: true,
        tags: { 'botruntime.devTargetBotId': '42' },
        integrations: {},
        plugins: {},
        devReadiness: {
          ...authoritativeDevReadiness(),
          plugins: {
            authority: 'authoritative',
            source: 'bot_definition_plugins',
          },
        },
      },
    }))
    vi.spyOn(CloudapiClient.prototype, 'requireEvalBotReady').mockResolvedValue({ ready: true })
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('prints a readiness report with the dev bot id and integration status', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        id: 'dev_abc',
        dev: true,
        url: 'https://botruntime.ru/dev_abc',
        integrations: {
          telegram: authoritativeIntegration(),
        },
      },
    })
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(out.read()).toContain('Dev bot: dev_abc')
    expect(out.read()).toContain('telegram: registered')
    expect(out.read()).toContain('Eval transport: ready (botruntime/eval (native))')
    expect(out.read()).not.toContain('provision chat')
  })

  it('uses only authoritative read probes and leaves remote and local state unchanged', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        id: 'dev_abc',
        dev: true,
        url: 'https://botruntime.ru/dev_abc',
        tags: { 'botruntime.devTargetBotId': '42' },
        integrations: {
          telegram: authoritativeIntegration(),
        },
        devReadiness: authoritativeDevReadiness(),
      },
    })
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget')
    const tunnelSpy = vi.spyOn(CloudapiClient.prototype, 'requireEvalBotReady')
    const cachePath = path.join(workDir, '.botpress', 'project.cache.json')
    const profilePath = path.join(botpressHome, 'profiles.json')
    const cacheBefore = fs.readFileSync(cachePath, 'utf8')
    const profileBefore = fs.readFileSync(profilePath, 'utf8')
    const cacheMtimeBefore = fs.statSync(cachePath).mtimeMs
    const profileMtimeBefore = fs.statSync(profilePath).mtimeMs
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(getSpy).toHaveBeenCalledOnce()
    expect(tunnelSpy).toHaveBeenCalledOnce()
    expect(tunnelSpy).toHaveBeenCalledWith('dev_abc')
    expect(fs.readFileSync(cachePath, 'utf8')).toBe(cacheBefore)
    expect(fs.readFileSync(profilePath, 'utf8')).toBe(profileBefore)
    expect(fs.statSync(cachePath).mtimeMs).toBe(cacheMtimeBefore)
    expect(fs.statSync(profilePath).mtimeMs).toBe(profileMtimeBefore)
    expect(fs.existsSync(path.join(botpressHome, 'global.cache.json'))).toBe(false)
  })

  it('fails readiness when the cached dev bot exists but its tunnel is disconnected', async () => {
    vi.spyOn(CloudapiClient.prototype, 'requireEvalBotReady').mockRejectedValue(
      new HTTPError(503, 'development tunnel is not connected')
    )
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(out.read()).not.toContain('Eval transport: ready')
    expect(err.read()).toContain('development tunnel is not connected')
  })

  it('agent dev --check uses an unscoped runtime only as a read-only hint and ignores its stale numeric target', async () => {
    writeAgentProject(workDir)
    const localPath = path.join(workDir, 'agent.local.json')
    fs.writeFileSync(localPath, JSON.stringify({ devId: 'dev_agent', devTargetBotId: '41' }))
    writeDevDependencySnapshot(
      workDir,
      {},
      {},
      {
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
        botId: '84',
      }
    )
    const before = fs.readFileSync(localPath)
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: { ...devBot('dev_agent', '84'), integrations: {} },
    })
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(getSpy).toHaveBeenCalledOnce()
    expect(fs.readFileSync(localPath)).toEqual(before)
  })

  it('agent dev --check rejects a foreign scoped tuple before its only GET and preserves bytes', async () => {
    writeAgentProject(workDir)
    const localPath = path.join(workDir, 'agent.local.json')
    fs.writeFileSync(
      localPath,
      JSON.stringify({
        devId: 'dev_agent',
        devTargetBotId: '42',
        devApiUrl: 'https://foreign.example',
        devWorkspaceId: 'foreign_ws',
      })
    )
    writeDevDependencySnapshot(workDir, {})
    const before = fs.readFileSync(localPath)
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget')
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(getSpy).not.toHaveBeenCalled()
    expect(fs.readFileSync(localPath)).toEqual(before)
  })

  it('fails before network when the cached numeric dev target is missing', async () => {
    writeProjectCacheState(workDir, { devId: 'dev_abc', tunnelId: 'dev_abc' })
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget')
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('blocks a dev snapshot whose numeric botId differs from the verified target without any local write', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {})
    const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'dev.json')
    const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'))
    fs.writeFileSync(
      snapshotPath,
      JSON.stringify({
        ...snapshot,
        target: { ...snapshot.target, botId: '99' },
      })
    )
    const cachePath = path.join(workDir, '.botpress', 'project.cache.json')
    const profilePath = path.join(botpressHome, 'profiles.json')
    const agentLocalPath = path.join(workDir, 'agent.local.json')
    const files = [snapshotPath, cachePath, profilePath, agentLocalPath]
    const before = new Map(
      files.map((filePath) => [
        filePath,
        {
          bytes: fs.readFileSync(filePath),
          mtimeMs: fs.statSync(filePath).mtimeMs,
        },
      ])
    )
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget')
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(getSpy).toHaveBeenCalledOnce()
    for (const filePath of files) {
      expect(fs.readFileSync(filePath)).toEqual(before.get(filePath)!.bytes)
      expect(fs.statSync(filePath).mtimeMs).toBe(before.get(filePath)!.mtimeMs)
    }
    expect(fs.existsSync(path.join(botpressHome, 'global.cache.json'))).toBe(false)
  })

  it('blocks a foreign-authority dev snapshot after one authoritative GET and performs no local write', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(
      workDir,
      {},
      {},
      {
        apiUrl: 'https://foreign.example',
        workspaceId: 'ws_123',
        botId: '42',
      }
    )
    const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'dev.json')
    const cachePath = path.join(workDir, '.botpress', 'project.cache.json')
    const profilePath = path.join(botpressHome, 'profiles.json')
    const agentLocalPath = path.join(workDir, 'agent.local.json')
    const files = [snapshotPath, cachePath, profilePath, agentLocalPath]
    const before = new Map(
      files.map((filePath) => [
        filePath,
        {
          bytes: fs.readFileSync(filePath),
          mtimeMs: fs.statSync(filePath).mtimeMs,
        },
      ])
    )
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget')
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(getSpy).toHaveBeenCalledOnce()
    for (const filePath of files) {
      expect(fs.readFileSync(filePath)).toEqual(before.get(filePath)!.bytes)
      expect(fs.statSync(filePath).mtimeMs).toBe(before.get(filePath)!.mtimeMs)
    }
    expect(fs.existsSync(path.join(botpressHome, 'global.cache.json'))).toBe(false)
  })

  it('requires agent.local apiUrl and workspaceId under --local before network', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(
      workDir,
      {},
      {},
      {
        apiUrl: 'https://dev.local',
        workspaceId: 'dev_ws',
        botId: '42',
      }
    )
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget')
    const cmd = makeCommand(botpressHome, workDir, new Logger(), {
      local: true,
    })

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('uses only the selected profile token under --local and ignores an explicit poisoned token flag', async () => {
    writeAgentProject(workDir)
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_agent',
        devTargetBotId: '42',
        apiUrl: 'https://dev.local',
        workspaceId: 'dev_ws',
      })
    )
    writeDevDependencySnapshot(
      workDir,
      {},
      {},
      {
        apiUrl: 'https://dev.local',
        workspaceId: 'dev_ws',
        botId: '42',
      }
    )
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockImplementation(async function (
      this: CloudapiClient,
      runtimeBotId,
      workspaceId
    ) {
      expect((this as any).apiKey).toBe('brt_pat_local')
      expect((this as any).baseUrl).toBe('https://dev.local')
      expect(workspaceId).toBe('dev_ws')
      return {
        bot: {
          ...devBot(runtimeBotId, '42'),
          integrations: {},
        },
      }
    })
    const cmd = makeCommand(botpressHome, workDir, new Logger(), {
      local: true,
      profile: 'local',
      token: 'poisoned-explicit-token',
    })

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(getSpy).toHaveBeenCalledOnce()
  })

  it('rejects dev --check --local when agent.local points outside the selected profile authority', async () => {
    writeAgentProject(workDir)
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_agent',
        devTargetBotId: '42',
        apiUrl: 'https://foreign.example',
        workspaceId: 'foreign_ws',
      })
    )
    writeDevDependencySnapshot(workDir, {})
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget')
    const cmd = makeCommand(botpressHome, workDir, new Logger(), {
      local: true,
      profile: 'local',
    })

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(getSpy).not.toHaveBeenCalled()
  })

  it('uses only explicit/profile stack coordinates for non-local agent readiness checks', async () => {
    writeAgentProject(workDir)
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_agent',
        devTargetBotId: '42',
        apiUrl: 'https://poisoned-local.example',
        workspaceId: 'poisoned_local_ws',
      })
    )
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: '101',
        apiUrl: 'https://poisoned-agent.example',
        workspaceId: 'poisoned_agent_ws',
      })
    )
    writeDevDependencySnapshot(workDir, {})
    const getSpy = vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockImplementation(async function (
      this: CloudapiClient,
      runtimeBotId,
      workspaceId
    ) {
      expect((this as any).apiKey).toBe('brt_pat_xxx')
      expect((this as any).baseUrl).toBe('https://cloud.example')
      expect(workspaceId).toBe('ws_123')
      return { bot: { ...devBot(runtimeBotId, '42'), integrations: {} } }
    })
    const cmd = makeCommand(botpressHome, workDir, new Logger(), {
      local: false,
    })

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(getSpy).toHaveBeenCalledOnce()
  })

  it('returns a non-zero result when an integration readiness status is failed', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        id: 'dev_abc',
        dev: true,
        url: 'https://botruntime.ru/dev_abc',
        integrations: {
          telegram: authoritativeIntegration({
            enabled: false,
            status: 'failed',
            statusReason: 'integration alias telegram is not installed for this dev bot',
          }),
        },
      },
    })
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(out.read()).toContain('telegram: failed')
    expect(err.read()).toContain('Dev bot is not ready')
    expect(err.read()).toContain('not installed')
  })

  it('returns a non-zero result when the server omits requested integration statuses', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        id: 'dev_abc',
        dev: true,
        url: 'https://botruntime.ru/dev_abc',
        integrations: {},
      },
    })
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(err.read()).toContain('did not include integration statuses')
    expect(err.read()).toContain('GET /v1/admin/bots/{devId}')
  })

  it('returns a non-zero result when a returned integration has no readiness status', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        id: 'dev_abc',
        dev: true,
        url: 'https://botruntime.ru/dev_abc',
        integrations: {
          telegram: authoritativeIntegration({ status: undefined }),
        },
      },
    })
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(out.read()).not.toContain('telegram: unknown')
    expect(err.read()).toContain('bot.integrations.telegram.status')
  })

  it('rejects a partial authoritative installation row before classic readiness evaluation', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        integrations: {
          telegram: authoritativeIntegration({ installationId: undefined }),
        },
      },
    })
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(err.read()).toContain('bot.integrations.telegram.installationId')
  })

  it('rejects legacy active lifecycle for a classic integration', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        integrations: {
          telegram: authoritativeIntegration({ status: 'active' }),
        },
      },
    })
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(err.read()).toContain('bot.integrations.telegram.status')
  })

  it.each([
    ['id', { id: 'wrong-definition-id' }],
    ['name', { name: 'wrong-name' }],
    ['version', { version: '9.9.9' }],
  ] as const)('rejects classic authoritative integration %s drift under the same alias', async (_field, drift) => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        integrations: { telegram: authoritativeIntegration(drift) },
      },
    })
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(err.read()).toContain('authoritative integration telegram')
  })

  it('prints ADK dependency statuses for an agent project when the dev snapshot is available', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {
      telegram: {
        name: 'telegram',
        version: '1.0.0',
        enabled: true,
        config: {},
        configurationType: 'manual',
        configurationRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        cloudId: '17',
      },
    })
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_agent', '42'),
        integrations: {
          telegram: authoritativeIntegration({
            id: '17',
            version: '1.0.0',
            configurationRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
          }),
        },
        devReadiness: authoritativeDevReadiness(),
      },
    })
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(out.read()).toContain('Dependency snapshot: found')
    expect(out.read()).toContain('integration telegram: available')
  })

  it('passes the verified target, snapshot, generated module inventory, and authoritative cloud state to the ADK reconciler', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {})
    const reconcile = vi.fn(testReconcileDependencyReadiness)
    vi.mocked(adkBundle.loadAdkDependencyTools).mockResolvedValue({
      DependencySnapshotStore: TestDependencySnapshotStore as any,
      reconcileDependencyReadiness: reconcile as any,
    } as any)
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_agent', '42'),
        updatedAt: '2026-07-10T01:00:00.000Z',
        plugins: {},
        devReadiness: {
          ...authoritativeDevReadiness(),
          plugins: {
            authority: 'authoritative',
            source: 'bot_definition_plugins',
          },
        },
      },
    })
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(reconcile).toHaveBeenCalledOnce()
    expect(reconcile).toHaveBeenCalledWith({
      snapshot: expect.objectContaining({
        env: 'dev',
        target: {
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
          botId: '42',
        },
      }),
      expectedTarget: {
        env: 'dev',
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
        botId: '42',
      },
      bpModulesDir: path.join(workDir, '.adk', 'bot', 'bp_modules'),
      cloud: {
        botUpdatedAt: '2026-07-10T01:00:00.000Z',
        integrations: {
          ...authoritativeDevReadiness().integrations,
          items: {},
        },
        plugins: {
          authority: 'authoritative',
          source: 'bot_definition_plugins',
          items: {},
        },
        lastDevDeployment: authoritativeDevReadiness().lastDevDeployment,
      },
    })
  })

  it('prints reconciler issue codes deterministically and returns non-zero', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {})
    vi.mocked(adkBundle.loadAdkDependencyTools).mockResolvedValue({
      DependencySnapshotStore: TestDependencySnapshotStore as any,
      reconcileDependencyReadiness: vi.fn().mockResolvedValue({
        ok: false,
        statuses: [],
        issues: [
          {
            code: 'CLOUD_VERSION_MISMATCH',
            message: 'version differs',
            type: 'integration',
            alias: 'zeta',
          },
          {
            code: 'CLOUD_CONFIGURATION_REVISION_MISMATCH',
            message: 'configuration revision differs',
            type: 'integration',
            alias: 'alpha',
          },
        ],
        revisions: {},
      }),
    } as any)
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(out.read()).toContain('CLOUD_CONFIGURATION_REVISION_MISMATCH')
    expect(err.read()).toContain('CLOUD_CONFIGURATION_REVISION_MISMATCH')
    expect(err.read().indexOf('CLOUD_CONFIGURATION_REVISION_MISMATCH')).toBeLessThan(
      err.read().indexOf('CLOUD_VERSION_MISMATCH')
    )
  })

  it('blocks an old or malformed dev readiness response before reconciliation', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {})
    const reconcile = vi.fn(testReconcileDependencyReadiness)
    vi.mocked(adkBundle.loadAdkDependencyTools).mockResolvedValue({
      DependencySnapshotStore: TestDependencySnapshotStore as any,
      reconcileDependencyReadiness: reconcile as any,
    } as any)
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_agent', '42'),
        devReadiness: {
          schemaVersion: 0,
          integrations: {
            authority: 'authoritative',
            source: 'integration_installation',
          },
        } as any,
      },
    })
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(reconcile).not.toHaveBeenCalled()
    expect(err.read()).toContain('bot.devReadiness.schemaVersion=1')
  })

  it('passes strict direct plugin integration bindings through readiness without renaming the Cloud alias', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {})
    const reconcile = vi.fn(testReconcileDependencyReadiness)
    vi.mocked(adkBundle.loadAdkDependencyTools).mockResolvedValue({
      DependencySnapshotStore: TestDependencySnapshotStore as any,
      reconcileDependencyReadiness: reconcile as any,
    } as any)
    const plugin = {
      id: '31',
      name: 'different-plugin-name',
      version: '2.0.0',
      enabled: true,
      configuration: {},
      interfaces: {
        messageEvents: {
          integrationId: '17',
          integrationAlias: 'workspace-main/telegram-main',
          integrationInterfaceAlias: 'messageEvents',
        },
      },
      integrations: {
        auditStream: { integrationId: '18', integrationAlias: 'audit-main' },
      },
    }
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_agent', '42'),
        plugins: { 'custom-alias': plugin },
        devReadiness: {
          ...authoritativeDevReadiness(),
          plugins: {
            authority: 'authoritative',
            source: 'bot_definition_plugins',
          },
        },
      },
    })
    const cmd = makeCommand(botpressHome, workDir, new Logger())

    const result = await cmd.handler()

    expect(result.exitCode).toBe(0)
    expect(reconcile).toHaveBeenCalledWith(
      expect.objectContaining({
        cloud: expect.objectContaining({
          plugins: expect.objectContaining({
            items: { 'custom-alias': plugin },
          }),
        }),
      })
    )
  })

  it.each(['a', 'A-valid', `a${'b'.repeat(100)}`, 'prototype'])(
    'blocks noncanonical plugin alias %s before reconciliation',
    async (alias) => {
      writeAgentProject(workDir)
      writeDevDependencySnapshot(workDir, {})
      const reconcile = vi.fn(testReconcileDependencyReadiness)
      vi.mocked(adkBundle.loadAdkDependencyTools).mockResolvedValue({
        DependencySnapshotStore: TestDependencySnapshotStore as any,
        reconcileDependencyReadiness: reconcile as any,
      } as any)
      vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
        bot: {
          ...devBot('dev_agent', '42'),
          plugins: {
            [alias]: {
              id: '31',
              name: 'plugin',
              version: '1.0.0',
              enabled: true,
              configuration: {},
              interfaces: {},
              integrations: {},
            },
          },
          devReadiness: {
            ...authoritativeDevReadiness(),
            plugins: {
              authority: 'authoritative',
              source: 'bot_definition_plugins',
            },
          },
        },
      })
      const err = captureStream()
      const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

      const result = await cmd.handler()

      expect(result.exitCode).toBe(1)
      expect(reconcile).not.toHaveBeenCalled()
      expect(err.read()).toMatch(/plugin.*alias|invalid alias/i)
    }
  )

  it('blocks a plugin projection that omits direct integrations', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {})
    const reconcile = vi.fn(testReconcileDependencyReadiness)
    vi.mocked(adkBundle.loadAdkDependencyTools).mockResolvedValue({
      DependencySnapshotStore: TestDependencySnapshotStore as any,
      reconcileDependencyReadiness: reconcile as any,
    } as any)
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_agent', '42'),
        plugins: {
          'custom-alias': {
            id: '31',
            name: 'plugin',
            version: '1.0.0',
            enabled: true,
            configuration: {},
            interfaces: {},
          },
        },
        devReadiness: {
          ...authoritativeDevReadiness(),
          plugins: {
            authority: 'authoritative',
            source: 'bot_definition_plugins',
          },
        },
      },
    })
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(reconcile).not.toHaveBeenCalled()
    expect(err.read()).toMatch(/must contain exactly.*integrations|integrations.*object|canonical/i)
  })

  it.each(['plugin_installation', 'arbitrary_projection'])(
    'blocks authoritative plugin source %s before reconciliation',
    async (source) => {
      writeAgentProject(workDir)
      writeDevDependencySnapshot(workDir, {})
      const reconcile = vi.fn(testReconcileDependencyReadiness)
      vi.mocked(adkBundle.loadAdkDependencyTools).mockResolvedValue({
        DependencySnapshotStore: TestDependencySnapshotStore as any,
        reconcileDependencyReadiness: reconcile as any,
      } as any)
      vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
        bot: {
          ...devBot('dev_agent', '42'),
          devReadiness: {
            ...authoritativeDevReadiness(),
            plugins: { authority: 'authoritative', source },
          },
        },
      })
      const err = captureStream()
      const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

      const result = await cmd.handler()

      expect(result.exitCode).toBe(1)
      expect(reconcile).not.toHaveBeenCalled()
      expect(err.read()).toMatch(/bot_definition_plugins|plugin.*source/i)
    }
  )

  it('blocks a classic bot response that omits the versioned dev readiness metadata', async () => {
    vi.spyOn(CloudapiClient.prototype, 'getDevBotTarget').mockResolvedValue({
      bot: {
        ...devBot('dev_abc', '42'),
        devReadiness: undefined,
      },
    })
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(err.read()).toContain('bot.devReadiness.schemaVersion=1')
  })

  it('returns a non-zero result when an enabled agent dependency is unconfigured', async () => {
    writeAgentProject(workDir)
    writeDevDependencySnapshot(workDir, {
      telegram: {
        name: 'telegram',
        version: '1.0.0',
        enabled: true,
        config: {},
        missingFields: ['botToken'],
      },
    })
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(out.read()).toContain('integration telegram: unconfigured missing=botToken')
    expect(err.read()).toContain('Agent dependencies are not ready')
    expect(err.read()).toContain('integration telegram: unconfigured missing=botToken')
  })

  it('returns a non-zero result when an agent project has no dev dependency snapshot', async () => {
    writeAgentProject(workDir)
    const out = captureStream()
    const err = captureStream()
    const cmd = makeCommand(botpressHome, workDir, new Logger({ outStream: out.stream, errStream: err.stream }))

    const result = await cmd.handler()

    expect(result.exitCode).toBe(1)
    expect(out.read()).toContain('Dependency snapshot: missing')
    expect(out.read()).toContain('Dependencies: none')
    expect(err.read()).toContain('Agent dependency snapshot is missing')
    expect(err.read()).toContain('brt dev')
  })
})

describe('DevCommand agent routing', () => {
  let botpressHome: string
  let workDir: string

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-dev-routing-'))
    writeProfile(botpressHome)
    writeAgentProject(workDir)
    vi.spyOn(adkBundle, 'loadAdkMigrationTools').mockResolvedValue({
      migrateFromConfig: vi.fn(async () => ({
        migrated: [],
        warnings: [],
        skipped: [],
      })),
    } as any)
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('routes agent dev only to the tunnel path and never to DeployCommand', async () => {
    const deploySpy = vi.spyOn(DeployCommand.prototype, 'run').mockResolvedValue()
    const tunnelSpy = vi.spyOn(DevCommand.prototype as any, '_runAgentTunnelDev').mockResolvedValue(undefined)
    const argv = {
      ...makeArgv(botpressHome, workDir),
      check: false,
      adk: false,
    }
    const apiFactory = {
      newClient: vi.fn().mockReturnValue({
        client: {
          getBot: vi.fn().mockResolvedValue({ bot: devBot('dev_agent', '42') }),
        },
      }),
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), argv as any)

    await command.run()

    expect(tunnelSpy).toHaveBeenCalledOnce()
    expect(deploySpy).not.toHaveBeenCalled()
  })

  it('rejects classic dev --local when bot.local differs from the selected profile before client creation', async () => {
    fs.rmSync(path.join(workDir, 'agent.config.ts'))
    fs.rmSync(path.join(workDir, 'agent.local.json'))
    fs.writeFileSync(
      path.join(workDir, 'bot.local.json'),
      JSON.stringify({
        botId: 7,
        workspaceId: 7,
        apiUrl: 'https://foreign.example',
      })
    )
    const apiFactory = { newClient: vi.fn() }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
      local: true,
      profile: 'default',
    } as any)

    await expect(command.run()).rejects.toThrow(/bot\.local\.json.*selected profile/i)

    expect(apiFactory.newClient).not.toHaveBeenCalled()
  })

  it('pins classic dev --local to the matching local profile before any project work', async () => {
    fs.rmSync(path.join(workDir, 'agent.config.ts'))
    fs.rmSync(path.join(workDir, 'agent.local.json'))
    fs.writeFileSync(
      path.join(workDir, 'bot.local.json'),
      JSON.stringify({
        botId: 7,
        workspaceId: 9001,
        apiUrl: 'https://dev.local',
      })
    )
    const apiFactory = {
      newClient: vi.fn().mockImplementation(() => {
        throw new Error('classic local credential probe complete')
      }),
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
      local: true,
      profile: 'classicLocal',
    } as any)

    await expect(command.run()).rejects.toThrow(/classic local credential probe complete/)

    expect(apiFactory.newClient).toHaveBeenCalledWith(
      {
        apiUrl: 'https://dev.local',
        workspaceId: '9001',
        token: 'brt_pat_local',
      },
      expect.any(Logger)
    )
  })

  it('rejects legacy dev --adk before any tunnel or production deploy side effect', async () => {
    const deploySpy = vi.spyOn(DeployCommand.prototype, 'run').mockResolvedValue()
    const tunnelSpy = vi.spyOn(DevCommand.prototype as any, '_runAgentTunnelDev').mockResolvedValue(undefined)
    const argv = {
      ...makeArgv(botpressHome, workDir),
      check: false,
      adk: true,
    }
    const command = new DevCommand({} as any, {} as any, new Logger(), argv as any)

    await expect(command.run()).rejects.toThrow(/use `brt deploy --adk --watch`/)

    expect(deploySpy).not.toHaveBeenCalled()
    expect(tunnelSpy).not.toHaveBeenCalled()
  })

  it('rejects legacy dev --adk before inherited bootstrap can perform network work', async () => {
    const bootstrapSpy = vi.spyOn(ProjectCommand.prototype as any, 'bootstrap').mockResolvedValue(undefined)
    const deploySpy = vi.spyOn(DeployCommand.prototype, 'run').mockResolvedValue()
    const err = captureStream()
    const argv = {
      ...makeArgv(botpressHome, workDir),
      check: false,
      adk: true,
    }
    const command = new DevCommand(
      {} as any,
      {} as any,
      new Logger({ outStream: captureStream().stream, errStream: err.stream }),
      argv as any
    )

    const result = await command.handler()

    expect(result.exitCode).toBe(1)
    expect(err.read()).toContain('use `brt deploy --adk --watch`')
    expect(bootstrapSpy).not.toHaveBeenCalled()
    expect(deploySpy).not.toHaveBeenCalled()
  })

  it('uses adk-dev and the strict agent.local stack under --local for generation and regeneration', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_agent',
        workspaceId: 'dev_ws',
        apiUrl: 'https://dev.local',
      })
    )
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: 'prod_bot_must_not_be_used',
        workspaceId: 'ws_123',
      })
    )
    const botPath = path.join(workDir, '.adk', 'bot')
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(botPath)
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const close = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (dir, onChange) => {
      await onChange([{ type: 'update', path: path.join(dir, 'src', 'changed.ts') }])
      return { close } as any
    })
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    const argv = {
      ...makeArgv(botpressHome, workDir),
      check: false,
      watch: true,
      local: true,
      profile: 'local',
    }
    const apiFactory = {
      newClient: vi.fn().mockReturnValue({
        client: {
          getBot: vi.fn().mockResolvedValue({ bot: devBot('dev_agent', '42') }),
        },
      }),
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), argv as any)

    await (command as any)._runAgentTunnelDev()

    const expectedTarget = {
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'dev_agent',
        credentials: {
          token: 'brt_pat_local',
          apiUrl: 'https://dev.local',
          workspaceId: 'dev_ws',
        },
      },
    }
    expect(generateSpy).toHaveBeenCalledTimes(2)
    expect(generateSpy).toHaveBeenNthCalledWith(1, workDir, expect.any(Function), expectedTarget)
    expect(generateSpy).toHaveBeenNthCalledWith(2, workDir, expect.any(Function), expectedTarget)
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('prod_bot_must_not_be_used')
    expect(close).toHaveBeenCalledOnce()
  })

  it('pins the nested local dev command to the already-resolved agent.local stack and profile token', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_agent',
        devTargetBotId: '42',
        workspaceId: 'dev_ws',
        apiUrl: 'https://dev.local',
      })
    )
    const botPath = path.join(workDir, '.adk', 'bot')
    vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(botPath)
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const getBot = vi.fn().mockResolvedValue({ bot: devBot('dev_agent', '42') })
    const apiFactory = {
      newClient: vi.fn().mockImplementation(() => {
        if (apiFactory.newClient.mock.calls.length === 1) return { client: { getBot } }
        throw new Error('nested credential probe complete')
      }),
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
      local: true,
      profile: 'local',
      apiUrl: 'https://dev.local',
      workspaceId: 'dev_ws',
      token: 'explicit_poison_token',
    } as any)

    await expect((command as any)._runAgentTunnelDev()).rejects.toThrow(/nested credential probe complete/)

    const expectedCredentials = {
      apiUrl: 'https://dev.local',
      workspaceId: 'dev_ws',
      token: 'brt_pat_local',
    }
    expect(apiFactory.newClient).toHaveBeenNthCalledWith(1, expectedCredentials, expect.any(Logger))
    expect(apiFactory.newClient).toHaveBeenNthCalledWith(2, expectedCredentials, expect.any(Logger))
    expect(JSON.stringify(apiFactory.newClient.mock.calls)).not.toContain('explicit_poison_token')
  })

  it('rejects normal dev --local when agent.local differs from the selected profile before target network work', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'dev_agent',
        devTargetBotId: '42',
        workspaceId: 'foreign_ws',
        apiUrl: 'https://foreign.example',
      })
    )
    const apiFactory = { newClient: vi.fn() }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
      local: true,
      profile: 'local',
    } as any)

    await expect((command as any)._runAgentTunnelDev()).rejects.toThrow(/agent\.local\.json.*selected profile/i)

    expect(apiFactory.newClient).not.toHaveBeenCalled()
  })

  it('pins the nested non-local dev command to the resolved profile instead of stale global cache credentials', async () => {
    fs.writeFileSync(
      path.join(botpressHome, 'global.cache.json'),
      JSON.stringify({
        activeProfile: 'default',
        apiUrl: 'https://cache-poison.example',
        workspaceId: 'cache_poison_ws',
        token: 'cache_poison_token',
      })
    )
    const botPath = path.join(workDir, '.adk', 'bot')
    vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(botPath)
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const getBot = vi.fn().mockResolvedValue({ bot: devBot('dev_agent', '42') })
    const apiFactory = {
      newClient: vi.fn().mockImplementation(() => {
        if (apiFactory.newClient.mock.calls.length === 1) return { client: { getBot } }
        throw new Error('nested credential probe complete')
      }),
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)

    await expect((command as any)._runAgentTunnelDev()).rejects.toThrow(/nested credential probe complete/)

    const expectedCredentials = {
      apiUrl: 'https://cloud.example',
      workspaceId: 'ws_123',
      token: 'brt_pat_xxx',
    }
    expect(apiFactory.newClient).toHaveBeenNthCalledWith(1, expectedCredentials, expect.any(Logger))
    expect(apiFactory.newClient).toHaveBeenNthCalledWith(2, expectedCredentials, expect.any(Logger))
    expect(JSON.stringify(apiFactory.newClient.mock.calls)).not.toContain('cache_poison')
  })

  it('provisions before first generation and keeps the numeric target through watcher regeneration', async () => {
    fs.rmSync(path.join(workDir, 'agent.local.json'))
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: 'prod_bot_must_not_be_used',
        workspaceId: 'ws_123',
      })
    )
    const botPath = path.join(workDir, '.adk', 'bot')
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(botPath)
    const createBot = vi.fn().mockResolvedValue({ bot: devBot('new_local_dev', '42') })
    const apiFactory = {
      newClient: vi.fn().mockReturnValue({ client: { createBot } }),
    }
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    let onChange: Parameters<typeof utils.filewatcher.FileWatcher.watch>[1] | undefined
    const close = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(utils.filewatcher.FileWatcher, 'watch').mockImplementation(async (_dir, handler) => {
      onChange = handler
      return { close } as any
    })
    vi.spyOn(DevCommand.prototype, 'run').mockImplementation(async () => {
      const cachePath = path.join(botPath, '.botpress', 'project.cache.json')
      fs.mkdirSync(path.dirname(cachePath), { recursive: true })
      fs.writeFileSync(cachePath, JSON.stringify({ devId: 'new_local_dev' }))
      await onChange!([{ type: 'update', path: path.join(workDir, 'src', 'changed.ts') }])
    })
    const argv = {
      ...makeArgv(botpressHome, workDir),
      check: false,
      watch: true,
      tunnelId: 'new_local_dev',
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), argv as any)

    await (command as any)._runAgentTunnelDev()

    expect(generateSpy).toHaveBeenNthCalledWith(1, workDir, expect.any(Function), {
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'new_local_dev',
        credentials: {
          token: 'brt_pat_xxx',
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
        },
      },
    })
    expect(generateSpy).toHaveBeenNthCalledWith(2, workDir, expect.any(Function), {
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: '42',
        runtimeBotId: 'new_local_dev',
        credentials: {
          token: 'brt_pat_xxx',
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
        },
      },
    })
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('prod_bot_must_not_be_used')
  })

  it('provisions and persists the complete dev target before the first agent generation', async () => {
    fs.rmSync(path.join(workDir, 'agent.local.json'))
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: '3',
        workspaceId: 'ws_123',
      })
    )
    const runtimeBotId = 'dev_opaque'
    const devTargetBotId = '42'
    const botPath = path.join(workDir, '.adk', 'bot')
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(botPath)
    const createBot = vi.fn().mockResolvedValue({ bot: devBot(runtimeBotId, devTargetBotId) })
    const apiClient = {
      url: 'https://cloud.example',
      token: 'brt_pat_xxx',
      workspaceId: 'ws_123',
      client: { createBot },
    }
    const apiFactory = { newClient: vi.fn().mockReturnValue(apiClient) }
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    const argv = {
      ...makeArgv(botpressHome, workDir),
      check: false,
      watch: false,
      tunnelId: runtimeBotId,
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), argv as any)

    await (command as any)._runAgentTunnelDev()

    expect(createBot).toHaveBeenCalledOnce()
    expect(createBot).toHaveBeenCalledWith({
      dev: true,
      url: `https://botruntime.ru/${runtimeBotId}`,
      tags: { 'botruntime.productionBotId': '3' },
    })
    expect(generateSpy).toHaveBeenCalledOnce()
    expect(createBot.mock.invocationCallOrder[0]!).toBeLessThan(generateSpy.mock.invocationCallOrder[0]!)
    expect(generateSpy).toHaveBeenCalledWith(workDir, expect.any(Function), {
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: devTargetBotId,
        runtimeBotId,
        credentials: {
          token: 'brt_pat_xxx',
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
        },
      },
    })
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf-8'))).toEqual({
      devId: runtimeBotId,
      devTargetBotId,
      devApiUrl: 'https://cloud.example',
      devWorkspaceId: 'ws_123',
    })
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('"botId":"3"')
  })

  it('reuses agent.local dev identities and retroactively links the runtime to production', async () => {
    const runtimeBotId = 'dev_opaque'
    const devTargetBotId = '42'
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: runtimeBotId,
        devTargetBotId,
        workspaceId: 'dev_ws',
        apiUrl: 'https://dev.local',
      })
    )
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: '3',
        workspaceId: 'prod_ws',
      })
    )
    const botPath = path.join(workDir, '.adk', 'bot')
    const generateSpy = vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(botPath)
    const createBot = vi.fn().mockResolvedValue({ bot: devBot(runtimeBotId, devTargetBotId) })
    const getBot = vi.fn().mockResolvedValue({ bot: devBot(runtimeBotId, devTargetBotId) })
    const apiFactory = {
      newClient: vi.fn().mockReturnValue({
        url: 'https://cloud.example',
        token: 'brt_pat_xxx',
        workspaceId: 'ws_123',
        client: { createBot, getBot },
      }),
    }
    vi.spyOn(DevCommand.prototype, 'run').mockResolvedValue(undefined)
    const argv = {
      ...makeArgv(botpressHome, workDir),
      check: false,
      watch: false,
      tunnelId: runtimeBotId,
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), argv as any)

    await (command as any)._runAgentTunnelDev()

    expect(createBot).toHaveBeenCalledWith({
      dev: true,
      url: `https://botruntime.ru/${runtimeBotId}`,
      tags: { 'botruntime.productionBotId': '3' },
    })
    expect(generateSpy).toHaveBeenCalledOnce()
    expect(generateSpy).toHaveBeenCalledWith(workDir, expect.any(Function), {
      adkCommand: 'adk-dev',
      configTarget: {
        environment: 'dev',
        botId: devTargetBotId,
        runtimeBotId,
        credentials: {
          token: 'brt_pat_xxx',
          apiUrl: 'https://cloud.example',
          workspaceId: 'ws_123',
        },
      },
    })
    expect(apiFactory.newClient).toHaveBeenCalledWith(
      {
        token: 'brt_pat_xxx',
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
      },
      expect.any(Logger)
    )
    expect(JSON.stringify(generateSpy.mock.calls)).not.toContain('prod_bot_must_not_be_used')
  })

  it('fails before dev target network work when --local lacks local stack coordinates', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: 'dev_agent', devTargetBotId: '42' })
    )
    const apiFactory = { newClient: vi.fn() }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
      local: true,
    } as any)

    await expect((command as any)._runAgentTunnelDev()).rejects.toThrow(/agent\.local\.json.*apiUrl/i)

    expect(apiFactory.newClient).not.toHaveBeenCalled()
  })

  it('refreshes the parent dev snapshot from Cloud inside the nested initial deploy before dev run returns', async () => {
    const botPath = path.join(workDir, '.adk', 'bot')
    vi.spyOn(adkBundle, 'generateAgentBot').mockResolvedValue(botPath)
    vi.spyOn(adkDevId, 'restoreDevTunnelId').mockReturnValue(undefined)
    vi.spyOn(adkDevId, 'preserveDevId').mockReturnValue(undefined)
    const getBot = vi.fn().mockResolvedValue({ bot: devBot('dev_agent', '42') })
    const apiClient = {
      url: 'https://cloud.example',
      token: 'brt_pat_xxx',
      workspaceId: 'ws_123',
      client: { getBot },
    }
    const apiFactory = { newClient: vi.fn().mockReturnValue(apiClient) }
    const order: string[] = []
    const refreshCompletedDependencySnapshot = vi.fn().mockImplementation(async () => {
      order.push('snapshot-refreshed')
      return { status: 'refreshed' as const }
    })
    vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
      refreshCompletedDependencySnapshot: refreshCompletedDependencySnapshot as any,
    })
    vi.spyOn(DevCommand.prototype, 'run').mockImplementation(async function (this: DevCommand) {
      order.push('nested-started')
      const postInitialDeploy = (this as any)._afterInitialDevBotDeploy
      expect(postInitialDeploy).toBeTypeOf('function')
      await postInitialDeploy()
      order.push('nested-still-running')
    })
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
      watch: false,
    } as any)

    await (command as any)._runAgentTunnelDev()

    expect(refreshCompletedDependencySnapshot).toHaveBeenCalledWith({
      projectPath: workDir,
      client: apiClient.client,
      target: {
        env: 'dev',
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
        botId: '42',
      },
      runtimeBotId: 'dev_agent',
    })
    expect(order).toEqual(['nested-started', 'snapshot-refreshed', 'nested-still-running'])
  })

  it('does not refresh or create a parent snapshot before dependency migration has completed', async () => {
    const refreshCompletedDependencySnapshot = vi.fn().mockResolvedValue({ status: 'not-initialized' })
    vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
      refreshCompletedDependencySnapshot: refreshCompletedDependencySnapshot as any,
    })
    const apiClient = { getBot: vi.fn() }
    const apiFactory = {
      newClient: vi.fn().mockReturnValue({
        url: 'https://cloud.example',
        token: 'brt_pat_xxx',
        workspaceId: 'ws_123',
        client: apiClient,
      }),
    }
    const command = new DevCommand(apiFactory as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
      watch: false,
    } as any)

    await (command as any)._refreshAgentDevSnapshot(
      workDir,
      {
        token: 'brt_pat_xxx',
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
      },
      { runtimeBotId: 'dev_agent', targetBotId: '42' }
    )

    expect(refreshCompletedDependencySnapshot).toHaveBeenCalledWith({
      projectPath: workDir,
      client: apiClient,
      target: {
        env: 'dev',
        apiUrl: 'https://cloud.example',
        workspaceId: 'ws_123',
        botId: '42',
      },
      runtimeBotId: 'dev_agent',
    })
  })
})

describe('DevCommand dev target routing', () => {
  let botpressHome: string
  let workDir: string

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-dev-target-'))
    writeProfile(botpressHome)
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('persists the numeric target returned by create while registration and updates keep the opaque runtime id', async () => {
    const runtimeBotId = 'dev_opaque'
    const devTargetBotId = '42'
    writeProjectCacheState(workDir, { tunnelId: runtimeBotId })
    fs.writeFileSync(path.join(workDir, 'bot.json'), JSON.stringify({ botId: 3 }))
    const createdBot = devBot(runtimeBotId, devTargetBotId)
    const createBot = vi.fn().mockResolvedValue({ bot: createdBot })
    const getBot = vi.fn()
    const updateBot = vi.fn().mockImplementation(async (body) => ({
      bot: { ...createdBot, ...body, tags: createdBot.tags },
    }))
    const api = { url: 'https://botruntime.ru', client: { createBot, getBot, updateBot } }
    const tables = vi.spyOn(TablesPublisher.prototype, 'deployTables').mockResolvedValue(undefined)
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)

    await (command as any)._deployDevBot(api, `https://botruntime.ru/${runtimeBotId}`, {})

    expect(getBot).not.toHaveBeenCalled()
    expect(createBot).toHaveBeenCalledWith({
      dev: true,
      url: `https://botruntime.ru/${runtimeBotId}`,
      tags: { 'botruntime.productionBotId': '3' },
    })
    expect(updateBot).toHaveBeenCalledWith(expect.objectContaining({ id: runtimeBotId }))
    expect(tables).toHaveBeenCalledWith({
      botId: devTargetBotId,
      botDefinition: {},
    })
    expect(readProjectCacheState(workDir)).toEqual({
      tunnelId: runtimeBotId,
      devId: runtimeBotId,
      devTargetBotId,
    })
  })

  it('runs the parent snapshot refresh only after updateBot and registration validation succeed', async () => {
    const runtimeBotId = 'dev_opaque'
    writeProjectCacheState(workDir, { tunnelId: runtimeBotId })
    const createdBot = devBot(runtimeBotId, '42')
    const order: string[] = []
    const updateBot = vi.fn().mockImplementation(async (body) => {
      order.push('updateBot')
      return { bot: { ...createdBot, ...body, tags: createdBot.tags } }
    })
    const api = {
      client: {
        createBot: vi.fn().mockResolvedValue({ bot: createdBot }),
        getBot: vi.fn(),
        updateBot,
      },
    }
    vi.spyOn(TablesPublisher.prototype, 'deployTables').mockResolvedValue(undefined)
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)
    const refresh = vi.fn().mockImplementation(async () => {
      order.push('refreshSnapshot')
    })
    ;(command as any)._afterInitialDevBotDeploy = refresh

    await (command as any)._deployDevBot(api, `https://botruntime.ru/${runtimeBotId}`, {})

    expect(refresh).toHaveBeenCalledOnce()
    expect(order).toEqual(['updateBot', 'refreshSnapshot'])
  })

  it('never refreshes the parent snapshot when updateBot fails', async () => {
    const runtimeBotId = 'dev_opaque'
    writeProjectCacheState(workDir, { tunnelId: runtimeBotId })
    const createdBot = devBot(runtimeBotId, '42')
    const api = {
      client: {
        createBot: vi.fn().mockResolvedValue({ bot: createdBot }),
        getBot: vi.fn(),
        updateBot: vi.fn().mockRejectedValue(new Error('update failed')),
      },
    }
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)
    const refresh = vi.fn()
    ;(command as any)._afterInitialDevBotDeploy = refresh

    await expect((command as any)._deployDevBot(api, `https://botruntime.ru/${runtimeBotId}`, {})).rejects.toThrow(
      'Could not deploy dev bot'
    )

    expect(refresh).not.toHaveBeenCalled()
  })

  it('never refreshes the parent snapshot when integration registration validation fails', async () => {
    const runtimeBotId = 'dev_opaque'
    writeProjectCacheState(workDir, { tunnelId: runtimeBotId })
    const createdBot = devBot(runtimeBotId, '42')
    const api = {
      client: {
        createBot: vi.fn().mockResolvedValue({ bot: createdBot }),
        getBot: vi.fn(),
        updateBot: vi.fn().mockResolvedValue({
          bot: {
            ...createdBot,
            integrations: {
              telegram: {
                status: 'registration_failed',
                statusReason: 'registration failed',
              },
            },
          },
        }),
      },
    }
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)
    const refresh = vi.fn()
    ;(command as any)._afterInitialDevBotDeploy = refresh

    await expect((command as any)._deployDevBot(api, `https://botruntime.ru/${runtimeBotId}`, {})).rejects.toThrow(
      'Some integrations failed to register'
    )

    expect(refresh).not.toHaveBeenCalled()
  })

  it('reuses the opaque runtime id for registration GET/PUT and reserves the numeric target for tables', async () => {
    const runtimeBotId = 'dev_opaque'
    const devTargetBotId = '42'
    writeProjectCacheState(workDir, {
      tunnelId: runtimeBotId,
      devId: runtimeBotId,
      devTargetBotId,
    })
    const existingBot = devBot(runtimeBotId, devTargetBotId)
    const getBot = vi.fn().mockResolvedValue({ bot: existingBot })
    const createBot = vi.fn()
    const updateBot = vi.fn().mockImplementation(async (body) => ({
      bot: { ...existingBot, ...body, tags: existingBot.tags },
    }))
    const api = { client: { createBot, getBot, updateBot } }
    const tables = vi.spyOn(TablesPublisher.prototype, 'deployTables').mockResolvedValue(undefined)
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)

    await (command as any)._deployDevBot(api, `https://botruntime.ru/${runtimeBotId}`, {})

    expect(getBot).toHaveBeenCalledWith({ id: runtimeBotId })
    expect(createBot).not.toHaveBeenCalled()
    expect(updateBot).toHaveBeenCalledWith(expect.objectContaining({ id: runtimeBotId }))
    expect(getBot).not.toHaveBeenCalledWith({ id: devTargetBotId })
    expect(updateBot).not.toHaveBeenCalledWith(expect.objectContaining({ id: devTargetBotId }))
    expect(tables).toHaveBeenCalledWith({
      botId: devTargetBotId,
      botDefinition: {},
    })
  })

  it('aborts on an invalid cached dev target before create, update, or tables', async () => {
    const runtimeBotId = 'dev_opaque'
    writeProjectCacheState(workDir, {
      tunnelId: runtimeBotId,
      devId: runtimeBotId,
    })
    const getBot = vi.fn().mockResolvedValue({ bot: { ...devBot(runtimeBotId, '42'), tags: {} } })
    const createBot = vi.fn()
    const updateBot = vi.fn()
    const tables = vi.spyOn(TablesPublisher.prototype, 'deployTables').mockResolvedValue(undefined)
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)

    await expect(
      (command as any)._deployDevBot(
        { client: { getBot, createBot, updateBot } },
        `https://botruntime.ru/${runtimeBotId}`,
        {}
      )
    ).rejects.toThrow(/dev target/i)

    expect(createBot).not.toHaveBeenCalled()
    expect(updateBot).not.toHaveBeenCalled()
    expect(tables).not.toHaveBeenCalled()
  })

  it('aborts on a transient cached dev GET failure without minting a replacement', async () => {
    const runtimeBotId = 'dev_opaque'
    writeProjectCacheState(workDir, {
      tunnelId: runtimeBotId,
      devId: runtimeBotId,
      devTargetBotId: '42',
    })
    const getBot = vi.fn().mockRejectedValue(new Error('network unavailable'))
    const createBot = vi.fn()
    const updateBot = vi.fn()
    const tables = vi.spyOn(TablesPublisher.prototype, 'deployTables').mockResolvedValue(undefined)
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)

    await expect(
      (command as any)._deployDevBot(
        { client: { getBot, createBot, updateBot } },
        `https://botruntime.ru/${runtimeBotId}`,
        {}
      )
    ).rejects.toThrow(/network unavailable/i)

    expect(createBot).not.toHaveBeenCalled()
    expect(updateBot).not.toHaveBeenCalled()
    expect(tables).not.toHaveBeenCalled()
  })

  it('creates only after a verified cached 404 and revalidates the returned target', async () => {
    const runtimeBotId = 'dev_opaque'
    writeProjectCacheState(workDir, {
      tunnelId: runtimeBotId,
      devId: runtimeBotId,
      devTargetBotId: '41',
    })
    const notFound = Object.assign(new Error('missing'), {
      isApiError: true,
      code: 404,
      type: 'ResourceNotFound',
    })
    const getBot = vi.fn().mockRejectedValue(notFound)
    const createdBot = devBot(runtimeBotId, '42')
    const createBot = vi.fn().mockResolvedValue({ bot: createdBot })
    const updateBot = vi.fn().mockResolvedValue({ bot: createdBot })
    vi.spyOn(TablesPublisher.prototype, 'deployTables').mockResolvedValue(undefined)
    const command = new DevCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir),
      check: false,
    } as any)

    await (command as any)._deployDevBot(
      { client: { getBot, createBot, updateBot } },
      `https://botruntime.ru/${runtimeBotId}`,
      {}
    )

    expect(createBot).toHaveBeenCalledOnce()
    expect(updateBot).toHaveBeenCalledWith(expect.objectContaining({ id: runtimeBotId }))
    expect(readProjectCacheState(workDir)).toMatchObject({
      devId: runtimeBotId,
      devTargetBotId: '42',
    })
  })
})
