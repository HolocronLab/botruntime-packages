import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as agentLink from '../adk-agent-link'
import * as cloudIO from '../cloud-io'
import { schemas } from '../config'
import { Logger } from '../logger'
import { LinkCommand } from './cloud-link-command'

const PROFILE_API_URL = 'https://profile.example'
const PROFILE_WORKSPACE_ID = 'ws_profile'
const LOCAL_WORKSPACE_ID = '9001'
const PRECISE_BOT_ID = '9007199254740993'

function writeJson(filePath: string, value: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2))
}

describe('brt link agent-aware persistence', () => {
  let botpressHome: string
  let workDir: string

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-link-agent-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-link-agent-project-'))
    writeJson(path.join(botpressHome, 'profiles.json'), {
      default: {
        apiUrl: PROFILE_API_URL,
        workspaceId: PROFILE_WORKSPACE_ID,
        token: 'brt_pat_profile',
      },
      local: {
        apiUrl: 'http://127.0.0.1:8787',
        workspaceId: LOCAL_WORKSPACE_ID,
        token: 'brt_pat_local',
      },
      opaqueLocal: {
        apiUrl: 'http://127.0.0.1:8787',
        workspaceId: 'ws_local',
        token: 'brt_pat_local',
      },
    })
    vi.spyOn(process.stdout, 'write').mockImplementation((() => true) as any)
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('writes precise canonical coordinates to agent.json and does not create bot.json', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')

    await makeCommand({ botId: PRECISE_BOT_ID }).run()

    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8'))).toEqual({
      botId: PRECISE_BOT_ID,
      workspaceId: PROFILE_WORKSPACE_ID,
      apiUrl: PROFILE_API_URL,
    })
    expect(fs.existsSync(path.join(workDir, 'bot.json'))).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(botpressHome, 'bots.json'), 'utf8'))).toEqual({
      default: { [PRECISE_BOT_ID]: { apiKey: 'per_bot_key' } },
    })
  })

  it('merges canonical local coordinates into agent.local.json without losing dev target metadata', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: '7',
      workspaceId: PROFILE_WORKSPACE_ID,
      apiUrl: PROFILE_API_URL,
    })
    writeJson(path.join(workDir, 'agent.local.json'), {
      devId: 'dev_opaque',
      devTargetBotId: '42',
    })
    const originalProdInfo = fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8')

    await makeCommand({
      botId: '88',
      local: true,
      profile: 'local',
      apiUrl: 'http://127.0.0.1:8787',
      workspaceId: LOCAL_WORKSPACE_ID,
    }).run()

    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.local.json'), 'utf8'))).toEqual({
      botId: '88',
      workspaceId: LOCAL_WORKSPACE_ID,
      apiUrl: 'http://127.0.0.1:8787',
      devId: 'dev_opaque',
      devTargetBotId: '42',
    })
    expect(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8')).toBe(originalProdInfo)
    expect(fs.existsSync(path.join(workDir, 'bot.local.json'))).toBe(false)
  })

  it('keeps classic projects on bot.json with the legacy numeric shape', async () => {
    await makeCommand({ botId: '42' }).run()

    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'bot.json'), 'utf8'))).toEqual({
      botId: 42,
      apiUrl: PROFILE_API_URL,
    })
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
  })

  it('normalizes a zero-padded classic id once for both bots.json and bot.json', async () => {
    await makeCommand({ botId: '00042' }).run()

    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'bot.json'), 'utf8'))).toMatchObject({ botId: 42 })
    expect(JSON.parse(fs.readFileSync(path.join(botpressHome, 'bots.json'), 'utf8'))).toEqual({
      default: { '42': { apiKey: 'per_bot_key' } },
    })
  })

  it('rejects an unsafe classic integer before writing credentials or a project link', async () => {
    await expect(makeCommand({ botId: '9007199254740992' }).run()).rejects.toThrow(/safe integer/i)

    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'bot.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
  })

  it('repairs stale canonical agent coordinates to the selected profile instead of preserving a mixed target', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(path.join(workDir, 'agent.json'), {
      botId: '7',
      workspaceId: 'stale_workspace',
      apiUrl: 'https://stale.example',
    })

    await makeCommand({ botId: PRECISE_BOT_ID }).run()

    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'agent.json'), 'utf8'))).toEqual({
      botId: PRECISE_BOT_ID,
      workspaceId: PROFILE_WORKSPACE_ID,
      apiUrl: PROFILE_API_URL,
    })
    expect(JSON.parse(fs.readFileSync(path.join(botpressHome, 'bots.json'), 'utf8'))).toEqual({
      default: { [PRECISE_BOT_ID]: { apiKey: 'per_bot_key' } },
    })
  })

  it('rejects a foreign --local authority before reading or writing per-bot credentials', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    const secretRead = vi.spyOn(cloudIO, 'readSecretValue').mockResolvedValue('must-not-be-read')

    await expect(
      makeCommand({
        botId: '88',
        local: true,
        profile: 'local',
        apiUrl: 'http://foreign.example',
        workspaceId: 'foreign_workspace',
        key: undefined,
        keyStdin: true,
      }).run()
    ).rejects.toThrow(/selected profile/i)

    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'agent.local.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'bot.local.json'))).toBe(false)
    expect(secretRead).not.toHaveBeenCalled()
  })

  it('rejects a poisoned existing local link before reading the replacement key', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    writeJson(path.join(workDir, 'agent.local.json'), {
      botId: '88',
      workspaceId: 'foreign_workspace',
      apiUrl: 'http://foreign.example',
    })
    const secretRead = vi.spyOn(cloudIO, 'readSecretValue').mockResolvedValue('must-not-be-read')

    await expect(
      makeCommand({
        botId: '88',
        local: true,
        profile: 'local',
        key: undefined,
        keyStdin: true,
      }).run()
    ).rejects.toThrow(/agent\.local\.json.*selected profile/i)

    expect(secretRead).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
  })

  it('writes a complete classic local link from the matching numeric local profile', async () => {
    await makeCommand({ botId: '42', local: true, profile: 'local' }).run()

    expect(JSON.parse(fs.readFileSync(path.join(workDir, 'bot.local.json'), 'utf8'))).toEqual({
      workspaceId: Number(LOCAL_WORKSPACE_ID),
      botId: 42,
      apiUrl: 'http://127.0.0.1:8787',
    })
    expect(JSON.parse(fs.readFileSync(path.join(botpressHome, 'bots.json'), 'utf8'))).toEqual({
      local: { '42': { apiKey: 'per_bot_key' } },
    })
  })

  it('rejects an opaque classic local workspace before reading or persisting the key', async () => {
    const secretRead = vi.spyOn(cloudIO, 'readSecretValue').mockResolvedValue('must-not-be-read')

    await expect(
      makeCommand({
        botId: '42',
        local: true,
        profile: 'opaqueLocal',
        key: undefined,
        keyStdin: true,
      }).run()
    ).rejects.toThrow(/workspaceId.*safe integer/i)

    expect(secretRead).not.toHaveBeenCalled()
    expect(fs.existsSync(path.join(botpressHome, 'bots.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'bot.local.json'))).toBe(false)
  })

  it('describes --workspace-id as canonical link metadata rather than a deploy target', () => {
    expect(schemas.cloudLink.workspaceId.description).toMatch(/canonical.*link/i)
    expect(schemas.cloudLink.workspaceId.description).not.toMatch(/deploy/i)
  })

  it('persists the exact per-bot key before a canonical agent link write failure', async () => {
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    vi.spyOn(agentLink, 'writeAgentInfo').mockImplementation(() => {
      throw new Error('simulated agent.json write failure')
    })

    await expect(makeCommand({ botId: PRECISE_BOT_ID }).run()).rejects.toThrow(
      'simulated agent.json write failure'
    )

    expect(JSON.parse(fs.readFileSync(path.join(botpressHome, 'bots.json'), 'utf8'))).toEqual({
      default: { [PRECISE_BOT_ID]: { apiKey: 'per_bot_key' } },
    })
    expect(fs.existsSync(path.join(workDir, 'agent.json'))).toBe(false)
    expect(fs.existsSync(path.join(workDir, 'bot.json'))).toBe(false)
  })

  function makeCommand(overrides: Record<string, unknown> = {}): LinkCommand {
    return new LinkCommand({} as any, {} as any, new Logger(), {
      botpressHome,
      workDir,
      profile: 'default',
      apiUrl: undefined,
      botId: '42',
      workspaceId: undefined,
      local: false,
      key: 'per_bot_key',
      keyStdin: false,
      ...overrides,
    } as any)
  }
})
