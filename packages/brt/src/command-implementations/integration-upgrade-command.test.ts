import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as adkBundle from '../adk-bundle'
import type { WorkspaceIntegrationInstallation } from '../api/cloudapi-client'
import { Logger } from '../logger'
import { CloudIntegrationUpgradeCommand } from './integration-commands'

const API_URL = 'https://upgrade.example'
const WORKSPACE_ID = '101'
const BOT_ID = '7'
const PAT = 'brt_pat_must_not_leak'

type FetchCall = { url: string; init: RequestInit }

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

async function captureError(promise: Promise<void>): Promise<Error> {
  try {
    await promise
  } catch (thrown) {
    return thrown as Error
  }
  throw new Error('expected command to fail')
}

function prepareProdProject(workDir: string, alias = 'primary') {
  fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
  writeJson(path.join(workDir, 'agent.json'), {
    botId: BOT_ID,
    workspaceId: WORKSPACE_ID,
    apiUrl: API_URL,
  })
  const linkPath = path.join(workDir, 'bot.json')
  writeJson(linkPath, {
    integrations: [{ ref: 'telegram@1.1.3', alias, webhookId: 'wh_existing' }],
  })
  const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'migration.json')
  writeJson(snapshotPath, { sentinel: 'prior snapshot' })
  return {
    linkPath,
    snapshotPath,
    linkBefore: fs.readFileSync(linkPath, 'utf8'),
    snapshotBefore: fs.readFileSync(snapshotPath, 'utf8'),
  }
}

function currentInstallation(ref = 'telegram@1.1.3', alias = 'primary'): WorkspaceIntegrationInstallation {
  const separator = ref.lastIndexOf('@')
  return {
    id: 'installation-7',
    name: ref.slice(0, separator),
    version: ref.slice(separator + 1),
    ref,
    alias,
    enabled: true,
    status: 'registered',
    statusReason: '',
    webhookId: 'wh_existing',
    registered: true,
  }
}

function upgradeCommand(
  botpressHome: string,
  workDir: string,
  overrides: Partial<{
    ref: string
    alias: string
    dev: boolean
    wait: boolean
    local: boolean
  }> = {}
) {
  const alias = Object.prototype.hasOwnProperty.call(overrides, 'alias') ? overrides.alias : 'primary'
  return new CloudIntegrationUpgradeCommand({} as any, {} as any, new Logger(), {
    botpressHome,
    workDir,
    profile: 'default',
    apiUrl: undefined,
    botId: undefined,
    local: overrides.local ?? false,
    dev: overrides.dev ?? false,
    ref: overrides.ref ?? 'telegram@1.2.0',
    alias,
    wait: overrides.wait ?? false,
  } as any)
}

