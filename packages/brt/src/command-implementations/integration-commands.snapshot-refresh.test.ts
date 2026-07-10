import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adkBundle from '../adk-bundle'
import { Logger } from '../logger'
import { CloudIntegrationInstallCommand, CloudIntegrationRegisterCommand } from './integration-commands'

const API_URL = 'https://stateful.example'
const WORKSPACE_ID = 'ws_stateful'
const PAT = 'brt_pat_stateful'

type FetchCall = { url: string; init: RequestInit }

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function installCommand(botpressHome: string, workDir: string, configFile: string, dev: boolean) {
  return new CloudIntegrationInstallCommand({} as any, {} as any, new Logger(), {
    botpressHome,
    workDir,
    profile: 'default',
    apiUrl: undefined,
    botId: undefined,
    local: false,
    dev,
    ref: 'telegram@0.0.1',
    alias: undefined,
    configFile,
    configStdin: false,
  } as any)
}

function registerCommand(botpressHome: string, workDir: string, webhookId: string, dev: boolean) {
  return new CloudIntegrationRegisterCommand({} as any, {} as any, new Logger(), {
    botpressHome,
    workDir,
    profile: 'default',
    apiUrl: undefined,
    botId: undefined,
    local: false,
    dev,
    webhookId,
  } as any)
}

