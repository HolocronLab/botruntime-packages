import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import commandDefinitions from '../command-definitions'
import { buildBrtDocsContract } from '../docs-contract'
import { Logger } from '../logger'
import { EvalRunCommand, EvalRunsCommand } from './eval-command'

const prepareHostedEvalManifest = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ manifestFileId: 'manifest_1', evals: 1, fixtures: 0 })
)
vi.mock('../eval-manifest-prepare', () => ({ prepareHostedEvalManifest }))

vi.mock('../public-package-version', () => ({
  fetchLatestPublicVersion: vi.fn(async () => '0.6.10'),
  publicRegistryUrl: vi.fn(() => 'https://registry.npmjs.org'),
}))

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '42'
const PROD_BOT_ID = '7'
const DEV_RUNTIME_BOT_ID = 'dev_runtime:7'
const DEV_TARGET_BOT_ID = '8'

type FetchCall = { url: string; init: RequestInit }

const run = (overrides: Record<string, unknown> = {}) => ({
  id: '101',
  botId: PROD_BOT_ID,
  workspaceId: WORKSPACE_ID,
  evalManifestId: 'manifest_1',
  workflowId: 'workflow_1',
  status: 'completed',
  triggerType: 'manual',
  startedAt: '2026-07-10T10:00:00.000Z',
  completedAt: '2026-07-10T10:00:01.000Z',
  createdAt: '2026-07-10T10:00:00.000Z',
  updatedAt: '2026-07-10T10:00:01.000Z',
  expiresAt: '2026-08-09T10:00:00.000Z',
  aborted: false,
  errorKind: null,
  ...overrides,
})

const result = (overrides: Record<string, unknown> = {}) => ({
  id: '301',
  evalEntryId: '201',
  turnIndex: 0,
  resultIndex: 0,
  assertionKind: 'response_contains',
  graderName: 'response_contains',
  passed: true,
  skipped: false,
  score: null,
  evidence: { prompt: 'raw prompt', response: 'raw model response' },
  userMessage: 'customer secret question',
  botResponse: 'customer secret answer',
  botDurationMs: 100,
  graderDurationMs: 5,
  createdAt: '2026-07-10T10:00:01.000Z',
  ...overrides,
})

const entry = (overrides: Record<string, unknown> = {}) => ({
  id: '201',
  evalRunId: '101',
  evalName: 'greeting',
  evalType: 'regression',
  description: 'private scenario description',
  tags: ['smoke'],
  passed: true,
  durationMs: 1_000,
  errorKind: null,
  error: 'raw evaluator error with secret',
  createdAt: '2026-07-10T10:00:00.000Z',
  results: [result()],
  ...overrides,
})

const detail = (overrides: Record<string, unknown> = {}) => ({
  ...run(),
  entries: [entry()],
  rawPrompt: 'raw prompt',
  rawResponse: 'raw response',
  ...overrides,
})

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })

