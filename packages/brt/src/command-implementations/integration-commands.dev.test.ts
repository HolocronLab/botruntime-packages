import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as agentLink from '../adk-agent-link'
import * as adkBundle from '../adk-bundle'
import * as config from '../config'
import { Logger } from '../logger'
import { CloudIntegrationInstallCommand, CloudIntegrationRegisterCommand } from './integration-commands'

type FetchCall = { url: string; init: RequestInit }

const DEV_API_URL = 'https://dev.example'
const DEV_PAT = 'brt_pat_dev'
const DEV_WORKSPACE_ID = 'ws_dev'
const LOCAL_API_URL = 'http://127.0.0.1:8787'
const LOCAL_CLASSIC_WORKSPACE_ID = '9001'
const LOCAL_AGENT_WORKSPACE_ID = LOCAL_CLASSIC_WORKSPACE_ID

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

function writeProfile(botpressHome: string): void {
  writeJson(path.join(botpressHome, 'profiles.json'), {
    default: {
      apiUrl: DEV_API_URL,
      workspaceId: DEV_WORKSPACE_ID,
      token: DEV_PAT,
    },
    local: {
      apiUrl: LOCAL_API_URL,
      workspaceId: LOCAL_AGENT_WORKSPACE_ID,
      token: DEV_PAT,
    },
  })
}

function installCommand(botpressHome: string, workDir: string, configFile: string, dev: boolean, local = false) {
  return new CloudIntegrationInstallCommand({} as any, {} as any, new Logger(), {
    botpressHome,
    workDir,
    profile: local ? 'local' : 'default',
    apiUrl: undefined,
    botId: undefined,
    local,
    dev,
    ref: 'telegram@0.0.1',
    alias: undefined,
    configFile,
    configStdin: false,
  } as any)
}

function registerCommand(botpressHome: string, workDir: string, webhookId: string, dev: boolean, local = false) {
  return new CloudIntegrationRegisterCommand({} as any, {} as any, new Logger(), {
    botpressHome,
    workDir,
    profile: local ? 'local' : 'default',
    apiUrl: undefined,
    botId: undefined,
    local,
    dev,
    webhookId,
  } as any)
}

