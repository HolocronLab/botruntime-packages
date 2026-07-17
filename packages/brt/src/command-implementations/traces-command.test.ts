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
  attributes: {},
  payload: {},
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
      }),
    )
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: PROD_BOT_ID,
        workspaceId: WORKSPACE_ID,
        apiUrl: API_URL,
      }),
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
          tokens: expect.objectContaining({ positional: true, array: true }),
          conversationId: expect.objectContaining({ type: 'string' }),
          dev: expect.objectContaining({ type: 'boolean' }),
          error: expect.objectContaining({ type: 'boolean' }),
          includeLlm: expect.objectContaining({ type: 'boolean', default: false }),
          limit: expect.objectContaining({ type: 'number' }),
          nextToken: expect.objectContaining({ type: 'string' }),
          status: expect.objectContaining({ type: 'string' }),
          traceId: expect.objectContaining({ type: 'string' }),
        }),
      }),
    )
    expect(buildBrtDocsContract(commandDefinitions).commands).toContainEqual(
      expect.objectContaining({ path: 'traces' }),
    )
  })

  it('uses the canonical production workspace/bot route and PAT authority', async () => {
    stubFetch(async () => json({ traces: [trace()], meta: {} }))

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(
      `${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${PROD_BOT_ID}/traces?conversationId=conv%3A1&pageSize=20`,
    )
    expect(headers(calls[0]!)).toEqual({ authorization: 'Bearer pat_secret' })
  })

  it('maps every supported API filter without changing its spelling', async () => {
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await command({
      action: 'lookup-order',
      error: false,
      name: 'autonomous.tool',
      since: '2026-07-10T09:00:00Z',
      source: 'otlp',
      status: 'ok',
      traceId: 'ABCDEF0123456789ABCDEF0123456789',
      until: '2026-07-10T10:00:00Z',
      workflow: 'onboarding',
    }).handler()

    expect(result.exitCode).toBe(0)
    const query = new URL(calls[0]!.url).searchParams
    expect(Object.fromEntries(query)).toEqual({
      conversationId: 'conv:1',
      pageSize: '20',
      status: 'ok',
      error: 'false',
      source: 'otlp',
      name: 'autonomous.tool',
      workflow: 'onboarding',
      action: 'lookup-order',
      traceId: 'abcdef0123456789abcdef0123456789',
      since: '2026-07-10T09:00:00Z',
      until: '2026-07-10T10:00:00Z',
    })
  })

  it('accepts Botpress-compatible tokens and converts durations from one captured instant', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-10T10:00:00.000Z'))
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await command({
      conversationId: undefined,
      limit: undefined,
      tokens: [
        'conversation=conv:token',
        'error',
        'workflow=onboarding',
        'action=lookup-order',
        'trace=ABCDEF0123456789ABCDEF0123456789',
        'since=1h',
        'until=30m',
        'limit=75',
      ],
    }).handler()

    expect(result.exitCode).toBe(0)
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toEqual({
      conversationId: 'conv:token',
      pageSize: '75',
      error: 'true',
      workflow: 'onboarding',
      action: 'lookup-order',
      traceId: 'abcdef0123456789abcdef0123456789',
      since: '2026-07-10T09:00:00.000Z',
      until: '2026-07-10T09:30:00.000Z',
    })
  })

  it('queries workflow traces without a conversation when the scan is time-bounded', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-10T10:00:00.000Z'))
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await command({
      conversationId: undefined,
      tokens: ['workflow=builtin_eval_runner', 'since=10m'],
    }).handler()

    expect(result.exitCode).toBe(0)
    expect(Object.fromEntries(new URL(calls[0]!.url).searchParams)).toEqual({
      pageSize: '20',
      workflow: 'builtin_eval_runner',
      since: '2026-07-10T09:50:00.000Z',
    })
  })

  it.each([
    [{ conversationId: undefined, tokens: [] }, /conversation.*required/i],
    [{ conversationId: undefined, tokens: ['workflow=builtin_eval_runner'] }, /since.*required/i],
    [{ conversationId: undefined, tokens: ['since=10m'] }, /workflow.*action.*trace/i],
    [{ tokens: ['include-llm'] }, /--include-llm/i],
    [{ tokens: ['trigger=handler'] }, /trigger.*not supported/i],
    [{ tokens: ['follow'] }, /follow.*not supported/i],
    [{ tokens: ['wat=unknown'] }, /unknown trace filter/i],
    [{ tokens: ['conversation=other'] }, /conversation.*more than once|conflict/i],
    [{ tokens: ['error'], error: false }, /error.*more than once|conflict/i],
    [{ tokens: ['limit=10'], limit: 20 }, /limit.*more than once|conflict/i],
    [{ status: 'warning' }, /status.*unset.*ok.*error/i],
    [{ source: 'raw' }, /source.*supported/i],
    [{ name: 'raw.prompt' }, /name.*supported/i],
    [{ traceId: '0'.repeat(32) }, /trace-id.*non-zero/i],
    [{ since: 'yesterday' }, /since.*RFC3339.*duration/i],
    [{ since: '1h', until: '2h' }, /since.*until/i],
    [{ limit: 10_001 }, /limit.*1.*10000/i],
  ])('rejects invalid, unsupported, or duplicate filters before network: %j', async (overrides, expected) => {
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await command(overrides).handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(expected)
  })

  it('uses the attested opaque dev runtime route without mixing in the production target', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: DEV_RUNTIME_BOT_ID,
        devTargetBotId: DEV_TARGET_BOT_ID,
      }),
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

    const result = await command({
      dev: true,
      error: true,
      status: 'error',
    }).handler()

    expect(result.exitCode).toBe(0)
    expect(calls.map((call) => decodeURIComponent(new URL(call.url).pathname))).toEqual([
      `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`,
      '/v1/traces',
    ])
    expect(headers(calls[1]!)).toEqual({
      authorization: 'Bearer pat_secret',
      'x-bot-id': DEV_RUNTIME_BOT_ID,
    })
    expect(Object.fromEntries(new URL(calls[1]!.url).searchParams)).toEqual({
      conversationId: 'conv:1',
      pageSize: '20',
      status: 'error',
      error: 'true',
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
    [400, /filters|rejected/i],
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
      throw new TypeError('socket closed with raw prompt secret')
    })

    const result = await command({ verbose: true }).handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/network|connect|api url|retry/i)
    expect(stdout + stderr).not.toContain('raw prompt secret')
  })

  it.each([
    [{ traces: 'wrong', meta: {} }, /malformed.*traces/i],
    [{ traces: [], meta: { nextToken: 123 } }, /malformed.*nextToken/i],
    [{ traces: [{ ...trace(), durationMs: '125' }], meta: {} }, /durationMs.*malformed/i],
    [
      {
        traces: [trace({ metadata: { errorMessage: 'я'.repeat(4_097) } })],
        meta: {},
      },
      /metadata\.errorMessage.*malformed/i,
    ],
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
        : json({ traces: [trace({ id: '1' })], meta: { nextToken: '1' } }),
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

  it('never exceeds the backend pageSize maximum when the client-side limit is larger', async () => {
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await command({ limit: 1_500 }).handler()

    expect(result.exitCode).toBe(0)
    expect(new URL(calls[0]!.url).searchParams.get('pageSize')).toBe('1000')
  })

  it('prints a readable trace line in human mode', async () => {
    stubFetch(async () =>
      json({
        traces: [
          trace({
            status: 'error',
            metadata: {
              aiModel: 'openai:gpt-5',
              workflowName: 'answer',
              errorKind: 'internal',
              errorName: 'TypeError',
              errorCode: 'BLOC_ITEM_INVALID',
              errorMessage: "Cannot read properties of undefined (reading 'imageUrl')",
              errorStack:
                'TypeError: invalid bloc item\n    at Chat.transformMessage (src/runtime/chat/chat.ts:381:52)',
            },
          }),
        ],
        meta: {},
      }),
    )

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).toMatch(/2026-07-10T10:00:00\.000Z.*ERROR.*125ms.*handler\.conversation/i)
    expect(stdout).toContain('model=openai:gpt-5')
    expect(stdout).toContain('workflow=answer')
    expect(stdout).toContain('BLOC_ITEM_INVALID')
    expect(stdout).toContain("Cannot read properties of undefined (reading 'imageUrl')")
    expect(stdout).not.toContain('chat.ts:381')

    stdout = ''
    const verboseResult = await command({ verbose: true }).handler()
    expect(verboseResult.exitCode).toBe(0)
    expect(stdout).toContain('chat.ts:381')
  })

  it('preserves non-LLM trace content in JSON output', async () => {
    const complete = trace({
      conversationId: 'conv:1',
      userId: 'user:1',
      messageId: 'message:1',
      attributes: {
        prompt: 'raw prompt',
        modelResponse: 'raw response',
        'autonomous.tool.input': { password: 'tool secret' },
        'autonomous.tool.output': { document: 'document secret' },
        error: 'raw error',
      },
      payload: { state: { arbitrary: { secret: true } } },
      metadata: {
        aiModel: 'openai:gpt-5',
        aiInputTokens: 10,
        workflowName: 'answer',
      },
    })
    stubFetch(async () => json({ traces: [complete], meta: {} }))

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
      traces: [complete],
      nextToken: null,
    })
    expect(stdout).toMatch(/raw prompt|raw response|tool secret|document secret|raw error|arbitrary/i)
  })

  it('hides LLM request and response content by default without changing stored tool payloads', async () => {
    const cognitive = trace({
      name: 'cognitive.request',
      attributes: {
        'ai.model': 'openai:gpt-5',
        'ai.instructions': 'system prompt',
        'ai.messages': [{ role: 'user', content: 'customer question' }],
        'ai.tools': [{ name: 'lookup' }],
        'ai.response': { text: 'model answer' },
      },
      payload: {
        request: { messages: [{ role: 'user', content: 'customer question' }] },
        response: { text: 'model answer' },
      },
    })
    const tool = trace({
      name: 'autonomous.tool',
      attributes: { 'autonomous.tool.name': 'lookup' },
      payload: { input: { id: 42 }, output: { found: true } },
    })
    stubFetch(async () => json({ traces: [cognitive, tool], meta: {} }))

    const result = await command({ json: true }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(output.traces[0].attributes).toEqual({ 'ai.model': 'openai:gpt-5' })
    expect(output.traces[0].payload).toEqual({})
    expect(output.traces[1].payload).toEqual({ input: { id: 42 }, output: { found: true } })
    expect(stdout).not.toMatch(/system prompt|customer question|model answer/)
  })

  it('shows canonical LLM request and response content with --include-llm', async () => {
    const cognitive = trace({
      name: 'cognitive.request',
      attributes: {
        'ai.instructions': 'system prompt',
        'ai.messages': [{ role: 'user', content: 'customer question' }],
        'ai.response': { text: 'model answer' },
      },
      payload: {
        request: { messages: [{ role: 'user', content: 'customer question' }] },
        response: { text: 'model answer' },
      },
    })
    stubFetch(async () => json({ traces: [cognitive], meta: {} }))

    const result = await command({ includeLlm: true, json: true }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(output.traces).toEqual([cognitive])
    expect(stdout).toMatch(/system prompt|customer question|model answer/)
  })

  it('prints canonical LLM request and response in human mode only with --include-llm', async () => {
    const cognitive = trace({
      name: 'cognitive.request',
      attributes: {
        'ai.instructions': 'system prompt',
        'ai.messages': 'serialized message preview',
        'ai.tools': 'serialized tool preview',
        'ai.response': 'serialized response preview',
      },
      payload: {
        request: { messages: [{ role: 'user', content: 'customer question' }], tools: [{ name: 'lookup' }] },
        response: { text: 'model answer' },
      },
    })
    stubFetch(async () => json({ traces: [cognitive], meta: {} }))

    expect((await command().handler()).exitCode).toBe(0)
    expect(stdout).not.toMatch(/system prompt|customer question|model answer/)

    stdout = ''
    expect((await command({ includeLlm: true }).handler()).exitCode).toBe(0)
    expect(stdout).toMatch(/instructions:.*system prompt/)
    expect(stdout).toMatch(/messages:.*customer question/)
    expect(stdout).toMatch(/tools:.*lookup/)
    expect(stdout).toMatch(/response:.*model answer/)
    expect(stdout).not.toMatch(/serialized (message|tool|response) preview/)
  })

  it('prints tool input and output in human mode', async () => {
    stubFetch(async () =>
      json({
        traces: [
          trace({
            name: 'autonomous.tool',
            attributes: {
              'autonomous.tool.input': '{"query":"escaped preview"}',
              'autonomous.tool.output': '{"id":"escaped-preview"}',
            },
            payload: {
              input: { query: 'customer order' },
              output: { id: 'order-42' },
            },
          }),
        ],
        meta: {},
      }),
    )

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).toContain('input: {"query":"customer order"}')
    expect(stdout).toContain('output: {"id":"order-42"}')
    expect(stdout).not.toContain('escaped preview')
    expect(stdout).not.toContain('escaped-preview')
  })

  function command(overrides: Record<string, unknown> = {}): TracesCommand {
    const argv = {
      apiUrl: undefined,
      botId: undefined,
      botpressHome,
      confirm: false,
      conversationId: 'conv:1',
      dev: false,
      error: undefined,
      includeLlm: false,
      json: false,
      limit: 20,
      local: false,
      nextToken: undefined,
      profile: 'default',
      tokens: [],
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
