import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import { LogsCommand } from './logs-command'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '42'
const PROD_BOT_ID = '7'
const DEV_RUNTIME_BOT_ID = 'dev_runtime:7'
const DEV_TARGET_BOT_ID = '8'

type FetchCall = { url: string }

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('brt logs — dev-empty-result hint', () => {
  let workDir: string
  let botpressHome: string
  let calls: FetchCall[]
  let stdout: string
  let originalFetch: typeof fetch

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-logs-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-logs-project-'))
    calls = []
    stdout = ''
    originalFetch = globalThis.fetch

    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: { apiUrl: API_URL, workspaceId: WORKSPACE_ID, token: 'pat_secret' },
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
  })

  afterEach(() => {
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('hints at `brt dev` when a --dev target returns no logs', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: DEV_RUNTIME_BOT_ID, devTargetBotId: DEV_TARGET_BOT_ID })
    )
    stubFetch(async (url) => {
      const pathname = decodeURIComponent(new URL(url).pathname)
      if (pathname === `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`) {
        return json({
          bot: { id: DEV_RUNTIME_BOT_ID, dev: true, tags: { 'botruntime.devTargetBotId': DEV_TARGET_BOT_ID } },
        })
      }
      return json({ logs: [] })
    })

    const result = await logsCommand({ dev: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).toMatch(/brt dev.*terminal/i)
    expect(stdout).toMatch(/production supervisor/i)
  })

  it('suppresses the dev hint under --json: stdout must stay raw JSON', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: DEV_RUNTIME_BOT_ID, devTargetBotId: DEV_TARGET_BOT_ID })
    )
    stubFetch(async (url) => {
      const pathname = decodeURIComponent(new URL(url).pathname)
      if (pathname === `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`) {
        return json({
          bot: { id: DEV_RUNTIME_BOT_ID, dev: true, tags: { 'botruntime.devTargetBotId': DEV_TARGET_BOT_ID } },
        })
      }
      return json({ logs: [] })
    })

    const result = await logsCommand({ dev: true, json: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).not.toMatch(/brt dev.*terminal/i)
  })

  it('does not print the dev hint when a --dev target has logs', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({ devId: DEV_RUNTIME_BOT_ID, devTargetBotId: DEV_TARGET_BOT_ID })
    )
    stubFetch(async (url) => {
      const pathname = decodeURIComponent(new URL(url).pathname)
      if (pathname === `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`) {
        return json({
          bot: { id: DEV_RUNTIME_BOT_ID, dev: true, tags: { 'botruntime.devTargetBotId': DEV_TARGET_BOT_ID } },
        })
      }
      return json({ logs: [{ timestamp: '2026-07-10T10:00:00.000Z', level: 'info', message: 'hello' }] })
    })

    const result = await logsCommand({ dev: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).not.toMatch(/brt dev.*terminal/i)
  })

  it('does not print the dev hint for an empty production target', async () => {
    stubFetch(async () => json({ logs: [] }))

    const result = await logsCommand().handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).not.toMatch(/brt dev.*terminal/i)
  })

  it('serializes relative --since/--until filters as RFC3339 before the request', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-18T21:40:00.000Z'))
    stubFetch(async () => json({ logs: [] }))

    const result = await logsCommand({ since: '10m', until: '30s' }).handler()

    expect(result.exitCode).toBe(0)
    const url = new URL(calls[0]!.url)
    expect(url.searchParams.get('timeStart')).toBe('2026-07-18T21:30:00.000Z')
    expect(url.searchParams.get('timeEnd')).toBe('2026-07-18T21:39:30.000Z')
  })

  it('rejects invalid relative time filters before the network', async () => {
    stubFetch(async () => json({ logs: [] }))

    const result = await logsCommand({ since: 'ten-minutes' }).handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toHaveLength(0)
  })

  function baseArgv(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      apiUrl: undefined,
      botId: undefined,
      botpressHome,
      confirm: false,
      dev: false,
      json: false,
      local: false,
      profile: 'default',
      verbose: false,
      workDir,
      level: undefined,
      grep: undefined,
      conversationId: undefined,
      limit: undefined,
      since: undefined,
      until: undefined,
      follow: false,
      ...overrides,
    }
  }

  function logsCommand(overrides: Record<string, unknown> = {}): LogsCommand {
    const argv = baseArgv(overrides)
    return new LogsCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function stubFetch(impl: (url: string, index: number) => Promise<Response>): void {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = String(input)
      const index = calls.length
      calls.push({ url })
      return impl(url, index)
    }) as typeof fetch
  }
})