describe('integrations upgrade command', () => {
  const originalFetch = global.fetch
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string[]

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-upgrade-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-upgrade-project-'))
    calls = []
    stdout = []
    writeJson(path.join(botpressHome, 'profiles.json'), {
      default: { apiUrl: API_URL, workspaceId: WORKSPACE_ID, token: PAT },
    })
    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stdout.push(String(chunk))
      return true
    }) as typeof process.stdout.write)
  })

  afterEach(() => {
    global.fetch = originalFetch
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('fails an inexact ref before target lookup or network access', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    global.fetch = fetchMock

    await expect(
      upgradeCommand(botpressHome, path.join(workDir, 'must-not-exist'), {
        ref: 'telegram@latest',
      }).run()
    ).rejects.toThrow(/exact SemVer/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects --wait before project lookup or network access because Cloud has no runtime readiness contract', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    global.fetch = fetchMock

    await expect(
      upgradeCommand(botpressHome, path.join(workDir, 'must-not-exist'), {
        wait: true,
      }).run()
    ).rejects.toThrow(/runtime readiness.*not supported by Cloud/i)

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('lists then directly repoints the one prod installation, refreshes its snapshot, and never installs or registers', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: BOT_ID,
      workspaceId: WORKSPACE_ID,
      apiUrl: API_URL,
    })
    writeJson(path.join(workDir, 'bot.json'), {
      integrations: [{ ref: 'telegram@1.1.3', alias: 'telegram', webhookId: 'wh_existing' }],
    })
    writeJson(path.join(workDir, '.adk', 'dependencies', 'migration.json'), {
      version: 2,
    })
    const storePath = path.join(botpressHome, 'bots.json')
    writeJson(storePath, {
      default: {
        [BOT_ID]: { apiKey: 'bot-key-secret', webhookSecret: 'webhook-secret' },
      },
    })
    const storeBefore = fs.readFileSync(storePath, 'utf8')
    const refreshCompletedDependencySnapshot = vi.fn(async () => ({
      status: 'refreshed' as const,
    }))
    vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
      refreshCompletedDependencySnapshot: refreshCompletedDependencySnapshot as any,
    })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation('telegram@1.1.3', '')] })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json({
          ok: true,
          installationId: 'installation-7',
          integrationId: 'definition-12',
          ref: 'telegram@1.2.0',
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await upgradeCommand(botpressHome, workDir, { alias: undefined }).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${BOT_ID}/integrations`],
      ['POST', `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${BOT_ID}/integrations/installation-7/repoint`],
    ])
    for (const call of calls) {
      expect(call.init.headers).toMatchObject({
        authorization: `Bearer ${PAT}`,
      })
      expect(call.init.headers).not.toHaveProperty('x-bot-id')
    }
    expect(calls.some((call) => call.url.endsWith('/integrations') && call.init.method === 'POST')).toBe(false)
    expect(calls.some((call) => call.url.endsWith('/register'))).toBe(false)
    expect(refreshCompletedDependencySnapshot).toHaveBeenCalledWith(
      expect.objectContaining({
        projectPath: workDir,
        target: {
          env: 'prod',
          apiUrl: API_URL,
          workspaceId: WORKSPACE_ID,
          botId: BOT_ID,
        },
      })
    )
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'bot.json'), 'utf8'))).toEqual({
      integrations: [{ ref: 'telegram@1.2.0', alias: 'telegram', webhookId: 'wh_existing' }],
    })
    expect(fs.readFileSync(storePath, 'utf8')).toBe(storeBefore)
    const output = stdout.join('')
    expect(output).toContain('brt deploy --adk')
    expect(output).not.toContain('brt integrations register')
    expect(output).not.toContain(PAT)
    expect(output).not.toContain('bot-key-secret')
    expect(output).not.toContain('webhook-secret')
  })

  it('keeps prod metadata and snapshots byte-identical when dev direct repoint returns 409', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: 'prod-bot',
      workspaceId: '999',
      apiUrl: 'https://prod-must-not-be-used.example',
    })
    writeJson(path.join(workDir, 'agent.local.json'), {
      devId: 'dev-opaque',
      devTargetBotId: '42',
      devApiUrl: API_URL,
      devWorkspaceId: WORKSPACE_ID,
    })
    const prodMetadataPath = path.join(workDir, 'bot.json')
    writeJson(prodMetadataPath, {
      integrations: [{ ref: 'telegram@1.1.3', alias: 'primary', webhookId: 'wh_prod' }],
    })
    const snapshotPath = path.join(workDir, '.adk', 'dependencies', 'dev.json')
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true })
    fs.writeFileSync(snapshotPath, '{"sentinel":"prior snapshot"}\n')
    const prodBefore = fs.readFileSync(prodMetadataPath, 'utf8')
    const snapshotBefore = fs.readFileSync(snapshotPath, 'utf8')
    const refreshLoader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.url === `${API_URL}/v1/admin/bots/dev-opaque`) {
        return Response.json({
          bot: {
            id: 'dev-opaque',
            dev: true,
            tags: { 'botruntime.devTargetBotId': '42' },
          },
        })
      }
      if (call.init.method === 'GET' && call.url.endsWith('/bots/42/integrations')) {
        return Response.json({ installations: [currentInstallation()] })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json(
          {
            id: 'err_409',
            code: 409,
            type: 'ConflictError',
            message: 'integration: stored config is incompatible with target version: required field "region" is missing',
            secretValue: 'never-print-this',
          },
          { status: 409 }
        )
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir, { dev: true }).run())

    expect(error.message).toMatch(/409.*required field "region" is missing/i)
    expect(error.message).not.toMatch(/outcome unknown|inspect.*installation ref|roll back with/i)
    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${API_URL}/v1/admin/bots/dev-opaque`],
      ['GET', `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/42/integrations`],
      ['POST', `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/42/integrations/installation-7/repoint`],
    ])
    expect(calls.some((call) => call.url.includes('prod-must-not-be-used'))).toBe(false)
    expect(refreshLoader).not.toHaveBeenCalled()
    expect(fs.readFileSync(prodMetadataPath, 'utf8')).toBe(prodBefore)
    expect(fs.readFileSync(snapshotPath, 'utf8')).toBe(snapshotBefore)
    expect(stdout.join('')).not.toContain('never-print-this')
  })

  it('fails before mutation when the selected installation already points to the target ref', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: BOT_ID,
      workspaceId: WORKSPACE_ID,
      apiUrl: API_URL,
    })
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation('telegram@1.2.0')] })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await expect(upgradeCommand(botpressHome, workDir).run()).rejects.toThrow(
      /already points to telegram@1\.2\.0/i
    )
    expect(calls).toHaveLength(1)
  })

  it('supports rollback as the same atomic upgrade to the former exact version', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: BOT_ID,
      workspaceId: WORKSPACE_ID,
      apiUrl: API_URL,
    })
    writeJson(path.join(workDir, 'bot.json'), {
      integrations: [{ ref: 'telegram@1.2.0', alias: 'primary', webhookId: 'wh_existing' }],
    })
    vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
      refreshCompletedDependencySnapshot: vi.fn(async () => ({
        status: 'refreshed' as const,
      })) as any,
    })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({
          installations: [currentInstallation('telegram@1.2.0')],
        })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json({
          ok: true,
          installationId: 'installation-7',
          integrationId: 'definition-11',
          ref: 'telegram@1.1.3',
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await upgradeCommand(botpressHome, workDir, {
      ref: 'telegram@1.1.3',
    }).run()

    expect(
      calls.filter((call) => call.init.method === 'POST').map((call) => JSON.parse(String(call.init.body)))
    ).toEqual([{ name: 'telegram', version: '1.1.3' }])
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'bot.json'), 'utf8'))).toEqual({
      integrations: [{ ref: 'telegram@1.1.3', alias: 'primary', webhookId: 'wh_existing' }],
    })
  })

  it('reports partial success and an exact rollback command when snapshot refresh fails after repoint', async () => {
    const alias = "team's primary"
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}\n')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: BOT_ID,
      workspaceId: WORKSPACE_ID,
      apiUrl: API_URL,
    })
    writeJson(path.join(workDir, 'bot.json'), {
      integrations: [{ ref: 'telegram@1.1.3', alias, webhookId: 'wh_existing' }],
    })
    writeJson(path.join(workDir, '.adk', 'dependencies', 'migration.json'), {
      version: 2,
    })
    vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
      refreshCompletedDependencySnapshot: vi.fn(async () => {
        throw new Error('disk full')
      }) as any,
    })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation('telegram@1.1.3', alias)] })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json({
          ok: true,
          installationId: 'installation-7',
          integrationId: 'definition-12',
          ref: 'telegram@1.2.0',
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir, { alias }).run())

    expect(error.message).toMatch(/server-side repoint already completed/i)
    expect(error.message).toContain(
      `brt integrations upgrade telegram@1.1.3 --alias='team'"'"'s primary'`
    )
    expect(calls.filter((call) => call.url.endsWith('/repoint'))).toHaveLength(1)
  })

  it('conservatively reports outcome unknown for a repoint 500 without a trusted server marker', async () => {
    const files = prepareProdProject(workDir)
    const refreshLoader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation()] })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json({ message: 'integration repoint failed' }, { status: 500 })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir).run())

    expect(error.message).toMatch(/HTTP 500.*integration repoint failed/i)
    expect(error.message).toMatch(/repoint outcome is unknown/i)
    expect(error.message).toMatch(/inspect.*current installation ref/i)
    expect(error.message).toContain('brt integrations upgrade telegram@1.1.3 --alias=primary')
    expect(error.message).not.toMatch(/server-side repoint already completed/i)
    expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST'])
    expect(refreshLoader).not.toHaveBeenCalled()
    expect(fs.readFileSync(files.linkPath, 'utf8')).toBe(files.linkBefore)
    expect(fs.readFileSync(files.snapshotPath, 'utf8')).toBe(files.snapshotBefore)
  })

  it('reports outcome unknown after a network failure during the non-idempotent repoint POST', async () => {
    const files = prepareProdProject(workDir)
    const refreshLoader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation()] })
      }
      if (call.url.endsWith('/repoint')) {
        throw new TypeError('connection reset after request upload')
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir).run())

    expect(error.message).toMatch(/repoint outcome is unknown/i)
    expect(error.message).toMatch(/inspect.*current installation ref/i)
    expect(error.message).toMatch(/if telegram@1\.2\.0 is active.*roll back with/i)
    expect(error.message).toContain('brt integrations upgrade telegram@1.1.3 --alias=primary')
    expect(error.message).toMatch(/do not retry install or register/i)
    expect(error.message).not.toMatch(/already completed/i)
    expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST'])
    expect(refreshLoader).not.toHaveBeenCalled()
    expect(fs.readFileSync(files.linkPath, 'utf8')).toBe(files.linkBefore)
    expect(fs.readFileSync(files.snapshotPath, 'utf8')).toBe(files.snapshotBefore)
  })

  it('reports outcome unknown after a malformed successful repoint response', async () => {
    const files = prepareProdProject(workDir)
    const refreshLoader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation()] })
      }
      if (call.url.endsWith('/repoint')) {
        return new Response('{not-json', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir).run())

    expect(error.message).toMatch(/repoint outcome is unknown/i)
    expect(error.message).toMatch(/inspect.*current installation ref/i)
    expect(error.message).toContain('brt integrations upgrade telegram@1.1.3 --alias=primary')
    expect(error.message).not.toMatch(/already completed/i)
    expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST'])
    expect(refreshLoader).not.toHaveBeenCalled()
    expect(fs.readFileSync(files.linkPath, 'utf8')).toBe(files.linkBefore)
    expect(fs.readFileSync(files.snapshotPath, 'utf8')).toBe(files.snapshotBefore)
  })

  it('reports outcome unknown after a structurally malformed null success response', async () => {
    const files = prepareProdProject(workDir)
    const refreshLoader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation()] })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json(null)
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir).run())

    expect(error.message).toMatch(/repoint outcome is unknown/i)
    expect(error.message).toMatch(/inspect.*current installation ref/i)
    expect(error.message).toMatch(/inconsistent success response/i)
    expect(error.message).toContain('brt integrations upgrade telegram@1.1.3 --alias=primary')
    expect(error.message).not.toMatch(/already completed|TypeError/i)
    expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST'])
    expect(refreshLoader).not.toHaveBeenCalled()
    expect(fs.readFileSync(files.linkPath, 'utf8')).toBe(files.linkBefore)
    expect(fs.readFileSync(files.snapshotPath, 'utf8')).toBe(files.snapshotBefore)
  })

  it('reports outcome unknown for a parsed but inconsistent successful repoint response', async () => {
    const files = prepareProdProject(workDir)
    const refreshLoader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation()] })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json({
          ok: true,
          installationId: 'unexpected-installation',
          integrationId: 'definition-12',
          ref: 'telegram@1.2.0',
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir).run())

    expect(error.message).toMatch(/repoint outcome is unknown/i)
    expect(error.message).toMatch(/inconsistent success response/i)
    expect(error.message).not.toMatch(/already completed/i)
    expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST'])
    expect(refreshLoader).not.toHaveBeenCalled()
    expect(fs.readFileSync(files.linkPath, 'utf8')).toBe(files.linkBefore)
    expect(fs.readFileSync(files.snapshotPath, 'utf8')).toBe(files.snapshotBefore)
  })

  it('reports outcome unknown for an untrusted gateway 502', async () => {
    const files = prepareProdProject(workDir)
    const refreshLoader = vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url.endsWith('/integrations')) {
        return Response.json({ installations: [currentInstallation()] })
      }
      if (call.url.endsWith('/repoint')) {
        return Response.json({ message: 'bad gateway' }, { status: 502 })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    const error = await captureError(upgradeCommand(botpressHome, workDir).run())

    expect(error.message).toMatch(/repoint outcome is unknown/i)
    expect(error.message).toContain('brt integrations upgrade telegram@1.1.3 --alias=primary')
    expect(error.message).not.toMatch(/already completed/i)
    expect(calls.map((call) => call.init.method)).toEqual(['GET', 'POST'])
    expect(refreshLoader).not.toHaveBeenCalled()
    expect(fs.readFileSync(files.linkPath, 'utf8')).toBe(files.linkBefore)
    expect(fs.readFileSync(files.snapshotPath, 'utf8')).toBe(files.snapshotBefore)
  })
})
