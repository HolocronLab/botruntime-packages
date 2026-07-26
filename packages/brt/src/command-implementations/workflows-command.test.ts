import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import commandDefinitions from '../command-definitions'
import { buildBrtDocsContract } from '../docs-contract'
import { Logger } from '../logger'
import {
  WorkflowsListCommand,
  WorkflowsRunCommand,
  WorkflowsShowCommand,
  WorkflowsWaitCommand,
} from './workflows-command'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '42'
const PROD_BOT_ID = '7'
const DEV_RUNTIME_BOT_ID = 'dev_runtime:7'
const DEV_TARGET_BOT_ID = '8'

type FetchCall = { url: string; init: RequestInit }

const workflow = (overrides: Record<string, unknown> = {}) => ({
  id: 'wkflow_0123456789abcdef01234567',
  name: 'collectDocuments',
  status: 'completed',
  input: { privateInput: 'customer secret' },
  output: { privateOutput: 'model secret' },
  tags: { privateTag: 'private tag value' },
  createdAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-07-26T10:00:01.000Z',
  completedAt: '2026-07-26T10:00:01.000Z',
  failureReason: 'raw stack and customer secret',
  ...overrides,
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('brt workflows public contract', () => {
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string
  let stderr: string
  let originalFetch: typeof fetch

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-workflow-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-workflow-project-'))
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
    fs.writeFileSync(
      path.join(botpressHome, 'bots.json'),
      JSON.stringify({ default: { [PROD_BOT_ID]: { apiKey: 'bot_key' } } })
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
    vi.useRealTimers()
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('registers run/list/show/wait as generated public CLI leaves', () => {
    expect(commandDefinitions.workflows.subcommands).toMatchObject({
      run: {
        schema: {
          name: { positional: true, demandOption: true },
          inputFile: { type: 'string' },
          wait: { type: 'boolean', default: true },
          idempotencyKey: { type: 'string' },
        },
      },
      list: {
        schema: {
          status: { type: 'string', array: true },
          limit: { type: 'number', default: 20 },
          nextToken: { type: 'string' },
        },
      },
      show: { schema: { workflowId: { positional: true, demandOption: true } } },
      wait: { schema: { workflowId: { positional: true, demandOption: true } } },
    })
    const paths = buildBrtDocsContract(commandDefinitions).commands.map((item) => item.path)
    expect(paths).toEqual(expect.arrayContaining([
      'workflows run',
      'workflows list',
      'workflows show',
      'workflows wait',
    ]))
  })

  it('starts production workflows idempotently with the bot key and keeps arbitrary data private', async () => {
    stubFetch(async (_url, _index, init) => {
      const body = JSON.parse(String(init.body))
      return json({
        workflow: workflow({ status: 'pending', completedAt: undefined, tags: body.tags }),
        meta: { created: true },
      })
    })

    const response = await runCommand({
      json: true,
      wait: false,
      idempotencyKey: 'retry-key-1',
      timeout: 30_000,
    }).handler()

    expect(response.exitCode, stderr).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(`${API_URL}/v1/chat/workflows/get-or-create`)
    expect(calls[0]!.init.headers).toMatchObject({
      authorization: 'Bearer bot_key',
    })
    const body = JSON.parse(String(calls[0]!.init.body))
    expect(body).toMatchObject({
      name: 'collectDocuments',
      status: 'pending',
      tags: { 'brt.idempotencyKey': 'retry-key-1' },
      discriminateByTags: ['brt.idempotencyKey'],
    })
    expect(body.tags['brt.requestHash']).toMatch(/^sha256:[0-9a-f]{64}$/)
    expect(body).not.toHaveProperty('timeoutAt')
    const output = JSON.parse(stdout)
    expect(output).toMatchObject({
      schemaVersion: 1,
      idempotencyKey: 'retry-key-1',
      created: true,
      observation: {
        status: 'not_requested',
        durableWorkflowContinues: true,
      },
      workflow: {
        id: 'wkflow_0123456789abcdef01234567',
        status: 'pending',
      },
    })
    expect(stdout + stderr).not.toMatch(/customer secret|model secret|private tag|raw stack/)
  })

  it('keeps the durable execution deadline distinct from the CLI observation window', async () => {
    stubFetch(async (_url, _index, init) => {
      const body = JSON.parse(String(init.body))
      return json({
        workflow: workflow({ status: 'pending', completedAt: undefined, tags: body.tags }),
        meta: { created: true },
      })
    })

    const before = Date.now()
    await runCommand({
      wait: false,
      timeout: 1_000,
      workflowTimeout: 60_000,
      idempotencyKey: 'deadline-key',
    }).handler()

    const body = JSON.parse(String(calls[0]!.init.body))
    expect(Date.parse(body.timeoutAt)).toBeGreaterThanOrEqual(before + 59_000)
    expect(Date.parse(body.timeoutAt)).toBeLessThanOrEqual(Date.now() + 60_000)
  })

  it('does not reuse the observation timeout as the create request deadline', async () => {
    vi.useFakeTimers()
    stubFetch(async (_url, _index, init) => {
      const body = JSON.parse(String(init.body))
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      return json({
        workflow: workflow({ status: 'pending', completedAt: undefined, tags: body.tags }),
        meta: { created: true },
      })
    })

    const pending = runCommand({
      json: true,
      wait: false,
      timeout: 1_000,
      idempotencyKey: 'create-deadline-key',
    }).handler()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(1_500)
    const response = await pending

    expect(response.exitCode, stderr).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      observation: {
        status: 'not_requested',
        durableWorkflowContinues: true,
      },
    })
  })

  it('fails closed when an idempotency key resolves to a different request fingerprint', async () => {
    stubFetch(async () =>
      json({
        workflow: workflow({
          status: 'pending',
          completedAt: undefined,
          tags: {
            'brt.idempotencyKey': 'shared-key',
            'brt.requestHash': `sha256:${'0'.repeat(64)}`,
          },
        }),
        meta: { created: false },
      })
    )

    const response = await runCommand({
      json: true,
      wait: false,
      idempotencyKey: 'shared-key',
    }).handler()

    expect(response.exitCode).toBe(1)
    expect(stderr).toMatch(/idempotency key.*different request/i)
    expect(stdout).toBe('')
    expect(calls).toHaveLength(1)
  })

  it('uses the attested opaque development target and repeated status filters', async () => {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: DEV_RUNTIME_BOT_ID,
        devTargetBotId: DEV_TARGET_BOT_ID,
      })
    )
    stubFetch(async (url) => {
      if (url.endsWith(`/v1/admin/bots/${encodeURIComponent(DEV_RUNTIME_BOT_ID)}`)) {
        return json({
          bot: {
            id: DEV_RUNTIME_BOT_ID,
            dev: true,
            tags: { 'botruntime.devTargetBotId': DEV_TARGET_BOT_ID },
            integrations: {},
          },
        })
      }
      return json({
        workflows: [workflow({ status: 'listening' })],
        meta: { nextToken: '123' },
      })
    })

    const response = await listCommand({
      dev: true,
      json: true,
      status: ['pending', 'listening'],
      limit: 20,
    }).handler()

    expect(response.exitCode, stderr).toBe(0)
    expect(calls).toHaveLength(2)
    const listCall = calls[1]!
    expect(listCall.url).toContain('/v1/chat/workflows?')
    const url = new URL(listCall.url)
    expect(url.searchParams.getAll('statuses')).toEqual(['pending', 'listening'])
    expect(url.searchParams.get('pageSize')).toBe('20')
    expect(listCall.init.headers).toMatchObject({
      authorization: 'Bearer pat_secret',
      'x-bot-id': DEV_RUNTIME_BOT_ID,
    })
    expect(JSON.parse(stdout)).toMatchObject({
      target: {
        environment: 'development',
        runtimeBotId: DEV_RUNTIME_BOT_ID,
        targetBotId: DEV_TARGET_BOT_ID,
      },
      nextToken: '123',
    })
    expect(stdout).not.toMatch(/customer secret|model secret|private tag/)
  })

  it('rejects cursors outside the signed 64-bit server range before making a request', async () => {
    stubFetch(async () => json({ workflows: [], meta: {} }))

    const response = await listCommand({
      json: true,
      nextToken: '9223372036854775808',
    }).handler()

    expect(response.exitCode).toBe(1)
    expect(stderr).toMatch(/positive decimal cursor/)
    expect(calls).toHaveLength(0)
  })

  it('projects inline steps without step outputs or raw error text', async () => {
    stubFetch(async (url) => {
      if (url.includes('/workflowSteps')) {
        return json({
          state: {
            payload: {
              location: { type: 'state' },
              value: {
                executionCount: 2,
                revision: 5,
                steps: {
                  collect: {
                    output: { passport: 'secret bytes' },
                    attempts: 2,
                    startedAt: '2026-07-26T10:00:00.000Z',
                    error: {
                      name: 'HTTPError',
                      message: 'provider body with customer secret',
                      stack: 'private stack',
                      failedAt: '2026-07-26T10:00:01.000Z',
                      maxAttemptsReached: true,
                      operation: 'POST /v1/files',
                      status: 503,
                      kind: 'upstream',
                    },
                  },
                },
              },
            },
          },
          meta: { cached: false },
        })
      }
      return json({ workflow: workflow({ status: 'failed' }) })
    })

    const response = await showCommand({ json: true, steps: true }).handler()

    expect(response.exitCode).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      workflow: {
        failure: { code: 'WORKFLOW_FAILED' },
      },
      steps: {
        available: true,
        storage: 'state',
        executionCount: 2,
        revision: 5,
        steps: [{
          name: 'collect',
          attempts: 2,
          error: {
            name: 'HTTPError',
            status: 503,
            kind: 'upstream',
            maxAttemptsReached: true,
          },
        }],
      },
    })
    expect(stdout + stderr).not.toMatch(/secret bytes|provider body|private stack|raw stack/)
  })

  it('does not download large swapped step state through the CLI', async () => {
    stubFetch(async (url) => {
      if (url.includes('/workflowSteps')) {
        return json({
          state: {
            payload: {
              location: { type: 'file', key: 'file_private_storage_key' },
            },
          },
        })
      }
      return json({ workflow: workflow() })
    })

    const response = await showCommand({ json: true, steps: true }).handler()

    expect(response.exitCode).toBe(0)
    expect(JSON.parse(stdout).steps).toEqual({
      available: false,
      storage: 'file',
      reason: 'server_projection_required',
    })
    expect(stdout).not.toContain('file_private_storage_key')
    expect(calls).toHaveLength(2)
  })

  it('reports a terminal failed workflow through wait without exposing raw failure data', async () => {
    stubFetch(async () => json({ workflow: workflow({ status: 'failed' }) }))

    const response = await waitCommand({ json: true }).handler()

    expect(response.exitCode).toBe(1)
    expect(calls).toHaveLength(1)
    expect(JSON.parse(stdout)).toMatchObject({
      observation: {
        status: 'terminal',
        durableWorkflowContinues: false,
      },
      workflow: {
        status: 'failed',
        failure: { code: 'WORKFLOW_FAILED' },
      },
    })
    expect(stdout + stderr).not.toMatch(/customer secret|model secret|private tag|raw stack/)
  })

  it('ends only the observation window and leaves a non-terminal durable workflow running', async () => {
    vi.useFakeTimers()
    stubFetch(async () =>
      json({
        workflow: workflow({
          status: 'listening',
          completedAt: undefined,
        }),
      })
    )

    const pending = waitCommand({ json: true, timeout: 1_000 }).handler()
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    await vi.advanceTimersByTimeAsync(1_000)
    const response = await pending

    expect(response.exitCode).toBe(2)
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(JSON.parse(stdout)).toMatchObject({
      observation: {
        status: 'deadline_reached',
        durableWorkflowContinues: true,
      },
      workflow: { status: 'listening' },
    })
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

  function runCommand(overrides: Record<string, unknown> = {}): WorkflowsRunCommand {
    const argv = baseArgv({
      conversationId: undefined,
      idempotencyKey: undefined,
      includeData: false,
      inputFile: undefined,
      name: 'collectDocuments',
      parentWorkflowId: undefined,
      timeout: 300_000,
      userId: undefined,
      wait: true,
      workflowTimeout: undefined,
      ...overrides,
    })
    return new WorkflowsRunCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function listCommand(overrides: Record<string, unknown> = {}): WorkflowsListCommand {
    const argv = baseArgv({
      conversationId: undefined,
      limit: 20,
      name: undefined,
      nextToken: undefined,
      parentWorkflowId: undefined,
      status: undefined,
      userId: undefined,
      ...overrides,
    })
    return new WorkflowsListCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function showCommand(overrides: Record<string, unknown> = {}): WorkflowsShowCommand {
    const argv = baseArgv({
      includeData: false,
      steps: false,
      workflowId: 'wkflow_0123456789abcdef01234567',
      ...overrides,
    })
    return new WorkflowsShowCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function waitCommand(overrides: Record<string, unknown> = {}): WorkflowsWaitCommand {
    const argv = baseArgv({
      includeData: false,
      steps: false,
      timeout: 300_000,
      workflowId: 'wkflow_0123456789abcdef01234567',
      ...overrides,
    })
    return new WorkflowsWaitCommand({} as any, {} as any, new Logger(argv as any), argv as any)
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