describe('brt eval public contract', () => {
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string
  let stderr: string
  let originalFetch: typeof fetch

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-eval-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-eval-project-'))
    calls = []
    stdout = ''
    stderr = ''
    originalFetch = globalThis.fetch
    prepareHostedEvalManifest.mockReset().mockResolvedValue({ manifestFileId: 'manifest_1', evals: 1, fixtures: 0 })

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
    fs.rmSync(botpressHome, { recursive: true, force: true })
    fs.rmSync(workDir, { recursive: true, force: true })
    globalThis.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('has real run/runs leaves and generated docs-contract entries', () => {
    expect(commandDefinitions.eval).toEqual(
      expect.objectContaining({
        description: expect.stringMatching(/eval/i),
        default: expect.objectContaining({
          schema: expect.objectContaining({ name: expect.any(Object) }),
        }),
        subcommands: expect.objectContaining({
          run: expect.objectContaining({
            schema: expect.objectContaining({
              name: expect.objectContaining({ positional: true }),
              tag: expect.objectContaining({ type: 'string' }),
              type: expect.objectContaining({
                choices: ['capability', 'regression'],
              }),
              judgeModel: expect.objectContaining({ type: 'string' }),
              repeat: expect.objectContaining({ type: 'number', default: 1 }),
              maxConcurrency: expect.objectContaining({ type: 'number', default: 1 }),
              minPassRate: expect.objectContaining({ type: 'number', default: 1 }),
              dev: expect.objectContaining({ type: 'boolean' }),
            }),
          }),
          runs: expect.objectContaining({
            schema: expect.objectContaining({
              runId: expect.objectContaining({ positional: true }),
              latest: expect.objectContaining({ type: 'boolean' }),
              limit: expect.objectContaining({ type: 'number' }),
              nextToken: expect.objectContaining({ type: 'string' }),
            }),
          }),
        }),
      })
    )
    const paths = buildBrtDocsContract(commandDefinitions).commands.map((item) => item.path)
    expect(paths).toContain('eval')
    expect(paths).toContain('eval run')
    expect(paths).toContain('eval runs')
  })

  it('uses canonical production identity and the stored per-bot key', async () => {
    stubFetch(async () => json({ runs: [run()], nextToken: 'MTAw' }))

    const response = await runsCommand({ json: true }).handler()

    expect(response.exitCode).toBe(0)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.url).toBe(`${API_URL}/v1/evals/bot/${PROD_BOT_ID}/runs?limit=10`)
    expect(headers(calls[0]!)).toEqual({ authorization: 'Bearer bot_key' })
    expect(JSON.parse(stdout).target).toEqual({
      environment: 'production',
      workspaceId: WORKSPACE_ID,
      botId: PROD_BOT_ID,
    })
  })

  it('uses the attested dev runtime identity with PAT and x-bot-id', async () => {
    writeDevTarget()
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
      return json({ runs: [run({ botId: DEV_RUNTIME_BOT_ID })] })
    })

    const response = await runsCommand({ dev: true, json: true }).handler()

    expect(response.exitCode).toBe(0)
    expect(calls.map((call) => decodeURIComponent(new URL(call.url).pathname))).toEqual([
      `/v1/admin/bots/${DEV_RUNTIME_BOT_ID}`,
      `/v1/evals/bot/${DEV_RUNTIME_BOT_ID}/runs`,
    ])
    expect(headers(calls[1]!)).toEqual({
      authorization: 'Bearer pat_secret',
      'x-bot-id': DEV_RUNTIME_BOT_ID,
    })
    expect(JSON.parse(stdout).target).toEqual({
      environment: 'development',
      workspaceId: WORKSPACE_ID,
      runtimeBotId: DEV_RUNTIME_BOT_ID,
      targetBotId: DEV_TARGET_BOT_ID,
    })
  })

  it('rejects implicit target mixing and missing or poisoned production authority before network', async () => {
    stubFetch(async () => json({ runs: [] }))

    expect((await runsCommand({ local: true }).handler()).exitCode).toBe(1)
    expect(stderr).toMatch(/--local.*--dev/i)
    stderr = ''
    fs.rmSync(path.join(workDir, 'agent.json'))
    expect((await runsCommand().handler()).exitCode).toBe(1)
    expect(stderr).toMatch(/agent\.json.*brt link/i)
    stderr = ''
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({
        botId: 'opaque',
        workspaceId: WORKSPACE_ID,
        apiUrl: API_URL,
      })
    )
    expect((await runsCommand().handler()).exitCode).toBe(1)
    expect(stderr).toMatch(/botId.*positive decimal/i)
    expect(calls).toEqual([])
  })

  it('fails loudly when the production bot was not linked with a per-bot key', async () => {
    fs.rmSync(path.join(botpressHome, 'bots.json'))
    stubFetch(async () => json({ runs: [] }))

    const response = await runsCommand().handler()

    expect(response.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(/per-bot key.*brt link.*key-stdin/i)
  })

  it('rejects a poisoned per-bot credential before network without reflecting it', async () => {
    fs.writeFileSync(
      path.join(botpressHome, 'bots.json'),
      JSON.stringify({
        default: { [PROD_BOT_ID]: { apiKey: 'bot_key\ncustomer_secret' } },
      })
    )
    stubFetch(async () => json({ runs: [] }))

    const response = await runsCommand().handler()

    expect(response.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(/per-bot key.*key-stdin/i)
    expect(stdout + stderr).not.toContain('customer_secret')
  })

  it.each([
    [400, /filters|target|rejected/i],
    [401, /login|per-bot|credential|link/i],
    [403, /access|permission|membership/i],
    [404, /target|link|not found/i],
    [409, /filters|target|rejected/i],
    [500, /retry|server|service/i],
  ])('returns exit code 1 with remediation for HTTP %s without reflecting the body', async (status, expected) => {
    stubFetch(async () => json({ error: 'raw prompt and customer secret' }, status))

    const response = await runsCommand({ verbose: true }).handler()

    expect(response.exitCode).toBe(1)
    expect(stderr).toMatch(expected)
    expect(stdout + stderr).not.toContain('customer secret')
  })

  it('redacts network and malformed JSON failures even in verbose mode', async () => {
    stubFetch(async () => {
      throw new TypeError('raw socket customer secret')
    })
    expect((await runsCommand({ verbose: true }).handler()).exitCode).toBe(1)
    expect(stderr).toMatch(/network|connect|api url|retry/i)
    expect(stdout + stderr).not.toContain('customer secret')

    stdout = ''
    stderr = ''
    stubFetch(async () => new Response('{"rawPrompt":"customer secret"', { status: 200 }))
    expect((await runsCommand({ verbose: true }).handler()).exitCode).toBe(1)
    expect(stderr).toMatch(/malformed JSON/i)
    expect(stdout + stderr).not.toContain('customer secret')
  })

  it.each([
    [{ runs: 'wrong' }, /runs.*malformed/i],
    [{ runs: [], nextToken: 7 }, /nextToken.*malformed/i],
    [{ runs: [run({ status: 'unknown' })] }, /status.*malformed/i],
    [{ runs: [run({ createdAt: 'yesterday' })] }, /createdAt.*malformed/i],
    [{ ...detail(), entries: [entry({ passed: 'yes' })] }, /passed.*malformed/i],
    [
      {
        ...detail(),
        entries: [entry({ results: [result({ assertionKind: 'raw_prompt' })] })],
      },
      /assertionKind.*malformed/i,
    ],
  ])('fails loudly on malformed hosted eval response: %j', async (body, expected) => {
    stubFetch(async () => json(body))
    const command =
      Array.isArray((body as { runs?: unknown }).runs) || 'runs' in (body as object)
        ? runsCommand()
        : runsCommand({ runId: '101' })

    const response = await command.handler()

    expect(response.exitCode).toBe(1)
    expect(stderr).toMatch(expected)
  })

  it.each([
    [{ limit: 0 }, /limit.*1.*100/i],
    [{ limit: 101 }, /limit.*1.*100/i],
    [{ limit: 1.5 }, /limit.*integer/i],
    [{ nextToken: 'not base64!' }, /next-token.*cursor/i],
    [{ latest: true, runId: '101' }, /latest.*run id/i],
    [{ runId: '0' }, /run id.*positive decimal/i],
    [{ status: 'unknown' }, /status.*malformed/i],
  ])('validates pagination and selectors before network: %j', async (overrides, expected) => {
    stubFetch(async () => json({ runs: [] }))

    const response = await runsCommand(overrides).handler()

    expect(response.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(expected)
  })

  it('lists with status, limit and opaque cursor and returns a resumable stable JSON envelope', async () => {
    stubFetch(async () => json({ runs: [run()], nextToken: 'MTAw' }))

    const response = await runsCommand({
      json: true,
      limit: 5,
      nextToken: 'MjAw',
      status: 'completed',
    }).handler()
    const output = JSON.parse(stdout)

    expect(response.exitCode).toBe(0)
    const url = new URL(calls[0]!.url)
    expect(Object.fromEntries(url.searchParams)).toEqual({
      limit: '5',
      status: 'completed',
      nextToken: 'MjAw',
    })
    expect(output).toEqual({
      schemaVersion: 1,
      target: {
        environment: 'production',
        workspaceId: WORKSPACE_ID,
        botId: PROD_BOT_ID,
      },
      runs: [
        expect.objectContaining({
          id: '101',
          status: 'completed',
          triggerType: 'manual',
        }),
      ],
      nextToken: 'MTAw',
    })
    expect(stdout + stderr).not.toMatch(/raw prompt|raw response|customer secret/i)
  })

  it('shows --latest and a run ID through the metadata-only detail projection', async () => {
    stubFetch(async (_url, index) =>
      index === 0
        ? json({ runs: [run()] })
        : json(
            detail({
              entries: [
                entry({
                  durationMs: 1_000.5,
                  results: [
                    result({ assertionKind: 'delivered_to', botDurationMs: 100.125, graderDurationMs: 5.75 }),
                  ],
                }),
              ],
            })
          )
    )

    const response = await runsCommand({
      latest: true,
      json: true,
      verbose: true,
    }).handler()
    const output = JSON.parse(stdout)

    expect(response.exitCode).toBe(0)
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      `/v1/evals/bot/${PROD_BOT_ID}/runs`,
      '/v1/evals/runs/101',
    ])
    expect(output.run.entries[0]).toEqual({
      id: '201',
      evalRunId: '101',
      evalName: 'greeting',
      evalType: 'regression',
      tags: ['smoke'],
      passed: true,
      durationMs: 1000.5,
      errorKind: null,
      createdAt: '2026-07-10T10:00:00.000Z',
      results: [
        {
          id: '301',
          evalEntryId: '201',
          turnIndex: 0,
          resultIndex: 0,
          assertionKind: 'delivered_to',
          passed: true,
          skipped: false,
          score: null,
          botDurationMs: 100.125,
          graderDurationMs: 5.75,
          createdAt: '2026-07-10T10:00:01.000Z',
        },
      ],
    })
    expect(stdout + stderr).not.toMatch(
      /private scenario|raw evaluator|raw prompt|raw model|customer secret|raw response/i
    )
  })

  it('prints readable metadata-only human history', async () => {
    stubFetch(async () => json({ runs: [run()] }))

    const response = await runsCommand().handler()

    expect(response.exitCode).toBe(0)
    expect(stdout).toMatch(/101.*completed.*manual.*2026-07-10T10:00:00\.000Z/i)
  })

  it('starts the hosted workflow with real Botpress-compatible filters and returns the persisted result', async () => {
    stubFetch(async (url, index, init) => {
      if (index === 0) {
        expect(init.method).toBe('POST')
        expect(JSON.parse(String(init.body))).toEqual({
          name: 'builtin_eval_runner',
          status: 'pending',
          input: {
            filter: {
              names: ['greeting'],
              tags: ['smoke'],
              type: 'regression',
            },
            runType: 'manual',
            judgeModel: 'openai:gpt-4o',
            evalManifestId: 'manifest_1',
          },
          timeoutAt: expect.any(String),
        })
        return json({ workflow: { id: 'workflow_1', status: 'pending', output: {} } }, 201)
      }
      if (url.includes('/v1/chat/workflows/')) {
        return json({
          workflow: {
            id: 'workflow_1',
            status: 'completed',
            output: {
              runId: '101',
              passed: 1,
              failed: 0,
              total: 1,
              duration: 1000,
            },
          },
        })
      }
      return json(detail())
    })

    const response = await runCommand({
      name: 'greeting',
      tag: 'smoke',
      type: 'regression',
      judgeModel: 'openai:gpt-4o',
      json: true,
    }).handler()

    expect(response.exitCode).toBe(0)
    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/v1/chat/workflows',
      '/v1/chat/workflows/workflow_1',
      '/v1/evals/runs/101',
    ])
    expect(calls.every((call) => headers(call).authorization === 'Bearer bot_key')).toBe(true)
    expect(JSON.parse(stdout).run.id).toBe('101')
  })

  it('runs against dev only through the PAT-scoped opaque target', async () => {
    writeDevTarget()
    stubFetch(async (url, index) => {
      if (index === 0)
        return json({
          bot: {
            id: DEV_RUNTIME_BOT_ID,
            dev: true,
            tags: { 'botruntime.devTargetBotId': DEV_TARGET_BOT_ID },
          },
        })
      if (index === 1 && url.endsWith(`/v1/evals/bot/${encodeURIComponent(DEV_RUNTIME_BOT_ID)}/ready`)) {
        return json({ ready: true })
      }
      if (url.endsWith('/v1/chat/workflows'))
        return json({ workflow: { id: 'wf_dev', status: 'pending', output: {} } }, 201)
      if (url.endsWith('/v1/chat/workflows/wf_dev')) {
        return json({
          workflow: {
            id: 'wf_dev',
            status: 'completed',
            output: {
              runId: '101',
              passed: 1,
              failed: 0,
              total: 1,
              duration: 1,
            },
          },
        })
      }
      return json(detail({ botId: DEV_RUNTIME_BOT_ID }))
    })

    const response = await runCommand({ dev: true, json: true }).handler()

    expect(response.exitCode).toBe(0)
    expect(prepareHostedEvalManifest).toHaveBeenCalledWith(
      expect.objectContaining({
        projectDir: workDir,
        botId: DEV_TARGET_BOT_ID,
        workspaceId: WORKSPACE_ID,
      })
    )
    for (const call of calls.slice(1)) {
      expect(headers(call)).toEqual({
        authorization: 'Bearer pat_secret',
        'x-bot-id': DEV_RUNTIME_BOT_ID,
        ...(call.init.body ? { 'content-type': 'application/json' } : {}),
      })
    }
  })

  it('aggregates repeated runs and accepts a flaky suite at the configured pass rate', async () => {
    stubFetch(async (_url, index) => {
      if (index === 0) return json({ workflow: { id: 'wf_1', status: 'pending', output: {} } }, 201)
      if (index === 1)
        return json({
          workflow: {
            id: 'wf_1',
            status: 'completed',
            output: { runId: '101', passed: 1, failed: 0, total: 1, duration: 100 },
          },
        })
      if (index === 2) return json(detail())
      if (index === 3) return json({ workflow: { id: 'wf_2', status: 'pending', output: {} } }, 201)
      if (index === 4)
        return json({
          workflow: {
            id: 'wf_2',
            status: 'completed',
            output: { runId: '102', passed: 0, failed: 1, total: 1, duration: 300 },
          },
        })
      return json(
        detail({
          id: '102',
          entries: [
            entry({
              id: '202',
              evalRunId: '102',
              passed: false,
              results: [result({ id: '302', evalEntryId: '202', passed: false })],
            }),
          ],
        })
      )
    })

    const response = await runCommand({
      repeat: 2,
      maxConcurrency: 1,
      minPassRate: 0.5,
      json: true,
    }).handler()

    expect(response.exitCode).toBe(0)
    expect(JSON.parse(stdout).aggregate).toEqual(
      expect.objectContaining({
        repeat: 2,
        passedRuns: 1,
        failedRuns: 1,
        passRate: 0.5,
        classification: 'flaky',
        p50DurationMs: 100,
        p95DurationMs: 300,
        failureHistogram: { response_contains: 1 },
      })
    )
  })

  it('returns non-zero for a failed suite after printing only the safe result', async () => {
    stubFetch(async (url, index) => {
      if (index === 0) return json({ workflow: { id: 'workflow_1', status: 'pending', output: {} } }, 201)
      if (url.includes('/workflows/')) {
        return json({
          workflow: {
            id: 'workflow_1',
            status: 'completed',
            output: {
              runId: '101',
              passed: 0,
              failed: 1,
              total: 1,
              duration: 1,
              rawError: 'customer secret',
            },
          },
        })
      }
      return json(
        detail({
          entries: [entry({ passed: false, error: 'customer secret' })],
        })
      )
    })

    const response = await runCommand({ json: true }).handler()

    expect(response.exitCode).toBe(1)
    expect(JSON.parse(stdout).run.entries[0].passed).toBe(false)
    expect(stderr).toMatch(/eval suite failed|failed eval/i)
    expect(stdout + stderr).not.toContain('customer secret')
  })

  it('never reflects a raw workflow failure reason', async () => {
    stubFetch(async (_url, index) =>
      index === 0
        ? json({ workflow: { id: 'workflow_1', status: 'pending', output: {} } }, 201)
        : json({
            workflow: {
              id: 'workflow_1',
              status: 'failed',
              output: {},
              failureReason: 'raw prompt and customer secret',
            },
          })
    )

    const response = await runCommand({ verbose: true }).handler()

    expect(response.exitCode).toBe(1)
    expect(stderr).toMatch(/workflow failed|redeploy|traces/i)
    expect(stdout + stderr).not.toContain('customer secret')
  })

  it.each([
    [{ timeout: 999 }, /timeout.*1000.*3600000/i],
    [{ timeout: 1.5 }, /timeout.*integer/i],
    [{ type: 'unknown' }, /type.*malformed/i],
    [{ name: 'raw prompt\nsecret' }, /eval name.*malformed/i],
    [{ judgeModel: 'openai model' }, /judge-model.*safe model/i],
  ])('validates run selectors before target or network: %j', async (overrides, expected) => {
    stubFetch(async () => json({}))

    const response = await runCommand(overrides).handler()

    expect(response.exitCode).toBe(1)
    expect(calls).toEqual([])
    expect(stderr).toMatch(expected)
    expect(stdout + stderr).not.toContain('raw prompt')
  })

  it('fails loudly on a malformed workflow completion without reflecting extra output', async () => {
    stubFetch(async (_url, index) =>
      index === 0
        ? json({ workflow: { id: 'workflow_1', status: 'pending', output: {} } }, 201)
        : json({
            workflow: {
              id: 'workflow_1',
              status: 'completed',
              output: { runId: 'bad', rawPrompt: 'customer secret' },
            },
          })
    )

    const response = await runCommand({ verbose: true }).handler()

    expect(response.exitCode).toBe(1)
    expect(stderr).toMatch(/workflow runId.*positive decimal/i)
    expect(stdout + stderr).not.toContain('customer secret')
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

  function runsCommand(overrides: Record<string, unknown> = {}): EvalRunsCommand {
    const argv = baseArgv({
      latest: false,
      limit: 10,
      nextToken: undefined,
      runId: undefined,
      status: undefined,
      ...overrides,
    })
    return new EvalRunsCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function runCommand(overrides: Record<string, unknown> = {}): EvalRunCommand {
    const argv = baseArgv({
      judgeModel: undefined,
      name: undefined,
      tag: undefined,
      type: undefined,
      timeout: 3_600_000,
      ...overrides,
    })
    return new EvalRunCommand({} as any, {} as any, new Logger(argv as any), argv as any)
  }

  function writeDevTarget(): void {
    fs.writeFileSync(
      path.join(workDir, 'agent.local.json'),
      JSON.stringify({
        devId: DEV_RUNTIME_BOT_ID,
        devTargetBotId: DEV_TARGET_BOT_ID,
      })
    )
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
