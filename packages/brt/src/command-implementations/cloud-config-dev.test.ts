import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { schemas } from '../config'
import { Logger } from '../logger'
import { ConfigListCommand, ConfigRmCommand, ConfigSetCommand, SecretSetCommand } from './cloud-config-commands'
import { LogsCommand } from './logs-command'

const API_URL = 'https://cloud.example'
const AGENT_PROD_API_URL = API_URL
const WORKSPACE_ID = 'ws_123'
const LOCAL_API_URL = 'http://127.0.0.1:8787'
const AGENT_LOCAL_API_URL = LOCAL_API_URL
const LOCAL_CLASSIC_WORKSPACE_ID = '9001'
const LOCAL_AGENT_WORKSPACE_ID = LOCAL_CLASSIC_WORKSPACE_ID
const DEV_TARGET_BOT_ID = '42'
const PROD_BOT_ID = '77'
const DEV_TARGET_TAG = 'botruntime.devTargetBotId'

type FetchCall = { url: string; init: RequestInit }
type CacheSource = 'classic' | 'agent'

const commandCases = [
  {
    label: 'config set',
    Command: ConfigSetCommand,
    source: 'classic',
    kind: 'config-set',
  },
  {
    label: 'config list',
    Command: ConfigListCommand,
    source: 'agent',
    kind: 'config-list',
  },
  {
    label: 'config rm',
    Command: ConfigRmCommand,
    source: 'classic',
    kind: 'config-rm',
  },
  {
    label: 'secret set',
    Command: SecretSetCommand,
    source: 'agent',
    kind: 'secret-set',
  },
] as const satisfies ReadonlyArray<{
  label: string
  Command: new (...args: any[]) => { run(): Promise<void> }
  source: CacheSource
  kind: 'config-set' | 'config-list' | 'config-rm' | 'secret-set'
}>

type CommandKind = (typeof commandCases)[number]['kind']

function expectedDevCalls(
  apiUrl: string,
  workspaceId: string,
  opaqueId: string,
  kind: CommandKind
): Array<[string, string]> {
  const resolve: [string, string] = ['GET', `${apiUrl}/v1/admin/bots/${opaqueId}`]
  const bot = `${apiUrl}/v1/admin/bots/${DEV_TARGET_BOT_ID}`
  if (kind === 'secret-set') {
    return [
      resolve,
      ['PUT', `${apiUrl}/v1/admin/workspaces/${workspaceId}/bots/${DEV_TARGET_BOT_ID}/config-variables/FOO`],
    ]
  }
  if (kind === 'config-list') return [resolve, ['GET', bot]]
  return [resolve, ['GET', bot], ['PUT', bot], ['GET', bot]]
}

function expectedProdCalls(apiUrl: string, botId: string, kind: CommandKind): Array<[string, string]> {
  if (kind === 'secret-set') return [['PUT', `${apiUrl}/v1/admin/config-variables/FOO`]]
  const bot = `${apiUrl}/v1/admin/bots/${botId}`
  if (kind === 'config-list') return [['GET', bot]]
  return [['GET', bot], ['PUT', bot], ['GET', bot]]
}

