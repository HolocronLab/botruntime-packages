import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import commandDefinitions from '../command-definitions'
import { buildBrtDocsContract } from '../docs-contract'
import { Logger } from '../logger'
import { ListConversationsCommand, ShowConversationCommand } from './conversations-command'


const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '42'
const PROD_BOT_ID = '7'
const DEV_RUNTIME_BOT_ID = 'dev_runtime:7'
const DEV_TARGET_BOT_ID = '8'

type FetchCall = { url: string; init: RequestInit }

const conversation = (overrides: Record<string, unknown> = {}) => ({
  id: 'conv_-100/42',
  createdAt: '2026-07-10T09:00:00.000Z',
  updatedAt: '2026-07-10T10:00:00.000Z',
  channel: 'telegram.group',
  integration: 'telegram',
  tags: { id: '-100/42', title: 'Private customer title' },
  messageCount: 12,
  ...overrides,
})

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
  metadata: { integration: 'telegram', channel: 'telegram.group' },
  ...overrides,
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('brt conversations public contract', () => {
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string
  let stderr: string
  let originalFetch: typeof fetch

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-conversations-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-conversations-project-'))
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

  it('has real list/show leaves and generated docs-contract entries', () => {
    expect(commandDefinitions.conversations).toEqual(
      expect.objectContaining({
        description: expect.stringMatching(/conversation/i),
        subcommands: expect.objectContaining({
          list: expect.objectContaining({
            schema: expect.objectContaining({
              tokens: expect.objectContaining({
                positional: true,
                array: true,
              }),
              dev: expect.objectContaining({ type: 'boolean' }),
              limit: expect.objectContaining({ type: 'number' }),
              nextToken: expect.objectContaining({ type: 'string' }),
              since: expect.objectContaining({ type: 'string' }),
            }),
          }),
          show: expect.objectContaining({
            schema: expect.objectContaining({
              conversationId: expect.objectContaining({
                positional: true,
                demandOption: true,
              }),
              dev: expect.objectContaining({ type: 'boolean' }),
            }),
          }),
        }),
      })
    )
    const paths = buildBrtDocsContract(commandDefinitions).commands.map((entry) => entry.path)
    expect(paths).toContain('conversations list')
    expect(paths).toContain('conversations show')
  })

  it('uses the canonical production workspace/bot route and PAT authority', async () => {
    stubFetch(async () => json({ conversations: [conversation()], meta: {} }))

    const result = await listCommand().handler()

    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(`${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${PROD_BOT_ID}/conversations?pageSize=20`)
    expect(headers(calls[0]!)).toEqual({ authorization: 'Bearer pat_secret' })
  })

  it('uses the attested opaque dev route without mixing in production identity', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: DEV_RUNTIME_BOT_ID,
        devTargetBotId: DEV_TARGET_BOT_ID,
      })
    )
    stubFetch(async (url) => {
      const pathname = decodeURIComponent(new URL(url).pathname)
      if (pathname === `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`) {
        return json({
          bot: {
            id: DEV_RUNTIME_BOT_ID,
            dev: true,
            tags: { 'botruntime.devTargetBotId': DEV_TARGET_BOT_ID },
          },
        })
      }
      return json({ conversations: [conversation()], meta: {} })
    })

    const result = await listCommand({ dev: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(calls.map((call) => decodeURIComponent(new URL(call.url).pathname))).toEqual([`/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`, '/v1/chat/conversations'])
    expect(headers(calls[1]!)).toEqual({
      authorization: 'Bearer pat_secret',
      'x-bot-id': DEV_RUNTIME_BOT_ID,
    })
    expect(new URL(calls[1]!.url).searchParams.get('pageSize')).toBe('20')
    expect(calls[1]!.url).not.toContain(`${PROD_BOT_ID}/conversations`)
  })

  it('fails before network when the canonical production link is absent', async () => {
    fs.rmSync(path.join(workDir, 'agent.json'))
    stubFetch(async () => json({ conversations: [], meta: {} }))

    const result = await listCommand().handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(/agent\.json.*brt link/i)
  })

  it.each([
    [{ botId: 'dev_opaque', workspaceId: WORKSPACE_ID, apiUrl: API_URL }, /botId.*positive decimal/i],
    [{ botId: PROD_BOT_ID, workspaceId: 'default', apiUrl: API_URL }, /workspaceId.*positive decimal/i],
    [
      {
        botId: PROD_BOT_ID,
        workspaceId: WORKSPACE_ID,
        apiUrl: 'https://poison.example',
      },
      /agent\.json.*profile/i,
    ],
  ])('rejects malformed or poisoned production identity before network: %j', async (identity, expected) => {
    fs.writeFileSync(path.join(workDir, 'agent.json'), JSON.stringify(identity))
    stubFetch(async () => json({ conversations: [], meta: {} }))

    const result = await listCommand().handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(expected)
  })

  it.each([
    [400, /request.*rejected|pagination/i],
    [401, /brt login|profile/i],
    [403, /access|permission|member/i],
    [404, /link|target/i],
    [500, /retry|server/i],
  ])('returns exit code 1 with remediation for HTTP %s without leaking the body', async (status, expected) => {
    stubFetch(async () => json({ error: 'raw transcript and customer secret' }, status))

    const result = await listCommand().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(expected)
    expect(stdout + stderr).not.toContain('raw transcript and customer secret')
  })

  it('returns exit code 1 with network remediation and no raw transport error', async () => {
    stubFetch(async () => {
      throw new TypeError('raw socket error containing customer secret')
    })

    const result = await listCommand({ verbose: true }).handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/network|connect|api url|retry/i)
    expect(stdout + stderr).not.toContain('customer secret')
  })

  it.each([
    [{ conversations: 'wrong', meta: {} }, /malformed.*conversations/i],
    [{ conversations: [], meta: { nextToken: 123 } }, /malformed.*nextToken/i],
    [{ conversations: [conversation({ messageCount: '12' })], meta: {} }, /messageCount.*malformed/i],
    [{ conversations: [conversation({ updatedAt: 'not-a-date' })], meta: {} }, /updatedAt.*malformed/i],
  ])('fails loudly on malformed backend response: %j', async (body, expected) => {
    stubFetch(async () => json(body))

    const result = await listCommand().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(expected)
  })

  it('fails on malformed JSON without reflecting raw response content', async () => {
    stubFetch(async () => new Response('{"transcript":"customer secret"', { status: 200 }))

    const result = await listCommand().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/malformed JSON/i)
    expect(stdout + stderr).not.toContain('customer secret')
  })

  it.each([
    [{ limit: 0 }, /limit.*1.*10000/i],
    [{ limit: 10_001 }, /limit.*1.*10000/i],
    [{ limit: 1.5 }, /limit.*integer/i],
    [{ nextToken: '0' }, /next-token.*positive decimal/i],
    [{ nextToken: 'cursor' }, /next-token.*positive decimal/i],
  ])('rejects invalid pagination before network: %j', async (overrides, expected) => {
    stubFetch(async () => json({ conversations: [], meta: {} }))

    const result = await listCommand(overrides).handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(expected)
  })

  it('paginates only up to limit and returns the resumable cursor', async () => {
    stubFetch(async (_url, index) =>
      index === 0
        ? json({
            conversations: [conversation({ id: 'conv_3' }), conversation({ id: 'conv_2' })],
            meta: { nextToken: '2' },
          })
        : json({
            conversations: [conversation({ id: 'conv_1' })],
            meta: { nextToken: '1' },
          })
    )

    const result = await listCommand({ json: true, limit: 3 }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(2)
    expect(new URL(calls[0]!.url).searchParams.get('pageSize')).toBe('3')
    expect(new URL(calls[1]!.url).searchParams.get('pageSize')).toBe('1')
    expect(new URL(calls[1]!.url).searchParams.get('nextToken')).toBe('2')
    expect(output.conversations).toHaveLength(3)
    expect(output.nextToken).toBe('1')
  })

  it('caps each backend page at 1000 rows', async () => {
    stubFetch(async () => json({ conversations: [], meta: {} }))

    const result = await listCommand({ limit: 1_500 }).handler()

    expect(result.exitCode).toBe(0)
    expect(new URL(calls[0]!.url).searchParams.get('pageSize')).toBe('1000')
  })

  it('fails on a pagination cursor loop', async () => {
    stubFetch(async () => json({ conversations: [conversation()], meta: { nextToken: '2' } }))

    const result = await listCommand({ limit: 3 }).handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/cursor loop/i)
  })

  it('prints readable metadata-only human output', async () => {
    stubFetch(async () => json({ conversations: [conversation()], meta: {} }))

    const result = await listCommand().handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).toMatch(/2026-07-10T10:00:00\.000Z.*conv_-100\/42.*telegram\.group.*messages=12/i)
    expect(stdout + stderr).not.toContain('Private customer title')
  })

  it('prints a stable JSON envelope with only the conversation allowlist', async () => {
    const unsafe = conversation({
      transcript: 'raw transcript',
      messages: [{ payload: { text: 'customer secret' } }],
      content: 'raw content',
      rawError: 'raw error',
    })
    stubFetch(async () => json({ conversations: [unsafe], meta: {}, internal: 'server secret' }))

    const result = await listCommand({ json: true }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(output).toEqual({
      schemaVersion: 1,
      target: {
        environment: 'production',
        workspaceId: WORKSPACE_ID,
        botId: PROD_BOT_ID,
      },
      conversations: [
        {
          id: 'conv_-100/42',
          createdAt: '2026-07-10T09:00:00.000Z',
          updatedAt: '2026-07-10T10:00:00.000Z',
          channel: 'telegram.group',
          integration: 'telegram',
          messageCount: 12,
        },
      ],
      nextToken: null,
    })
    expect(stdout + stderr).not.toMatch(/Private customer title|raw transcript|customer secret|raw content|raw error|server secret/i)
  })

  it('accepts Botpress list tokens and applies since without exposing conversation tags', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-07-10T10:00:00.000Z'))
    stubFetch(async () =>
      json({
        conversations: [
          conversation({
            id: 'conv_recent',
            updatedAt: '2026-07-10T09:30:00.000Z',
          }),
          conversation({
            id: 'conv_old',
            updatedAt: '2026-07-10T08:30:00.000Z',
          }),
        ],
        meta: {},
      })
    )

    const result = await listCommand({
      json: true,
      limit: undefined,
      since: undefined,
      tokens: ['limit=5', 'since=1h'],
    }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(output.conversations.map((entry: { id: string }) => entry.id)).toEqual(['conv_recent'])
    expect(stdout + stderr).not.toContain('Private customer title')
  })

  it.each([
    [{ tokens: ['include-llm'] }, /include-llm.*privacy/i],
    [{ tokens: ['limit=2'], limit: 2 }, /limit.*more than once|conflict/i],
    [{ tokens: ['since=yesterday'] }, /since.*duration/i],
    [{ since: '2026-02-31T10:00:00Z' }, /since.*RFC3339/i],
  ])('rejects unsafe, duplicate, or malformed list tokens before network: %j', async (overrides, expected) => {
    stubFetch(async () => json({ conversations: [], meta: {} }))

    const result = await listCommand(overrides).handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(expected)
  })

  it('shows a production metadata-only timeline through the trace endpoint', async () => {
    const unsafe = trace({
      rawError: 'raw stack customer secret',
      data: { prompt: 'raw prompt', response: 'raw model response' },
      metadata: {
        autonomousToolName: 'lookup-order',
        autonomousToolStatus: 'success',
        errorKind: 'upstream',
        rawToolInput: 'secret tool input',
      },
    })
    stubFetch(async () => json({ traces: [unsafe], meta: {} }))

    const result = await showCommand({ json: true }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(calls[0]!.url).toBe(`${API_URL}/v1/admin/workspaces/${WORKSPACE_ID}/bots/${PROD_BOT_ID}/traces?conversationId=conv%3A1&pageSize=1000`)
    expect(output).toEqual({
      schemaVersion: 1,
      target: {
        environment: 'production',
        workspaceId: WORKSPACE_ID,
        botId: PROD_BOT_ID,
      },
      conversationId: 'conv:1',
      turnCount: 1,
      turns: [
        {
          traceId: '0123456789abcdef0123456789abcdef',
          startedAt: '2026-07-10T10:00:00.000Z',
          durationMs: 125,
          status: 'error',
          trigger: 'handler.conversation',
          tools: [],
          errorKinds: ['upstream'],
        },
      ],
    })
    expect(stdout + stderr).not.toMatch(/raw stack|customer secret|raw prompt|raw model|secret tool input/i)
  })

  it('shows an attested dev timeline without using a production route', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: DEV_RUNTIME_BOT_ID,
        devTargetBotId: DEV_TARGET_BOT_ID,
      })
    )
    stubFetch(async (url) => {
      const pathname = decodeURIComponent(new URL(url).pathname)
      if (pathname === `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`) {
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

    const result = await showCommand({ dev: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(calls.map((call) => decodeURIComponent(new URL(call.url).pathname))).toEqual([`/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`, '/v1/traces'])
    expect(headers(calls[1]!)).toEqual({
      authorization: 'Bearer pat_secret',
      'x-bot-id': DEV_RUNTIME_BOT_ID,
    })
  })

  it('maps typed autonomous tools and effective errors without raw tool content', async () => {
    stubFetch(async () =>
      json({
        traces: [
          trace(),
          trace({
            id: '102',
            name: 'autonomous.tool',
            spanId: 'fedcba9876543210',
            parentSpanId: '0123456789abcdef',
            durationMs: 50,
            metadata: {
              autonomousToolName: 'lookup-order',
              autonomousToolStatus: 'error',
              errorKind: 'timeout',
              rawToolOutput: 'customer secret',
            },
          }),
        ],
        meta: {},
      })
    )

    const result = await showCommand({ json: true }).handler()
    const output = JSON.parse(stdout)

    expect(result.exitCode).toBe(0)
    expect(output.turns[0]).toEqual(
      expect.objectContaining({
        status: 'error',
        tools: [{ name: 'lookup-order', status: 'error', durationMs: 50, errorKind: 'timeout' }],
        errorKinds: ['timeout'],
      })
    )
    expect(stdout + stderr).not.toContain('customer secret')
  })

  it('prints a readable metadata-only show timeline', async () => {
    stubFetch(async () => json({ traces: [trace()], meta: {} }))

    const result = await showCommand().handler()

    expect(result.exitCode).toBe(0)
    expect(stdout).toMatch(/Conversation conv:1.*1 turn/i)
    expect(stdout).toMatch(/2026-07-10T10:00:00\.000Z.*OK.*handler\.conversation/i)
  })

  it('fails before network for a malformed show identity', async () => {
    stubFetch(async () => json({ traces: [], meta: {} }))

    const result = await showCommand({
      conversationId: 'customer secret\nraw',
    }).handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(/conversation.*1-256/i)
    expect(stderr).not.toContain('customer secret')
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
      ...overrides,
    }
  }

  function listCommand(overrides: Record<string, unknown> = {}): ListConversationsCommand {
    const argv = {
      ...baseArgv({}),
      limit: 20,
      nextToken: undefined,
      since: undefined,
      tokens: [],
      ...overrides,
    }
    return new ListConversationsCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function showCommand(overrides: Record<string, unknown> = {}): ShowConversationCommand {
    const argv = baseArgv({ conversationId: 'conv:1', ...overrides })
    return new ShowConversationCommand({} as any, {} as any, new Logger(argv as any), argv as any)
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