describe('integration install/register dev target routing', () => {
  const originalFetch = global.fetch
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string[]

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-integration-dev-'))
    calls = []
    stdout = []
    writeProfile(botpressHome)
    vi.spyOn(adkBundle, 'loadAdkDependencyRefreshTools').mockResolvedValue({
      refreshCompletedDependencySnapshot: vi.fn(async () => ({ status: 'not-initialized' as const })) as any,
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

  it('exposes --dev on both human integration mutation commands', () => {
    const installSchema = config.schemas.cloudIntegrationInstall as Record<string, unknown>
    const registerSchema = config.schemas.cloudIntegrationRegister as Record<string, unknown>
    expect(installSchema['dev']).toMatchObject({
      type: 'boolean',
      default: false,
    })
    expect(registerSchema['dev']).toMatchObject({
      type: 'boolean',
      default: false,
    })
  })

  it('installs from a classic cached opaque devId through GET/tag and the PAT nested numeric route', async () => {
    const configFile = path.join(workDir, 'telegram.config.json')
    const linkPath = path.join(workDir, 'bot.json')
    const botsStorePath = path.join(botpressHome, 'bots.json')
    const prodLink = {
      botId: 999,
      apiUrl: 'https://prod-should-not-be-used.example',
    }
    const prodStore = {
      default: {
        '999': { apiKey: 'prod_bot_key', webhookSecret: 'prod_store_secret' },
      },
    }
    writeJson(configFile, { botToken: 'sealed-config-value' })
    writeJson(path.join(workDir, '.botpress', 'project.cache.json'), {
      devId: 'dev-opaque',
    })
    writeJson(linkPath, prodLink)
    writeJson(botsStorePath, prodStore)
    const originalLink = fs.readFileSync(linkPath, 'utf8')
    const originalStore = fs.readFileSync(botsStorePath, 'utf8')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url === `${DEV_API_URL}/v1/admin/bots/dev-opaque`) {
        return new Response(
          JSON.stringify({
            bot: {
              id: 'dev-opaque',
              dev: true,
              tags: { 'botruntime.devTargetBotId': '42' },
            },
          }),
          { status: 200 }
        )
      }
      if (
        call.init.method === 'POST' &&
        call.url === `${DEV_API_URL}/v1/admin/workspaces/${DEV_WORKSPACE_ID}/bots/42/integrations`
      ) {
        return new Response(
          JSON.stringify({
            installationId: '7',
            webhookId: 'wh_dev',
            status: 'pending',
            webhookSecret: 'nested_response_secret_must_not_leak',
          }),
          { status: 200 }
        )
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await (installCommand(botpressHome, workDir, configFile, true) as any).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${DEV_API_URL}/v1/admin/bots/dev-opaque`],
      ['POST', `${DEV_API_URL}/v1/admin/workspaces/${DEV_WORKSPACE_ID}/bots/42/integrations`],
    ])
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: `Bearer ${DEV_PAT}`,
      'x-workspace-id': DEV_WORKSPACE_ID,
    })
    expect(calls[1]!.init.headers).toMatchObject({
      authorization: `Bearer ${DEV_PAT}`,
    })
    expect(calls[0]!.init.headers).not.toHaveProperty('x-bot-id')
    expect(calls[1]!.init.headers).not.toHaveProperty('x-bot-id')
    expect(fs.readFileSync(linkPath, 'utf8')).toBe(originalLink)
    expect(fs.readFileSync(botsStorePath, 'utf8')).toBe(originalStore)

    const output = stdout.join('')
    expect(output).toContain('wh_dev')
    expect(output).toContain('register with: brt integrations register wh_dev --dev')
    expect(output).not.toContain('register with: brt integrations register wh_dev --dev --local')
    expect(output).not.toMatch(/webhookSecret|bots\.json/i)
    expect(output).not.toContain('nested_response_secret_must_not_leak')
    expect(output).not.toContain('prod_store_secret')
  })

  it('registers an agent.local opaque devId through GET/tag and the PAT nested numeric route', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: 'prod-agent-bot',
      workspaceId: 'prod-agent-workspace',
      apiUrl: 'https://prod-agent-should-not-be-used.example',
    })
    writeJson(path.join(workDir, 'agent.local.json'), {
      devId: 'agent-dev-opaque',
      workspaceId: DEV_WORKSPACE_ID,
      apiUrl: DEV_API_URL,
    })
    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url === `${DEV_API_URL}/v1/admin/bots/agent-dev-opaque`) {
        return new Response(
          JSON.stringify({
            bot: {
              id: 'agent-dev-opaque',
              dev: true,
              tags: { 'botruntime.devTargetBotId': '42' },
            },
          }),
          { status: 200 }
        )
      }
      if (
        call.init.method === 'POST' &&
        call.url === `${DEV_API_URL}/v1/admin/workspaces/${DEV_WORKSPACE_ID}/bots/42/integrations/wh_agent/register`
      ) {
        return new Response(
          JSON.stringify({
            ok: true,
            webhookId: 'wh_agent',
            status: 'registered',
            webhookUrl: 'https://hooks.example/wh_agent',
            webhookSecret: 'register_response_secret_must_not_leak',
          }),
          { status: 200 }
        )
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await (registerCommand(botpressHome, workDir, 'wh_agent', true) as any).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${DEV_API_URL}/v1/admin/bots/agent-dev-opaque`],
      ['POST', `${DEV_API_URL}/v1/admin/workspaces/${DEV_WORKSPACE_ID}/bots/42/integrations/wh_agent/register`],
    ])
    for (const call of calls) {
      expect(call.init.headers).toMatchObject({
        authorization: `Bearer ${DEV_PAT}`,
      })
      expect(call.init.headers).not.toHaveProperty('x-bot-id')
    }
    expect(fs.existsSync(path.join(workDir, 'bot.json'))).toBe(false)
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toMatchObject({
      devId: 'agent-dev-opaque',
    })

    const output = stdout.join('')
    expect(output).toContain('wh_agent')
    expect(output).not.toMatch(/webhookSecret|bots\.json/i)
    expect(output).not.toContain('register_response_secret_must_not_leak')
  })

  it('installs --dev --local through classic bot.local apiUrl/workspace without writing dev ids to the link', async () => {
    const configFile = path.join(workDir, 'telegram.config.json')
    const localLinkPath = path.join(workDir, 'bot.local.json')
    writeJson(configFile, { botToken: 'sealed-local-config-value' })
    writeJson(path.join(workDir, '.botpress', 'project.cache.json'), {
      devId: 'classic-local-opaque',
    })
    writeJson(localLinkPath, {
      botId: 31337,
      workspaceId: Number(LOCAL_CLASSIC_WORKSPACE_ID),
      apiUrl: LOCAL_API_URL,
    })
    const originalLocalLink = fs.readFileSync(localLinkPath, 'utf8')

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url === `${LOCAL_API_URL}/v1/admin/bots/classic-local-opaque`) {
        return Response.json({
          bot: {
            id: 'classic-local-opaque',
            dev: true,
            tags: { 'botruntime.devTargetBotId': '42' },
          },
        })
      }
      if (
        call.init.method === 'POST' &&
        call.url === `${LOCAL_API_URL}/v1/admin/workspaces/${LOCAL_CLASSIC_WORKSPACE_ID}/bots/42/integrations`
      ) {
        return Response.json({
          installationId: '7',
          webhookId: 'wh_local',
          status: 'pending',
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await (installCommand(botpressHome, workDir, configFile, true, true) as any).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${LOCAL_API_URL}/v1/admin/bots/classic-local-opaque`],
      ['POST', `${LOCAL_API_URL}/v1/admin/workspaces/${LOCAL_CLASSIC_WORKSPACE_ID}/bots/42/integrations`],
    ])
    expect(calls.every((call) => !call.url.startsWith(DEV_API_URL))).toBe(true)
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: `Bearer ${DEV_PAT}`,
      'x-workspace-id': LOCAL_CLASSIC_WORKSPACE_ID,
    })
    expect(fs.readFileSync(localLinkPath, 'utf8')).toBe(originalLocalLink)
    expect(JSON.parse(fs.readFileSync(localLinkPath, 'utf8'))).not.toHaveProperty('devId')
    expect(JSON.parse(fs.readFileSync(localLinkPath, 'utf8'))).not.toHaveProperty('devTargetBotId')
    expect(stdout.join('')).toContain('register with: brt integrations register wh_local --dev --local')
  })

  it('registers --dev --local through agent.local apiUrl/workspace and ignores cloud and prod metadata', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: 'prod-agent-bot',
      workspaceId: 'prod-agent-workspace',
      apiUrl: 'https://prod-agent-should-not-be-used.example',
    })
    writeJson(path.join(workDir, 'agent.local.json'), {
      devId: 'agent-local-opaque',
      workspaceId: LOCAL_AGENT_WORKSPACE_ID,
      apiUrl: LOCAL_API_URL,
    })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'GET' && call.url === `${LOCAL_API_URL}/v1/admin/bots/agent-local-opaque`) {
        return Response.json({
          bot: {
            id: 'agent-local-opaque',
            dev: true,
            tags: { 'botruntime.devTargetBotId': '42' },
          },
        })
      }
      if (
        call.init.method === 'POST' &&
        call.url ===
          `${LOCAL_API_URL}/v1/admin/workspaces/${LOCAL_AGENT_WORKSPACE_ID}/bots/42/integrations/wh_local/register`
      ) {
        return Response.json({
          ok: true,
          webhookId: 'wh_local',
          status: 'registered',
          webhookUrl: 'https://hooks.example/wh_local',
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await (registerCommand(botpressHome, workDir, 'wh_local', true, true) as any).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${LOCAL_API_URL}/v1/admin/bots/agent-local-opaque`],
      [
        'POST',
        `${LOCAL_API_URL}/v1/admin/workspaces/${LOCAL_AGENT_WORKSPACE_ID}/bots/42/integrations/wh_local/register`,
      ],
    ])
    expect(calls.every((call) => !call.url.startsWith(DEV_API_URL))).toBe(true)
    expect(calls.every((call) => !call.url.includes('prod-agent-should-not-be-used.example'))).toBe(true)
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: `Bearer ${DEV_PAT}`,
      'x-workspace-id': LOCAL_AGENT_WORKSPACE_ID,
    })
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toMatchObject({
      devId: 'agent-local-opaque',
      devTargetBotId: '42',
      workspaceId: LOCAL_AGENT_WORKSPACE_ID,
      apiUrl: LOCAL_API_URL,
    })
    expect(fs.existsSync(path.join(workDir, 'bot.local.json'))).toBe(false)
  })

  it('rejects --dev --local authority drift before reading integration config or contacting either stack', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(path.join(workDir, 'agent.local.json'), {
      devId: 'agent-local-opaque',
      devTargetBotId: '42',
      workspaceId: 'foreign_ws',
      apiUrl: 'http://foreign.example',
    })
    const missingConfig = path.join(workDir, 'must-not-be-read.json')

    await expect(installCommand(botpressHome, workDir, missingConfig, true, true).run()).rejects.toThrow(
      /agent\.local\.json.*selected profile/i
    )

    expect(calls).toEqual([])
    expect(fs.existsSync(missingConfig)).toBe(false)
  })

  it('installs and registers in a fresh agent project using agent.json while bot.json stays metadata-only', async () => {
    const configFile = path.join(workDir, 'telegram.config.json')
    const agentInfoPath = path.join(workDir, 'agent.json')
    const botMetadataPath = path.join(workDir, 'bot.json')
    const agentApiUrl = DEV_API_URL
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(configFile, { botToken: 'agent-prod-sealed-config-value' })
    writeJson(agentInfoPath, {
      botId: '7',
      workspaceId: DEV_WORKSPACE_ID,
      apiUrl: agentApiUrl,
    })
    writeJson(path.join(botpressHome, 'bots.json'), {
      default: { '7': { apiKey: 'agent_prod_bot_key' } },
    })
    const originalAgentInfo = fs.readFileSync(agentInfoPath, 'utf8')
    const canonicalWriteSpy = vi.spyOn(agentLink, 'writeAgentInfo').mockImplementation(() => {
      throw new Error('metadata-only install must not rewrite agent.json')
    })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'POST' && call.url === `${agentApiUrl}/v1/admin/integrations/install`) {
        return Response.json({
          installationId: 7,
          webhookId: 'wh_agent_prod',
          webhookSecret: 'agent_prod_webhook_secret',
        })
      }
      if (
        call.init.method === 'POST' &&
        call.url === `${agentApiUrl}/v1/admin/integrations/wh_agent_prod/register`
      ) {
        return Response.json({
          ok: true,
          webhookId: 'wh_agent_prod',
          webhookUrl: 'https://hooks.example/wh_agent_prod',
        })
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await (installCommand(botpressHome, workDir, configFile, false) as any).run()
    await (registerCommand(botpressHome, workDir, 'wh_agent_prod', false) as any).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', `${agentApiUrl}/v1/admin/integrations/install`],
      ['POST', `${agentApiUrl}/v1/admin/integrations/wh_agent_prod/register`],
    ])
    for (const call of calls) {
      expect(call.init.headers).toMatchObject({
        authorization: 'Bearer agent_prod_bot_key',
        'x-bot-id': '7',
      })
    }
    expect(fs.readFileSync(agentInfoPath, 'utf8')).toBe(originalAgentInfo)
    expect(canonicalWriteSpy).not.toHaveBeenCalled()
    expect(JSON.parse(fs.readFileSync(botMetadataPath, 'utf8'))).toEqual({
      integrations: [{ ref: 'telegram@0.0.1', alias: 'telegram', webhookId: 'wh_agent_prod' }],
    })
    expect(JSON.parse(fs.readFileSync(botMetadataPath, 'utf8'))).not.toHaveProperty('botId')
    expect(JSON.parse(fs.readFileSync(botMetadataPath, 'utf8'))).not.toHaveProperty('workspaceId')
    expect(JSON.parse(fs.readFileSync(botMetadataPath, 'utf8'))).not.toHaveProperty('apiUrl')
  })

  it('keeps install/register without --dev on the production per-bot-key wire', async () => {
    const configFile = path.join(workDir, 'telegram.config.json')
    const linkPath = path.join(workDir, 'bot.json')
    const botsStorePath = path.join(botpressHome, 'bots.json')
    writeJson(configFile, { botToken: 'prod-sealed-config-value' })
    writeJson(linkPath, { botId: 7, apiUrl: DEV_API_URL })
    writeJson(botsStorePath, { default: { '7': { apiKey: 'prod_bot_key' } } })

    global.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(url), init: init ?? {} }
      calls.push(call)
      if (call.init.method === 'POST' && call.url === `${DEV_API_URL}/v1/admin/integrations/install`) {
        return new Response(
          JSON.stringify({
            installationId: 7,
            webhookId: 'wh_prod',
            webhookSecret: 'prod_webhook_secret',
          }),
          { status: 200 }
        )
      }
      if (call.init.method === 'POST' && call.url === `${DEV_API_URL}/v1/admin/integrations/wh_prod/register`) {
        return new Response(
          JSON.stringify({
            ok: true,
            webhookId: 'wh_prod',
            webhookUrl: 'https://hooks.example/wh_prod',
          }),
          { status: 200 }
        )
      }
      throw new Error(`unexpected request ${call.init.method} ${call.url}`)
    }) as typeof fetch

    await (installCommand(botpressHome, workDir, configFile, false) as any).run()
    await (registerCommand(botpressHome, workDir, 'wh_prod', false) as any).run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['POST', `${DEV_API_URL}/v1/admin/integrations/install`],
      ['POST', `${DEV_API_URL}/v1/admin/integrations/wh_prod/register`],
    ])
    for (const call of calls) {
      expect(call.init.headers).toMatchObject({
        authorization: 'Bearer prod_bot_key',
        'x-bot-id': '7',
      })
      expect(call.url).not.toContain('/workspaces/')
    }
    expect(JSON.parse(fs.readFileSync(linkPath, 'utf8'))).toMatchObject({
      botId: 7,
      integrations: [{ ref: 'telegram@0.0.1', alias: 'telegram', webhookId: 'wh_prod' }],
    })
    expect(JSON.parse(fs.readFileSync(botsStorePath, 'utf8'))).toEqual({
      default: {
        '7': { apiKey: 'prod_bot_key', webhookSecret: 'prod_webhook_secret' },
      },
    })
    expect(stdout.join('')).not.toContain('prod_webhook_secret')
  })
})