describe('cloud config and secret dev routing', () => {
  let botpressHome: string
  let workDir: string
  let valueFile: string
  let calls: FetchCall[]
  let botConfigurations: Map<string, Record<string, unknown>>
  let persistBotWrites: boolean

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-config-dev-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-config-dev-project-'))
    valueFile = path.join(workDir, 'value.txt')
    calls = []
    botConfigurations = new Map()
    persistBotWrites = true

    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: {
          apiUrl: API_URL,
          workspaceId: WORKSPACE_ID,
          token: 'brt_pat_xxx',
        },
        local: {
          apiUrl: LOCAL_API_URL,
          workspaceId: LOCAL_AGENT_WORKSPACE_ID,
          token: 'brt_pat_xxx',
        },
      })
    )
    fs.writeFileSync(valueFile, 'sealed-value\n')

    vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as any)
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
        const url = String(input)
        calls.push({ url, init })
        const { pathname } = new URL(url)
        const method = init.method ?? 'GET'

        if (
          method === 'GET' &&
          (pathname === `/v1/admin/workspaces/${WORKSPACE_ID}/bots/${PROD_BOT_ID}/logs` ||
            pathname === `/v1/admin/workspaces/${WORKSPACE_ID}/bots/${DEV_TARGET_BOT_ID}/logs`)
        ) {
          return Response.json({ logs: [] })
        }

        if ((method === 'GET' || method === 'PUT') && pathname.startsWith('/v1/admin/bots/')) {
          const opaqueId = decodeURIComponent(pathname.slice('/v1/admin/bots/'.length))
          if (method === 'PUT') {
            const body = JSON.parse(String(init.body)) as {
              configuration?: { data?: Record<string, unknown> }
            }
            if (persistBotWrites) botConfigurations.set(opaqueId, body.configuration?.data ?? {})
          }
          return Response.json({
            bot: {
              id: opaqueId,
              dev: true,
              tags: { [DEV_TARGET_TAG]: DEV_TARGET_BOT_ID },
              configuration: {
                data: botConfigurations.has(opaqueId) ? botConfigurations.get(opaqueId) : { FOO: 'old-value' },
                schema: {
                  type: 'object',
                  properties: {
                    FOO: { type: 'string' },
                    maxRetries: { type: 'integer' },
                    enabled: { type: 'boolean' },
                  },
                },
              },
            },
          })
        }

        const devConfigPath = new RegExp(
          `^/v1/admin/workspaces/[^/]+/bots/${DEV_TARGET_BOT_ID}/config-variables(?:/FOO)?$`
        )
        if (devConfigPath.test(pathname)) {
          if (method === 'GET') {
            return Response.json({
              variables: [{ name: 'FOO', updatedAt: '2026-07-09T00:00:00Z' }],
            })
          }
          return Response.json({})
        }

        if (pathname === '/v1/admin/config-variables' || pathname === '/v1/admin/config-variables/FOO') {
          if (method === 'GET') {
            return Response.json({
              variables: [{ name: 'FOO', updatedAt: '2026-07-09T00:00:00Z' }],
            })
          }
          return Response.json({})
        }

        throw new Error(`unexpected request: ${method} ${url}`)
      })
    )
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('declares --dev on every config and secret command', () => {
    for (const schema of [
      schemas.cloudConfigSet,
      schemas.cloudConfigList,
      schemas.cloudConfigRm,
      schemas.cloudSecretSet,
    ]) {
      expect(schema).toHaveProperty('dev', expect.objectContaining({ type: 'boolean' }))
    }
  })

  it('declares --dev on logs', () => {
    expect(schemas.logs).toHaveProperty('dev', expect.objectContaining({ type: 'boolean' }))
  })

  it.each(commandCases)(
    '$label --dev resolves the cached $source opaque id through PAT and uses the canonical target store',
    async ({ Command, source, kind }) => {
      const opaqueId = `${source}-opaque`
      writeDevCache(workDir, source, opaqueId)
      const command = new Command({} as any, {} as any, new Logger(), makeArgv(botpressHome, workDir, valueFile, true))

      await command.run()

      expect(calls.map((call) => [call.init.method, call.url])).toEqual(
        expectedDevCalls(API_URL, WORKSPACE_ID, opaqueId, kind)
      )
      expect(headers(calls[0]!)).toMatchObject({
        authorization: 'Bearer brt_pat_xxx',
        'x-workspace-id': WORKSPACE_ID,
      })
      expect(headers(calls[0]!)['x-bot-id']).toBeUndefined()
      expect(calls.every((call) => headers(call).authorization === 'Bearer brt_pat_xxx')).toBe(true)
      expect(calls.every((call) => headers(call)['x-bot-id'] === undefined)).toBe(true)
      if (kind === 'secret-set') {
        expect(JSON.parse(String(calls.at(-1)!.init.body))).toEqual({
          value: 'sealed-value',
        })
      } else if (kind === 'config-set') {
        expect(JSON.parse(String(calls[2]!.init.body))).toEqual({
          configuration: { data: { FOO: 'sealed-value' } },
        })
      }
      expect(fs.existsSync(path.join(workDir, 'bot.json'))).toBe(false)
      expect(fs.existsSync(path.join(workDir, 'bot.local.json'))).toBe(false)
      expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
    }
  )

  it('coerces schema-declared configuration types and verifies persistence', async () => {
    writeDevCache(workDir, 'classic', 'classic-opaque')
    fs.writeFileSync(valueFile, '50000\n')
    const argv = { ...makeArgv(botpressHome, workDir, valueFile, true), name: 'maxRetries' }

    await new ConfigSetCommand({} as any, {} as any, new Logger(), argv).run()

    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({
      configuration: { data: { FOO: 'old-value', maxRetries: 50000 } },
    })
  })

  it('fails loudly when updateBot returns success without persisting configuration', async () => {
    writeDevCache(workDir, 'classic', 'classic-opaque')
    persistBotWrites = false
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, true)
    )

    await expect(command.run()).rejects.toThrow(/was not persisted/)
  })

  it('treats --bot-id under --dev as an opaque override independent of the cached target', async () => {
    const cacheDir = path.join(workDir, '.botpress')
    fs.mkdirSync(cacheDir, { recursive: true })
    fs.writeFileSync(
      path.join(cacheDir, 'project.cache.json'),
      JSON.stringify({ devId: 'old-opaque', devTargetBotId: '41' })
    )
    const argv = { ...makeArgv(botpressHome, workDir, valueFile, true), botId: 'new-opaque' }
    const command = new ConfigSetCommand({} as any, {} as any, new Logger(), argv)

    await command.run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual(
      expectedDevCalls(API_URL, WORKSPACE_ID, 'new-opaque', 'config-set')
    )
  })

  it('uses only selected profile stack coordinates for non-local agent --dev commands', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: 'agent-dev-opaque',
        devTargetBotId: DEV_TARGET_BOT_ID,
        workspaceId: 'poisoned_local_workspace',
        apiUrl: 'http://poisoned-local.example',
      })
    )
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, true, false)
    )

    await command.run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual(
      expectedDevCalls(API_URL, WORKSPACE_ID, 'agent-dev-opaque', 'config-set')
    )
    expect(headers(calls[0]!)).toMatchObject({
      authorization: 'Bearer brt_pat_xxx',
      'x-workspace-id': WORKSPACE_ID,
    })
    expect(calls.every((call) => !call.url.includes('poisoned-local'))).toBe(true)
  })

  it('non-local agent --dev ignores a legacy stale numeric target, verifies the runtime hint, and scopes it', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    const localPath = path.join(workDir, 'agent.local.json')
    fs.writeFileSync(localPath, JSON.stringify({ devId: 'agent-dev-opaque', devTargetBotId: '41' }))
    const command = new ConfigListCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, true, false)
    )

    await command.run()

    expect(calls[0]?.url).toBe(`${API_URL}/v1/admin/bots/agent-dev-opaque`)
    expect(JSON.parse(fs.readFileSync(localPath, 'utf8'))).toMatchObject({
      devId: 'agent-dev-opaque',
      devTargetBotId: DEV_TARGET_BOT_ID,
      devApiUrl: API_URL,
      devWorkspaceId: WORKSPACE_ID,
    })
  })

  it('non-local agent --dev rejects a foreign scoped tuple before network', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    const localPath = path.join(workDir, 'agent.local.json')
    fs.writeFileSync(
      localPath,
      JSON.stringify({
        devId: 'agent-dev-opaque',
        devTargetBotId: DEV_TARGET_BOT_ID,
        devApiUrl: LOCAL_API_URL,
        devWorkspaceId: LOCAL_AGENT_WORKSPACE_ID,
      })
    )
    const before = fs.readFileSync(localPath)
    const command = new ConfigListCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, true, false)
    )

    await expect(command.run()).rejects.toThrow(/dev.*(scope|target|stack)|run `brt dev`/i)

    expect(calls).toEqual([])
    expect(fs.readFileSync(localPath)).toEqual(before)
  })

  it('local agent --dev uses an unscoped runtime only as an authoritative hint and upgrades its scope', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    const localPath = path.join(workDir, 'agent.local.json')
    fs.writeFileSync(
      localPath,
      JSON.stringify({
        apiUrl: `${LOCAL_API_URL}/`,
        workspaceId: LOCAL_AGENT_WORKSPACE_ID,
        devId: 'agent-local-opaque',
        devTargetBotId: '41',
      })
    )
    const command = new ConfigListCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, true, true)
    )

    await command.run()

    expect(calls[0]?.url).toBe(`${LOCAL_API_URL}/v1/admin/bots/agent-local-opaque`)
    expect(JSON.parse(fs.readFileSync(localPath, 'utf8'))).toMatchObject({
      devId: 'agent-local-opaque',
      devTargetBotId: DEV_TARGET_BOT_ID,
      devApiUrl: LOCAL_API_URL,
      devWorkspaceId: LOCAL_AGENT_WORKSPACE_ID,
    })
  })

  it.each(commandCases)(
    '$label --dev --local uses only the $source local apiUrl and workspace metadata',
    async ({ Command, source, kind }) => {
      const opaqueId = `${source}-local-opaque`
      const localWorkspaceId = source === 'classic' ? LOCAL_CLASSIC_WORKSPACE_ID : LOCAL_AGENT_WORKSPACE_ID
      writeDevCache(workDir, source, opaqueId)

      let originalLocalLink: string | undefined
      if (source === 'classic') {
        const localLinkPath = path.join(workDir, 'bot.local.json')
        fs.writeFileSync(
          localLinkPath,
          JSON.stringify({
            botId: 31337,
            workspaceId: Number(localWorkspaceId),
            apiUrl: LOCAL_API_URL,
          })
        )
        originalLocalLink = fs.readFileSync(localLinkPath, 'utf8')
      } else {
        fs.writeFileSync(
          path.join(workDir, 'agent.local.json'),
          JSON.stringify({
            devId: opaqueId,
            workspaceId: localWorkspaceId,
            apiUrl: LOCAL_API_URL,
          })
        )
      }

      const command = new Command(
        {} as any,
        {} as any,
        new Logger(),
        makeArgv(botpressHome, workDir, valueFile, true, true)
      )

      await command.run()

      expect(calls.map((call) => [call.init.method, call.url])).toEqual(
        expectedDevCalls(LOCAL_API_URL, localWorkspaceId, opaqueId, kind)
      )
      expect(calls.every((call) => !call.url.startsWith(API_URL))).toBe(true)
      expect(headers(calls[0]!)).toMatchObject({
        authorization: 'Bearer brt_pat_xxx',
        'x-workspace-id': localWorkspaceId,
      })
      expect(headers(calls[0]!)['x-bot-id']).toBeUndefined()
      expect(headers(calls[1]!)['x-bot-id']).toBeUndefined()

      if (source === 'classic') {
        const localLinkPath = path.join(workDir, 'bot.local.json')
        expect(fs.readFileSync(localLinkPath, 'utf8')).toBe(originalLocalLink)
        expect(JSON.parse(fs.readFileSync(localLinkPath, 'utf8'))).not.toHaveProperty('devId')
        expect(JSON.parse(fs.readFileSync(localLinkPath, 'utf8'))).not.toHaveProperty('devTargetBotId')
      }
    }
  )

  it.each([
    ['classic', 'bot.local.json'],
    ['agent', 'agent.local.json'],
  ] as const)('--dev --local fails before network when %s local metadata has no apiUrl', async (source, fileName) => {
    const opaqueId = `${source}-missing-api-url`
    writeLocalDevMetadata(workDir, source, opaqueId, { workspaceId: LOCAL_AGENT_WORKSPACE_ID })
    const metadataPath = path.join(workDir, fileName)
    const originalMetadata = fs.readFileSync(metadataPath, 'utf8')
    const targetCachePath = devTargetCachePath(workDir, source)
    const originalTargetCache = fs.readFileSync(targetCachePath, 'utf8')
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, true, true)
    )

    await expect(command.run()).rejects.toThrow(new RegExp(`${fileName.replace('.', '\\.')}.*apiUrl`))

    expect(calls).toEqual([])
    expect(fs.readFileSync(metadataPath, 'utf8')).toBe(originalMetadata)
    expect(fs.readFileSync(targetCachePath, 'utf8')).toBe(originalTargetCache)
  })

  it.each([
    ['classic', 'bot.local.json'],
    ['agent', 'agent.local.json'],
  ] as const)(
    '--dev --local fails before network when %s local metadata has no workspaceId',
    async (source, fileName) => {
      const opaqueId = `${source}-missing-workspace-id`
      writeLocalDevMetadata(workDir, source, opaqueId, { apiUrl: LOCAL_API_URL })
      const metadataPath = path.join(workDir, fileName)
      const originalMetadata = fs.readFileSync(metadataPath, 'utf8')
      const targetCachePath = devTargetCachePath(workDir, source)
      const originalTargetCache = fs.readFileSync(targetCachePath, 'utf8')
      const command = new ConfigSetCommand(
        {} as any,
        {} as any,
        new Logger(),
        makeArgv(botpressHome, workDir, valueFile, true, true)
      )

      await expect(command.run()).rejects.toThrow(new RegExp(`${fileName.replace('.', '\\.')}.*workspaceId`))

      expect(calls).toEqual([])
      expect(fs.readFileSync(metadataPath, 'utf8')).toBe(originalMetadata)
      expect(fs.readFileSync(targetCachePath, 'utf8')).toBe(originalTargetCache)
    }
  )

  it('rejects --dev --local authority drift before resolving the dev target or reading a value onto the wire', async () => {
    writeLocalDevMetadata(workDir, 'agent', 'agent-local-opaque', {
      workspaceId: 'foreign_ws',
      apiUrl: 'http://foreign.example',
    })
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, true, true)
    )

    await expect(command.run()).rejects.toThrow(/agent\.local\.json.*selected profile/i)

    expect(calls).toEqual([])
  })

  it.each(commandCases)(
    '$label without --dev uses the production bot target',
    async ({ Command, kind }) => {
      fs.writeFileSync(path.join(workDir, 'bot.json'), JSON.stringify({ botId: Number(PROD_BOT_ID), apiUrl: API_URL }))
      fs.writeFileSync(
        path.join(botpressHome, 'bots.json'),
        JSON.stringify({
          default: { [PROD_BOT_ID]: { apiKey: 'prod_bot_key' } },
        })
      )
      const command = new Command({} as any, {} as any, new Logger(), makeArgv(botpressHome, workDir, valueFile, false))

      await command.run()

      expect(calls.map((call) => [call.init.method, call.url])).toEqual(
        expectedProdCalls(API_URL, PROD_BOT_ID, kind)
      )
      expect(headers(calls[0]!)).toMatchObject({
        authorization: 'Bearer prod_bot_key',
      })
      expect(headers(calls[0]!)['x-bot-id']).toBe(kind === 'secret-set' ? PROD_BOT_ID : undefined)
      expect(headers(calls[0]!)['x-workspace-id']).toBeUndefined()
    }
  )

  it.each(commandCases)(
    '$label works in a fresh agent project and keeps agent.json authoritative over poisoned bot.json coordinates',
    async ({ Command, kind }) => {
      fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
      fs.writeFileSync(
        path.join(workDir, 'agent.json'),
        JSON.stringify({ botId: PROD_BOT_ID, workspaceId: WORKSPACE_ID, apiUrl: AGENT_PROD_API_URL })
      )
      fs.writeFileSync(
        path.join(botpressHome, 'bots.json'),
        JSON.stringify({ default: { [PROD_BOT_ID]: { apiKey: 'agent_prod_bot_key' } } })
      )
      const argv = makeArgv(botpressHome, workDir, valueFile, false)

      await new Command({} as any, {} as any, new Logger(), argv).run()

      fs.writeFileSync(
        path.join(workDir, 'bot.json'),
        JSON.stringify({ botId: 999, workspaceId: 999, apiUrl: 'https://poisoned-bot-link.example' })
      )
      await new Command(
        {} as any,
        {} as any,
        new Logger(),
        argv
      ).run()

      expect(calls.map((call) => [call.init.method, call.url])).toEqual([
        ...expectedProdCalls(AGENT_PROD_API_URL, PROD_BOT_ID, kind),
        ...expectedProdCalls(AGENT_PROD_API_URL, PROD_BOT_ID, kind),
      ])
      for (const call of calls) {
        expect(headers(call).authorization).toBe('Bearer agent_prod_bot_key')
        expect(headers(call)['x-bot-id']).toBe(kind === 'secret-set' ? PROD_BOT_ID : undefined)
        expect(call.url).not.toContain('poisoned-bot-link')
      }
    }
  )

  it('uses only agent.local.json for a non-dev --local agent command', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: PROD_BOT_ID, workspaceId: WORKSPACE_ID, apiUrl: AGENT_PROD_API_URL })
    )
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ botId: '88', workspaceId: LOCAL_AGENT_WORKSPACE_ID, apiUrl: AGENT_LOCAL_API_URL })
    )
    fs.writeFileSync(
      path.join(workDir, 'bot.local.json'),
      JSON.stringify({ botId: 999, workspaceId: 999, apiUrl: 'https://poisoned-local-link.example' })
    )
    fs.writeFileSync(
      path.join(botpressHome, 'bots.json'),
      JSON.stringify({ local: { '88': { apiKey: 'agent_local_bot_key' } } })
    )
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, false, true)
    )

    await command.run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual(
      expectedProdCalls(AGENT_LOCAL_API_URL, '88', 'config-set')
    )
    expect(headers(calls[0]!)).toMatchObject({
      authorization: 'Bearer agent_local_bot_key',
    })
    expect(headers(calls[0]!)['x-bot-id']).toBeUndefined()
    expect(calls[0]!.url).not.toContain('poisoned-local-link')
    expect(calls[0]!.url).not.toContain('agent-prod')
  })

  it('falls back to legacy bot.local coordinates when agent.local contains only dev identities', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: 'dev_opaque', devTargetBotId: DEV_TARGET_BOT_ID })
    )
    fs.writeFileSync(
      path.join(workDir, 'bot.local.json'),
      JSON.stringify({ botId: 88, workspaceId: 9001, apiUrl: LOCAL_API_URL })
    )
    fs.writeFileSync(
      path.join(botpressHome, 'bots.json'),
      JSON.stringify({ local: { '88': { apiKey: 'legacy_local_bot_key' } } })
    )
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, false, true)
    )

    await command.run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual(
      expectedProdCalls(LOCAL_API_URL, '88', 'config-set')
    )
    expect(headers(calls[0]!)).toMatchObject({
      authorization: 'Bearer legacy_local_bot_key',
    })
    expect(headers(calls[0]!)['x-bot-id']).toBeUndefined()
    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toEqual({
      devId: 'dev_opaque',
      devTargetBotId: DEV_TARGET_BOT_ID,
    })
  })

  it('rejects a production agent target that differs from the selected profile before reading the per-bot key onto the wire', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: PROD_BOT_ID, workspaceId: WORKSPACE_ID, apiUrl: 'https://poison.example' })
    )
    fs.writeFileSync(
      path.join(botpressHome, 'bots.json'),
      JSON.stringify({ default: { [PROD_BOT_ID]: { apiKey: 'agent_prod_bot_key' } } })
    )
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, false)
    )

    await expect(command.run()).rejects.toThrow(/agent\.json.*selected profile/i)

    expect(calls).toEqual([])
  })

  it('rejects a local agent target that differs from the selected local profile before per-bot network work', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ botId: '88', workspaceId: 'foreign_ws', apiUrl: 'http://foreign.example' })
    )
    fs.writeFileSync(
      path.join(botpressHome, 'bots.json'),
      JSON.stringify({ local: { '88': { apiKey: 'local_bot_key' } } })
    )
    const command = new ConfigSetCommand(
      {} as any,
      {} as any,
      new Logger(),
      makeArgv(botpressHome, workDir, valueFile, false, true)
    )

    await expect(command.run()).rejects.toThrow(/agent\.local\.json.*selected profile/i)

    expect(calls).toEqual([])
  })

  it('requires local link coordinates before logs can send the selected profile PAT', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    const command = new LogsCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir, valueFile, false, true),
      botId: '88',
      since: '2026-07-09T00:00:00.000Z',
      until: '2026-07-09T01:00:00.000Z',
      follow: false,
      level: undefined,
      grep: undefined,
      conversationId: undefined,
      limit: undefined,
    } as any)

    await expect(command.run()).rejects.toThrow(/agent\.local\.json.*apiUrl/i)

    expect(calls).toEqual([])
  })

  it('rejects poisoned production agent coordinates before logs can send the selected profile PAT', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: PROD_BOT_ID, workspaceId: WORKSPACE_ID, apiUrl: 'https://poison.example' })
    )
    const command = new LogsCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir, valueFile, false),
      since: '2026-07-09T00:00:00.000Z',
      until: '2026-07-09T01:00:00.000Z',
      follow: false,
      level: undefined,
      grep: undefined,
      conversationId: undefined,
      limit: undefined,
    } as any)

    await expect(command.run()).rejects.toThrow(/agent\.json.*selected profile/i)

    expect(calls).toEqual([])
  })

  it('rejects poisoned classic bot.json coordinates before logs can send the selected profile PAT', async () => {
    fs.writeFileSync(
      path.join(workDir, 'bot.json'),
      JSON.stringify({ botId: Number(PROD_BOT_ID), apiUrl: 'https://poison.example' })
    )
    const command = new LogsCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir, valueFile, false),
      since: '2026-07-09T00:00:00.000Z',
      until: '2026-07-09T01:00:00.000Z',
      follow: false,
      level: undefined,
      grep: undefined,
      conversationId: undefined,
      limit: undefined,
    } as any)

    await expect(command.run()).rejects.toThrow(/bot\.json.*selected profile/i)

    expect(calls).toEqual([])
  })

  it('reads logs for a fresh agent project from agent.json without bot.json', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: PROD_BOT_ID, workspaceId: WORKSPACE_ID, apiUrl: AGENT_PROD_API_URL })
    )
    const command = new LogsCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir, valueFile, false),
      since: '2026-07-09T00:00:00.000Z',
      until: '2026-07-09T01:00:00.000Z',
      follow: false,
      level: undefined,
      grep: undefined,
      conversationId: undefined,
      limit: undefined,
    } as any)

    await command.run()

    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      `${AGENT_PROD_API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${PROD_BOT_ID}/logs?` +
        'timeStart=2026-07-09T00%3A00%3A00.000Z&timeEnd=2026-07-09T01%3A00%3A00.000Z'
    )
    expect(headers(calls[0]!)).toMatchObject({
      authorization: 'Bearer brt_pat_xxx',
    })
    expect(headers(calls[0]!)['x-bot-id']).toBeUndefined()
    expect(fs.existsSync(path.join(workDir, 'bot.json'))).toBe(false)
  })

  it('reads dev logs through the attested runtime target and canonical numeric bot route', async () => {
    writeDevCache(workDir, 'agent', 'agent-dev-opaque')
    const command = new LogsCommand({} as any, {} as any, new Logger(), {
      ...makeArgv(botpressHome, workDir, valueFile, true),
      since: '2026-07-09T00:00:00.000Z',
      until: '2026-07-09T01:00:00.000Z',
      follow: false,
      level: undefined,
      grep: undefined,
      conversationId: undefined,
      limit: undefined,
    } as any)

    await command.run()

    expect(calls.map((call) => [call.init.method, call.url])).toEqual([
      ['GET', `${API_URL}/v1/admin/bots/agent-dev-opaque`],
      [
        'GET',
        `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${DEV_TARGET_BOT_ID}/logs?` +
          'timeStart=2026-07-09T00%3A00%3A00.000Z&timeEnd=2026-07-09T01%3A00%3A00.000Z',
      ],
    ])
    expect(calls.every((call) => headers(call).authorization === 'Bearer brt_pat_xxx')).toBe(true)
    expect(calls.every((call) => headers(call)['x-bot-id'] === undefined)).toBe(true)
  })
})