function cloudBot(id: string, targetBotId = '42') {
  return {
    bot: {
      id,
      dev: id === 'dev-opaque',
      tags: id === 'dev-opaque' ? { 'botruntime.devTargetBotId': targetBotId } : {},
      integrations: {
        telegram: {
          id: 'integration_telegram',
          installationId: 'installation_telegram',
          name: 'telegram',
          version: '0.0.1',
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

function mockSnapshotTools(opts: {
  marker?: boolean
  refresh?: (args: any) => Promise<unknown>
}) {
  const refreshCompletedDependencySnapshot = vi.fn(async (args: any) => {
    if (opts.marker === false) return { status: 'not-initialized' as const }
    await (opts.refresh ?? (async () => undefined))(args)
    return { status: 'refreshed' as const }
  })
  const loader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
    refreshCompletedDependencySnapshot: refreshCompletedDependencySnapshot as any,
  })
  return { loader, refreshCompletedDependencySnapshot }
}

describe('agent integration mutations refresh completed dependency snapshots', () => {
  const originalFetch = global.fetch
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let output: string[]

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-stateful-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-stateful-project-'))
    calls = []
    output = []
    writeJson(path.join(botpressHome, 'profiles.json'), {
      default: { apiUrl: API_URL, workspaceId: WORKSPACE_ID, token: PAT },
    })
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      output.push(String(chunk))
      return true
    }) as typeof process.stdout.write)
  })

  afterEach(() => {
    global.fetch = originalFetch
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('refreshes the exact dev stack after install using PAT, opaque runtime id, numeric target and marker proof', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.local.json'), {
      devId: 'dev-opaque',
      devTargetBotId: '42',
      devApiUrl: API_URL,
      devWorkspaceId: WORKSPACE_ID,
    })
    writeJson(path.join(workDir, '.adk', 'dependencies', 'migration.json'), { version: 2 })
    const configFile = path.join(workDir, 'telegram.json')
    writeJson(configFile, { botToken: 'secret' })
    const snapshot = mockSnapshotTools({
      refresh: async (args) => args.client.getBot({ id: args.runtimeBotId }),
    })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url === `${API_URL}/v1/admin/bots/dev-opaque`) {
        return Response.json(cloudBot('dev-opaque').bot ? cloudBot('dev-opaque') : {})
      }
      if (
        call.init.method === 'POST' &&
        call.url === `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/42/integrations`
      ) {
        return Response.json({ installationId: '7', webhookId: 'wh_dev', status: 'pending' })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await installCommand(botpressHome, workDir, configFile, true).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${API_URL}/v1/admin/bots/dev-opaque`],
      ['POST', `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/42/integrations`],
      ['GET', `${API_URL}/v1/admin/bots/dev-opaque`],
    ])
    expect(snapshot.refreshCompletedDependencySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      projectPath: workDir,
      target: { env: 'dev', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '42' },
      runtimeBotId: 'dev-opaque',
    }))
    expect(calls[2]!.init.headers).toMatchObject({
      authorization: `Bearer ${PAT}`,
      'x-workspace-id': WORKSPACE_ID,
    })
  })

  it('refreshes the exact prod target after register through the profile PAT rather than the bot key', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), { botId: '7', workspaceId: WORKSPACE_ID, apiUrl: API_URL })
    writeJson(path.join(botpressHome, 'bots.json'), { default: { '7': { apiKey: 'bot_key' } } })
    writeJson(path.join(workDir, '.adk', 'dependencies', 'migration.json'), { version: 2 })
    const snapshot = mockSnapshotTools({
      refresh: async (args) => args.client.getBot({ id: args.target.botId }),
    })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'POST' && call.url === `${API_URL}/v1/admin/integrations/wh_prod/register`) {
        return Response.json({ ok: true, webhookId: 'wh_prod', webhookUrl: 'https://hooks.example/wh_prod' })
      }
      if (call.init.method === 'GET' && call.url === `${API_URL}/v1/admin/bots/7`) {
        return Response.json(cloudBot('7'))
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await registerCommand(botpressHome, workDir, 'wh_prod', false).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', `${API_URL}/v1/admin/integrations/wh_prod/register`],
      ['GET', `${API_URL}/v1/admin/bots/7`],
    ])
    expect(calls[0]!.init.headers).toMatchObject({ authorization: 'Bearer bot_key', 'x-bot-id': '7' })
    expect(calls[1]!.init.headers).toMatchObject({ authorization: `Bearer ${PAT}`, 'x-workspace-id': WORKSPACE_ID })
    expect(snapshot.refreshCompletedDependencySnapshot).toHaveBeenCalledWith(expect.objectContaining({
      projectPath: workDir,
      target: { env: 'prod', apiUrl: API_URL, workspaceId: WORKSPACE_ID, botId: '7' },
    }))
    expect(snapshot.refreshCompletedDependencySnapshot.mock.calls[0]![0]).not.toHaveProperty('runtimeBotId')
  })

  it('does not fabricate a marker and tells an agent user which stateful command initializes prod', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), { botId: '7', workspaceId: WORKSPACE_ID, apiUrl: API_URL })
    writeJson(path.join(botpressHome, 'bots.json'), { default: { '7': { apiKey: 'bot_key' } } })
    const configFile = path.join(workDir, 'telegram.json')
    writeJson(configFile, { botToken: 'secret' })
    const snapshot = mockSnapshotTools({ marker: false })
    global.fetch = vi.fn(async () =>
      Response.json({ installationId: 7, webhookId: 'wh_prod', webhookSecret: 'secret_once' })
    ) as typeof fetch

    await installCommand(botpressHome, workDir, configFile, false).run()

    expect(snapshot.loader).toHaveBeenCalledOnce()
    expect(snapshot.refreshCompletedDependencySnapshot).toHaveBeenCalledOnce()
    expect(fs.existsSync(path.join(workDir, '.adk', 'dependencies', 'migration.json'))).toBe(false)
    expect(output.join('')).toMatch(/brt deploy --adk/i)
  })

  it('leaves classic projects unchanged even if a stale marker-shaped path exists', async () => {
    writeJson(path.join(workDir, 'bot.json'), { botId: 7, apiUrl: API_URL })
    writeJson(path.join(botpressHome, 'bots.json'), { default: { '7': { apiKey: 'bot_key' } } })
    writeJson(path.join(workDir, '.adk', 'dependencies', 'migration.json'), { version: 2 })
    const configFile = path.join(workDir, 'telegram.json')
    writeJson(configFile, { botToken: 'secret' })
    const loader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')
    global.fetch = vi.fn(async () =>
      Response.json({ installationId: 7, webhookId: 'wh_classic', webhookSecret: 'classic_secret' })
    ) as typeof fetch

    await installCommand(botpressHome, workDir, configFile, false).run()

    expect(loader).not.toHaveBeenCalled()
  })

  it('reports partial success and preserves prior snapshot bytes when local refresh fails after Cloud install', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), { botId: '7', workspaceId: WORKSPACE_ID, apiUrl: API_URL })
    writeJson(path.join(botpressHome, 'bots.json'), { default: { '7': { apiKey: 'bot_key' } } })
    writeJson(path.join(workDir, '.adk', 'dependencies', 'migration.json'), { version: 2 })
    const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'prod.json')
    const prior = '{"sentinel":"prior snapshot bytes"}\n'
    fs.writeFileSync(snapshotPath, prior)
    const configFile = path.join(workDir, 'telegram.json')
    writeJson(configFile, { botToken: 'secret' })
    mockSnapshotTools({ refresh: async () => { throw new Error('readiness unavailable') } })
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return Response.json({ installationId: 7, webhookId: 'wh_partial', webhookSecret: 'secret_once' })
    }) as typeof fetch

    await expect(installCommand(botpressHome, workDir, configFile, false).run()).rejects.toThrow(
      /install succeeded in Cloud.*snapshot.*brt deploy --adk|Cloud.*succeeded.*brt deploy --adk/i
    )

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', `${API_URL}/v1/admin/integrations/install`],
    ])
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(prior)
  })
})
