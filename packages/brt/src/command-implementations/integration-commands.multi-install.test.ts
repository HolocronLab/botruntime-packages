import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import { CloudIntegrationInstallCommand } from './integration-commands'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '2'
const BOT_ID = '3'

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function installCommand(botpressHome: string, workDir: string, configFile: string) {
  return new CloudIntegrationInstallCommand({} as any, {} as any, new Logger(), {
    ref: 'botruntime/territorial-jurisdiction@0.1.1',
    alias: 'territorial-jurisdiction',
    botpressHome,
    workDir,
    profile: 'default',
    apiUrl: undefined,
    botId: BOT_ID,
    local: false,
    dev: false,
    configFile,
    configStdin: false,
  } as any)
}

describe('production integration install cardinality', () => {
  const originalFetch = global.fetch
  let botpressHome: string
  let workDir: string
  let configFile: string

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-multi-install-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-multi-install-project-'))
    configFile = path.join(workDir, 'territorial-jurisdiction.json')

    writeJson(path.join(botpressHome, 'profiles.json'), {
      default: { apiUrl: API_URL, workspaceId: WORKSPACE_ID, token: 'brt_pat_test' },
    })
    writeJson(path.join(workDir, 'bot.json'), {
      botId: Number(BOT_ID),
      apiUrl: API_URL,
      integrations: [
        {
          ref: 'botruntime/yookassa@0.2.0',
          alias: 'yookassa',
          webhookId: 'wh_yookassa',
        },
      ],
    })
    writeJson(configFile, { token: 'sealed-test-value' })
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    global.fetch = originalFetch
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('installs an action integration alongside an existing integration through the workspace route', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init: init ?? {} })
      return Response.json({ installationId: '25', webhookId: 'wh_territorial', status: 'pending' })
    }) as typeof fetch

    await installCommand(botpressHome, workDir, configFile).run()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${BOT_ID}/integrations`,
    )
    expect(calls[0]!.init).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({ authorization: 'Bearer brt_pat_test' }),
    })
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      name: 'botruntime/territorial-jurisdiction',
      version: '0.1.1',
      config: { token: 'sealed-test-value' },
      alias: 'territorial-jurisdiction',
    })

    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'bot.json'), 'utf8')).integrations).toEqual([
      {
        ref: 'botruntime/yookassa@0.2.0',
        alias: 'yookassa',
        webhookId: 'wh_yookassa',
      },
      {
        ref: 'botruntime/territorial-jurisdiction@0.1.1',
        alias: 'territorial-jurisdiction',
        webhookId: 'wh_territorial',
      },
    ])
  })

  it('keeps the existing local installation list byte-exact when Cloud rejects the install', async () => {
    const linkPath = path.join(workDir, 'bot.json')
    const before = fs.readFileSync(linkPath, 'utf8')
    const fetchMock = vi.fn(async () =>
      Response.json({ code: 409, message: 'integration alias already exists' }, { status: 409 }),
    )
    global.fetch = fetchMock as typeof fetch

    await expect(installCommand(botpressHome, workDir, configFile).run()).rejects.toThrow()

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fs.readFileSync(linkPath, 'utf8')).toBe(before)
  })
})
