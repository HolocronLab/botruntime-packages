import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import commandDefinitions from '../command-definitions'
import { buildBrtDocsContract } from '../docs-contract'
import { Logger } from '../logger'
import { TracesCommand } from './traces-command'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '42'
const PROD_BOT_ID = '7'
const DEV_RUNTIME_BOT_ID = 'dev_runtime:7'
const DEV_TARGET_BOT_ID = '8'

type FetchCall = { url: string; init: RequestInit }

const trace = (overrides: Record<string, unknown> = {}) => ({
  id: '101',
  createdAt: '2026-07-10T10:00:00.000Z',
  startedAt: '2026-07-10T10:00:00.000Z',
  endedAt: '2026-07-10T10:00:00.125Z',
  source: 'otlp',
  name: 'handler.conversation',
  kind: 'server',
  status: 'ok',
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '0123456789abcdef',
  durationMs: 125,
  metadata: {
    aiModel: 'openai:gpt-5',
    aiInputTokens: 10,
    workflowName: 'answer',
  },
  ...overrides,
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('brt traces public contract', () => {
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string
  let stderr: string
  let originalFetch: typeof fetch

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-traces-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-traces-project-'))
    calls = []
    stdout = ''
    stderr = ''
    originalFetch = globalThis.fetch

    fs.writeFileSync(
      path.join(botpressHome, 'profiles.json'),
      JSON.stringify({
        default: {
          apiUrl: API_URL,
          workspaceId: WORKSPACE_ID,
          token: 'pat_secret',
        },
      })
    )
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: PROD_BOT_ID,
        workspaceId: WORKSPACE_ID,
        apiUrl: API_URL,
      })
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

  it('is a real command-tree leaf and a generated docs-contract entry', () => {
    expect(commandDefinitions.traces).toEqual(
      expect.objectContaining({
        description: expect.stringMatching(/trace/i),
        schema: expect.objectContaining({
          conversationId: expect.objectContaining({ demandOption: true }),
          dev: expect.objectContaining({ type: 'boolean' }),
          limit: expect.objectContaining({ type: 'number' }),
          nextToken: expect.objectContaining({ type: 'string' }),
        }),
      })
    )
    expect(buildBrtDocsContract(commandDefinitions).commands).toContainEqual(
      expect.objectContaining({ path: 'traces' })
    )
  })

  it('uses the canonical production workspace/bot route and PAT authority', async () => {
    stubFetch(async () => json({ traces: [trace()], meta: {} }))

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${PROD_BOT_ID}/traces?conversationId=conv%3A1&pageSize=20`
    )
    expect(headers(calls[0]!)).toEqual({ authorization: 'Bearer pat_secret' })
  })

  it('uses the attested opaque dev runtime route without mixing in the production target', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: DEV_RUNTIME_BOT_ID,
        devTargetBotId: DEV_TARGET_BOT_ID,
      })
    )
    stubFetch(async (url) => {
      const parsed = new URL(url)
      if (decodeURIComponent(parsed.pathname) === `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`) {
        return json({
          bot: {
            id: DEV_RUNTIME_BOT_ID,
            dev: true,
            tags: { 'botruntime.devTargetBotId': DEV_TARGET_BOT_ID },
          },
        })
      }
      return json({ traces: [trace()], meta: {} })
    })

    const result = await command({ dev: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(calls.map((call) => decodeURIComponent(new URL(call.url).pathname))).toEqual([
      `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`,
      '/v1/traces',
    ])
    expect(headers(calls[1]!)).toEqual({
      authorization: 'Bearer pat_secret',
      'x-bot-id': DEV_RUNTIME_BOT_ID,
    })
    expect(calls[1]!.url).not.toContain(PROD_BOT_ID + '/traces')
  })

  it('fails before network when the canonical production link is absent', async () => {
    fs.rmSync(path.join(workDir, 'agent.json'))
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(/agent\.json.*brt link/i)
  })

  it.each([
    [{ botId: 'dev_opaque', workspaceId: WORKSPACE_ID, apiUrl: API_URL }, /botId.*positive decimal/i],
    [{ botId: PROD_BOT_ID, workspaceId: 'ws_default', apiUrl: API_URL }, /workspaceId.*positive decimal/i],
    [
      {
        botId: PROD_BOT_ID,
        workspaceId: WORKSPACE_ID,
        apiUrl: 'https:\/\/poison.example',
      },
      /agent\.json.*profile/i,
    ],
  ])('rejects malformed or poisoned production identity before network: %j', async (identity, expected) => {
    fs.writeFileSync(path.join(workDir, 'agent.json'), JSON.stringify(identity))
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(expected)
  })

  it.each([
    [401, /brt login|profile/i],
    [403, /access|permission|member/i],
    [404, /link|target/i],
    [500, /retry|server/i],
  ])('returns exit code 1 with remediation for HTTP %s without leaking the response body', async (status, expected) => {
    stubFetch(async () => json({ error: 'raw prompt secret from server' }, status))

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(expected)
    expect(stdout + stderr).not.toContain('raw prompt secret')
  })

  it('returns exit code 1 with network remediation', async () => {
    stubFetch(async () => {
      throw new TypeError('socket closed')
    })

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/network|connect|api url|retry/i)
  })

  it.each([
    [{ traces: 'wrong', meta: {} }, /malformed.*traces/i],
    [{ traces: [], meta: { nextToken: 123 } }, /malformed.*nextToken/i],
    [{ traces: [{ ...trace(), durationMs: '125' }], meta: {} }, /durationMs.*malformed/i],
  ])('fails loudly on malformed backend response: %j', async (body, expected) => {
    stubFetch(async () => json(body))

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(expected)
  })

  it('fails on malformed JSON without reflecting raw response content', async () => {
    stubFetch(async () => new Response('{"prompt":"raw prompt secret"', { status: 200 }))

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/malformed JSON/i)
    expect(stdout + stderr).not.toContain('raw prompt secret')
  })

  it('paginates only up to limit and returns the resumable cursor', async () => {
    stubFetch(async (_url, index) =>
      index === 0
        ? json({
            traces: [trace({ id: '3' }), trace({ id: '2' })],
            meta: { nextToken: '2' },
          })
        : json({ traces: [trace({ id: '1' })], meta: { nextToken: '1' } })
    )

    const result = await command({ json: true, limit: 3 }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(2)
    expect(new URL(calls[0]!.url).searchParams.get('pageSize')).toBe('3')
    expect(new URL(calls[1]!.url).searchParams.get('pageSize')).toBe('1')
    expect(new URL(calls[1]!.url).searchParams.get('nextToken')).toBe('2')
    expect(output.traces).toHaveLength(3)
    expect(output.nextToken).toBe('1')
  })

  it('prints a readable metadata-only line in human mode', async () => {
    stubFetch(async () => json({ traces: [trace()], meta: {} }))

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).toMatch(/2026-07-10T10:00:00\.000Z.*OK.*125ms.*handler\.conversation/i)
    expect(stdout).toContain('model=openai:gpt-5')
    expect(stdout).toContain('workflow=answer')
  })

  it('prints a stable JSON envelope containing only allow-listed trace metadata', async () => {
    const unsafe = trace({
      prompt: 'raw prompt',
      modelResponse: 'raw response',
      toolInput: { password: 'tool secret' },
      toolOutput: { document: 'document secret' },
      error: 'raw error',
      metadata: {
        aiModel: 'openai:gpt-5',
        aiInputTokens: 10,
        workflowName: 'answer',
        prompt: 'metadata prompt',
        rawError: 'metadata raw error',
        arbitrary: { secret: true },
      },
    })
    stubFetch(async () => json({ traces: [unsafe], meta: {} }))

    const result = await command({ json: true }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(output).toEqual({
      schemaVersion: 1,
      target: {
        environment: 'production',
        workspaceId: WORKSPACE_ID,
        botId: PROD_BOT_ID,
      },
      conversationId: 'conv:1',
      traces: [trace()],
      nextToken: null,
    })
    expect(stdout + stderr).not.toMatch(/raw prompt|raw response|tool secret|document secret|raw error|arbitrary/i)
  })

  function command(overrides: Record<string, unknown> = {}): TracesCommand {
    const argv = {
      apiUrl: undefined,
      botId: undefined,
      botpressHome,
      confirm: false,
      conversationId: 'conv:1',
      dev: false,
      json: false,
      limit: 20,
      local: false,
      nextToken: undefined,
      profile: 'default',
      verbose: false,
      workDir,
      ...overrides,
    }
    return new TracesCommand({} as any, {} as any, new Logger(argv as any), argv as any)
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

function headers(call: FetchCall): Record<string, string> {
  return call.init.headers as Record<string, string>
}
