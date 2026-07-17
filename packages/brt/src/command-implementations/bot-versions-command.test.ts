import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import { DeployBotVersionCommand, ListBotVersionsCommand } from './bot-versions-command'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '42'
const PROD_BOT_ID = '7'
const OTHER_BOT_ID = '99'
const BOT_KEY = 'bot_key_secret'
const OTHER_BOT_KEY = 'other_bot_key_secret'
const PAT_TOKEN = 'pat_secret'

type FetchCall = { url: string; init: RequestInit }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

const stripAnsi = (value: string): string => value.replace(/\x1b\[[0-9;]*m/g, '')

describe('brt bots versions list|deploy', () => {
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string
  let stderr: string
  let originalFetch: typeof fetch

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-versions-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-versions-project-'))
    calls = []
    stdout = ''
    stderr = ''
    originalFetch = globalThis.fetch

    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: { apiUrl: API_URL, workspaceId: WORKSPACE_ID, token: PAT_TOKEN },
      })
    )
    fs.writeFileSync(
      path.join(botpressHome, 'bots.json'),
      JSON.stringify({
        default: {
          [PROD_BOT_ID]: { apiKey: BOT_KEY },
          [OTHER_BOT_ID]: { apiKey: OTHER_BOT_KEY },
        },
      })
    )
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: PROD_BOT_ID, workspaceId: WORKSPACE_ID, apiUrl: API_URL })
    )

    vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stdout += String(chunk)
      return true
    }) as typeof process.stdout.write)
    vi.spyOn(process.stderr, 'write').mockImplementation(((chunk: string | Uint8Array) => {
      stderr += String(chunk)
      return true
    }) as typeof process.stderr.write)
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  describe('list', () => {
    it('authenticates with the per-bot key, not the workspace PAT', async () => {
      stubFetch(async () => json({ versions: [] }))

      const result = await listCommand().handler()

      expect(result.exitCode).toBe(0)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.url).toBe(`${API_URL}/v1/admin/bots/${PROD_BOT_ID}/versions`)
      const headers = calls[0]!.init.headers as Record<string, string>
      expect(headers.authorization).toBe(`Bearer ${BOT_KEY}`)
    })

    it('marks the current version in human output and prints createdAt', async () => {
      stubFetch(async () =>
        json({
          versions: [
            { id: '1', name: 'v1', description: 'hash1', current: false, createdAt: '2026-07-10T10:00:00.000Z' },
            { id: '2', name: 'v2', description: 'hash2', current: true, createdAt: '2026-07-11T10:00:00.000Z' },
          ],
        })
      )

      const result = await listCommand().handler()

      expect(result.exitCode).toBe(0)
      const plain = stripAnsi(stdout)
      expect(plain).toMatch(/\b1\b.*2026-07-10T10:00:00\.000Z.*v1/)
      expect(plain).toMatch(/\b2\b.*2026-07-11T10:00:00\.000Z.*v2.*\(current\)/)
    })

    it('emits the raw parsed array under --json', async () => {
      stubFetch(async () =>
        json({
          versions: [{ id: '1', name: 'v1', current: true, createdAt: '2026-07-10T10:00:00.000Z' }],
        })
      )

      const result = await listCommand({ json: true }).handler()

      expect(result.exitCode).toBe(0)
      const parsed = JSON.parse(stdout)
      expect(parsed).toEqual([{ id: '1', name: 'v1', current: true, createdAt: '2026-07-10T10:00:00.000Z' }])
    })

    it('fails loud (nonzero exit, no bot list) on a malformed server response', async () => {
      stubFetch(async () => json({ versions: [{ id: '1' }] }))

      const result = await listCommand().handler()

      expect(result.exitCode).toBe(1)
      expect(stderr).toMatch(/malformed/)
      expect(stdout).not.toMatch(/\bv1\b/)
    })

    it('wraps a server error into a readable CLI error', async () => {
      stubFetch(async () => json({ message: 'bot not found' }, 404))

      const result = await listCommand().handler()

      expect(result.exitCode).toBe(1)
      expect(stderr).toMatch(/could not list versions for bot 7/)
    })

    it('honors --bot-id as an override of the canonical link', async () => {
      stubFetch(async () => json({ versions: [] }))

      const result = await listCommand({ botId: OTHER_BOT_ID }).handler()

      expect(result.exitCode).toBe(0)
      expect(calls[0]!.url).toBe(`${API_URL}/v1/admin/bots/${OTHER_BOT_ID}/versions`)
      const headers = calls[0]!.init.headers as Record<string, string>
      expect(headers.authorization).toBe(`Bearer ${OTHER_BOT_KEY}`)
    })
  })

  describe('deploy', () => {
    it('POSTs {versionId} to the deploy route using the per-bot key and prints success', async () => {
      stubFetch(async () => json({}))

      const result = await deployCommand({ versionId: '3' }).handler()

      expect(result.exitCode).toBe(0)
      expect(calls).toHaveLength(1)
      expect(calls[0]!.url).toBe(`${API_URL}/v1/admin/bots/${PROD_BOT_ID}/versions/deploy`)
      expect(calls[0]!.init.method).toBe('POST')
      expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ versionId: '3' })
      const headers = calls[0]!.init.headers as Record<string, string>
      expect(headers.authorization).toBe(`Bearer ${BOT_KEY}`)
      const plain = stripAnsi(stdout)
      expect(plain).toMatch(/Bot 7 is now running version 3/)
    })

    it('emits a machine-readable result under --json', async () => {
      stubFetch(async () => json({}))

      const result = await deployCommand({ versionId: '3', json: true }).handler()

      expect(result.exitCode).toBe(0)
      expect(JSON.parse(stdout)).toEqual({ botId: PROD_BOT_ID, current: '3' })
    })

    it('wraps a server error (unknown version) into a readable CLI error', async () => {
      stubFetch(async () => json({ message: 'bot version not found' }, 404))

      const result = await deployCommand({ versionId: 'nope' }).handler()

      expect(result.exitCode).toBe(1)
      expect(stderr).toMatch(/could not deploy version nope for bot 7/)
    })
  })

  function baseArgv(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      apiUrl: undefined,
      botId: undefined,
      botpressHome,
      confirm: false,
      json: false,
      local: false,
      profile: 'default',
      verbose: false,
      workDir,
      ...overrides,
    }
  }

  function listCommand(overrides: Record<string, unknown> = {}): ListBotVersionsCommand {
    const argv = baseArgv(overrides)
    return new ListBotVersionsCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function deployCommand(overrides: Record<string, unknown> = {}): DeployBotVersionCommand {
    const argv = baseArgv({ versionId: '1', ...overrides })
    return new DeployBotVersionCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function stubFetch(impl: (url: string, index: number, init: RequestInit) => Promise<Response>): void {
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const url = String(input)
      const index = calls.length
      calls.push({ url, init })
      return impl(url, index, init)
    }) as typeof fetch
  }
})