function writeDevCache(workDir: string, source: CacheSource, opaqueId: string): void {
  if (source === 'agent') {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(path.join(workDir, 'agent.local.json'), JSON.stringify({ devId: opaqueId }))
    return
  }

  const cacheDir = path.join(workDir, '.botpress')
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.writeFileSync(path.join(cacheDir, 'project.cache.json'), JSON.stringify({ devId: opaqueId, tunnelId: opaqueId }))
}

function writeLocalDevMetadata(
  workDir: string,
  source: CacheSource,
  opaqueId: string,
  metadata: { workspaceId?: string; apiUrl?: string }
): void {
  writeDevCache(workDir, source, opaqueId)
  if (source === 'agent') {
    fs.writeFileSync(path.join(workDir, 'agent.local.json'), JSON.stringify({ devId: opaqueId, ...metadata }))
    return
  }
  fs.writeFileSync(
    path.join(workDir, 'bot.local.json'),
    JSON.stringify({
      ...metadata,
      ...(metadata.workspaceId !== undefined ? { workspaceId: Number(metadata.workspaceId) } : {}),
    })
  )
}

function devTargetCachePath(workDir: string, source: CacheSource): string {
  return source === 'agent'
    ? path.join(workDir, 'agent.local.json')
    : path.join(workDir, '.botpress', 'project.cache.json')
}

function makeArgv(botpressHome: string, workDir: string, valueFile: string, dev: boolean, local = false): any {
  return {
    botpressHome,
    workDir,
    profile: local ? 'local' : 'default',
    apiUrl: undefined,
    botId: undefined,
    local,
    dev,
    name: 'FOO',
    valueFile,
  }
}

function headers(call: FetchCall): Record<string, string> {
  return call.init.headers as Record<string, string>
}
