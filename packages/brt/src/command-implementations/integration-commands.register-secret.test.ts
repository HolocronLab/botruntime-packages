import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import { CloudIntegrationRegisterCommand } from './integration-commands'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = 'ws_prod'
const PAT = 'brt_pat_prod'
const BOT_ID = '42'

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function registerCommand(botpressHome: string, workDir: string, profile = 'team') {
  return new CloudIntegrationRegisterCommand({} as any, {} as any, new Logger(), {
    botpressHome,
    workDir,
    profile,
    apiUrl: undefined,
    botId: undefined,
    local: false,
    dev: false,
    webhookId: 'wh_prod',
  } as any)
}

describe('production integration register webhook credential refresh', () => {
  const originalFetch = global.fetch
  let botpressHome: string
  let workDir: string
  let stdout: string[]

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-register-secret-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-register-secret-project-'))
    stdout = []
    writeJson(path.join(botpressHome, 'profiles.json'), {
      default: { apiUrl: 'https://other.example', workspaceId: 'ws_other', token: 'other_pat' },
      team: { apiUrl: API_URL, workspaceId: WORKSPACE_ID, token: PAT },
    })
    writeJson(path.join(workDir, 'bot.json'), { botId: Number(BOT_ID), apiUrl: API_URL })
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

  it('stores the returned secret for the exact profile and bot while preserving the apiKey', async () => {
    const storePath = path.join(botpressHome, 'bots.json')
    writeJson(storePath, {
      default: { [BOT_ID]: { apiKey: 'other_key', webhookSecret: 'other_secret' } },
      team: {
        [BOT_ID]: { apiKey: 'existing_bot_key', webhookSecret: 'stale_secret' },
        '99': { apiKey: 'sibling_key', webhookSecret: 'sibling_secret' },
      },
    })
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      expect(String(url)).toBe(
        `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${BOT_ID}/integrations/wh_prod/register`,
      )
      expect(init?.method).toBe('POST')
      expect(init?.headers).toMatchObject({ authorization: `Bearer ${PAT}` })
      return Response.json({
        ok: true,
        status: 'registered',
        webhookUrl: 'https://hooks.example/wh_prod',
        webhookSecret: 'fresh_webhook_secret',
      })
    }) as typeof fetch

    await registerCommand(botpressHome, workDir).run()

    expect(JSON.parse(fs.readFileSync(storePath, 'utf8'))).toEqual({
      default: { [BOT_ID]: { apiKey: 'other_key', webhookSecret: 'other_secret' } },
      team: {
        [BOT_ID]: { apiKey: 'existing_bot_key', webhookSecret: 'fresh_webhook_secret' },
        '99': { apiKey: 'sibling_key', webhookSecret: 'sibling_secret' },
      },
    })
    const output = stdout.join('')
    expect(output).toContain('registered wh_prod -> https://hooks.example/wh_prod')
    expect(output).not.toContain('fresh_webhook_secret')
    expect(output).not.toMatch(/webhookSecret|bots\.json/i)
  })

  it('stores the secret without inventing an apiKey when registration uses the workspace PAT', async () => {
    const storePath = path.join(botpressHome, 'bots.json')
    writeJson(storePath, {
      default: { [BOT_ID]: { apiKey: 'wrong_profile_key' } },
      team: { [BOT_ID]: { webhookSecret: 'stale_secret' } },
    })
    global.fetch = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: `Bearer ${PAT}` })
      return Response.json({
        ok: true,
        status: 'registered',
        webhookUrl: 'https://hooks.example/wh_prod',
        webhookSecret: 'fresh_webhook_secret',
      })
    }) as typeof fetch

    await registerCommand(botpressHome, workDir).run()

    expect(JSON.parse(fs.readFileSync(storePath, 'utf8'))).toEqual({
      default: { [BOT_ID]: { apiKey: 'wrong_profile_key' } },
      team: { [BOT_ID]: { webhookSecret: 'fresh_webhook_secret' } },
    })
  })

  it.each([undefined, '', '   '])('fails loudly and preserves the store for invalid secret %j', async (secret) => {
    const storePath = path.join(botpressHome, 'bots.json')
    writeJson(storePath, {
      team: { [BOT_ID]: { apiKey: 'existing_bot_key', webhookSecret: 'stale_secret' } },
    })
    const before = fs.readFileSync(storePath, 'utf8')
    global.fetch = vi.fn(async () =>
      Response.json({
        ok: true,
        status: 'registered',
        webhookUrl: 'https://hooks.example/wh_prod',
        ...(secret === undefined ? {} : { webhookSecret: secret }),
      }),
    ) as typeof fetch

    await expect(registerCommand(botpressHome, workDir).run()).rejects.toThrow(
      /registration succeeded.*valid webhook secret.*not saved/i,
    )

    expect(fs.readFileSync(storePath, 'utf8')).toBe(before)
    expect(stdout.join('')).not.toContain('stale_secret')
  })
})
