import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Logger } from '../logger'
import { AbortBotDeploymentCommand } from './bot-deployments-command'

const API_URL = 'https://cloud.example'
const WORKSPACE_ID = '42'
const BOT_ID = '7'
const OTHER_BOT_ID = '99'
const DEPLOYMENT_ID = '00000000-0000-5000-8000-000000000001'
const PAT_TOKEN = 'pat_secret'
const BOT_KEY = 'bot_key_secret'

type FetchCall = { url: string; init: RequestInit }

const json = (body: unknown, status = 200): Response =>
  Response.json(body, { status })

const environment = (overrides: Record<string, unknown> = {}) => ({
  runtimeId: 1,
  currentVersionId: 10,
  currentContentHash: 'active-hash',
  fenceGeneration: 1,
  trafficFenced: true,
  enforcementState: 'enforced',
  pinDualWriteStartedAt: '2026-07-26T00:00:00Z',
  readiness: {
    activeManifestValid: true,
    newAdmissionUnpinnedRows: 0,
    legacyNonterminalUnclassified: 0,
    unknownExecutionDomains: 0,
    ready: true,
  },
  ...overrides,
})

const deployment = (phase = 'fenced', overrides: Record<string, unknown> = {}) => ({
  id: DEPLOYMENT_ID,
  phase,
  transitionMode: 'fence',
  expectedCurrentVersionId: 10,
  stagedVersionId: 11,
  finalVersionId: 11,
  fenceGeneration: 1,
  targetTableContracts: {},
  schemaMutated: false,
  ...overrides,
})

const aborted = (overrides: Record<string, unknown> = {}) =>
  deployment('failed', {
    fenceGeneration: 2,
    lastErrorCode: 'BOT_DEPLOYMENT_ABORTED',
    ...overrides,
  })

describe('brt bots deployments abort', () => {
  let botpressHome: string
  let workDir: string
  let calls: FetchCall[]
  let stdout: string
  let stderr: string
  let originalFetch: typeof fetch
  let confirm: ReturnType<typeof vi.fn>

  beforeEach(() => {
    botpressHome = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-deployment-abort-home-'))
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-deployment-abort-project-'))
    calls = []
    stdout = ''
    stderr = ''
    originalFetch = globalThis.fetch
    confirm = vi.fn().mockResolvedValue(true)

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
          [BOT_ID]: { apiKey: BOT_KEY },
        },
      })
    )
    fs.writeFileSync(path.join(workDir, 'agent.config.ts'), 'export default {}')
    fs.writeFileSync(
      path.join(workDir, 'agent.json'),
      JSON.stringify({ botId: BOT_ID, workspaceId: WORKSPACE_ID, apiUrl: API_URL })
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

  it('uses the current environment generation after confirmation, including a prior raw unfence', async () => {
    stubSuccessfulAbort({
      before: deployment('fenced', { fenceGeneration: 1 }),
      currentEnvironment: environment({ fenceGeneration: 2, trafficFenced: false }),
      after: aborted({ fenceGeneration: 2 }),
    })

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      `GET ${API_URL}/v1/admin/bots/${BOT_ID}/deployments/${DEPLOYMENT_ID}`,
      `GET ${API_URL}/v1/admin/bots/${BOT_ID}/deployment-environment`,
      `POST ${API_URL}/v1/admin/bots/${BOT_ID}/deployments/${DEPLOYMENT_ID}/abort`,
    ])
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({
      expectedFenceGeneration: 2,
    })
    expect(calls[2]!.init.headers).toMatchObject({
      authorization: `Bearer ${PAT_TOKEN}`,
      'x-workspace-id': WORKSPACE_ID,
    })
    expect(String((calls[2]!.init.headers as Record<string, string>).authorization)).not.toContain(BOT_KEY)
    expect(stdout).toMatch(/active version 10.*staged version 11/i)
  })

  it('reads the environment only after the operator confirms', async () => {
    stubFetch(() => {
      throw new Error('unexpected network request')
    })
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const call = { url: String(input), init }
      calls.push(call)
      return json({ deployment: deployment() })
    }) as typeof fetch
    confirm.mockResolvedValue(false)

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(calls).toHaveLength(1)
    expect(stdout).toMatch(/cancelled.*no changes/i)
  })

  it('unfences a currently fenced environment through the abort transaction', async () => {
    stubSuccessfulAbort({
      before: deployment('fenced', { fenceGeneration: 1 }),
      currentEnvironment: environment({ fenceGeneration: 1, trafficFenced: true }),
      after: aborted({ fenceGeneration: 2 }),
    })

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(String(calls[2]!.init.body))).toEqual({
      expectedFenceGeneration: 1,
    })
    expect(stdout).toMatch(/traffic unfenced at generation 2/i)
  })

  it('supports aborting an initial staged version whose preserved pointer is zero', async () => {
    stubSuccessfulAbort({
      before: deployment('staged', { expectedCurrentVersionId: 0, fenceGeneration: null }),
      currentEnvironment: environment({
        currentVersionId: 0,
        fenceGeneration: 0,
        trafficFenced: false,
      }),
      after: aborted({ expectedCurrentVersionId: 0, fenceGeneration: 0 }),
    })

    const result = await command({ json: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(JSON.parse(stdout)).toMatchObject({
      preservedVersionId: 0,
      fenceGeneration: 0,
    })
  })

  it('describes an initial abort without inventing active version zero', async () => {
    stubSuccessfulAbort({
      before: deployment('staged', { expectedCurrentVersionId: 0, fenceGeneration: null }),
      currentEnvironment: environment({
        currentVersionId: 0,
        fenceGeneration: 0,
        trafficFenced: false,
      }),
      after: aborted({ expectedCurrentVersionId: 0, fenceGeneration: 0 }),
    })

    const result = await command().handler()

    expect(result.exitCode).toBe(0)
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/no active version exists/i))
    expect(stdout).toMatch(/no active version existed/i)
    expect(stdout).not.toMatch(/active version 0/i)
  })

  it.each([
    ['schema mutation', deployment('fenced', { schemaMutated: true })],
    ['schema-synced phase', deployment('schema_synced', { schemaMutated: false })],
    ['activated phase', deployment('activated', { schemaMutated: false })],
    ['unrelated failure', deployment('failed', { lastErrorCode: 'BOT_DEPLOYMENT_SCHEMA_FAILED' })],
  ])('fails before confirmation for an unsafe %s', async (_label, unsafeDeployment) => {
    stubFetch(() => json({ deployment: unsafeDeployment }))

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(confirm).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(stderr).toMatch(/cannot be safely aborted/i)
  })

  it('treats only the exact aborted terminal state as an idempotent success', async () => {
    stubFetch(() => json({ deployment: aborted() }))

    const result = await command({ json: true }).handler()

    expect(result.exitCode).toBe(0)
    expect(confirm).not.toHaveBeenCalled()
    expect(calls).toHaveLength(1)
    expect(JSON.parse(stdout)).toMatchObject({
      botId: BOT_ID,
      workspaceId: WORKSPACE_ID,
      deploymentId: DEPLOYMENT_ID,
      phase: 'failed',
      lastErrorCode: 'BOT_DEPLOYMENT_ABORTED',
      preservedVersionId: 10,
      abandonedVersionId: 11,
      fenceGeneration: 2,
    })
  })

  it('fails if the mutation response is failed for any reason other than an exact abort', async () => {
    stubSuccessfulAbort({
      before: deployment(),
      currentEnvironment: environment(),
      after: deployment('failed', { lastErrorCode: 'BOT_DEPLOYMENT_SCHEMA_FAILED' }),
    })

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/did not return the exact aborted terminal state/i)
  })

  it('rejects an aborted response that substitutes a different final version', async () => {
    stubSuccessfulAbort({
      before: deployment(),
      currentEnvironment: environment(),
      after: aborted({ finalVersionId: 12 }),
    })

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(stderr).toMatch(/did not return the exact aborted terminal state/i)
  })

  it('fails nonzero on a concurrent fence-generation conflict', async () => {
    stubFetch((call) => {
      if (call.url.endsWith(`/deployments/${DEPLOYMENT_ID}`)) {
        return json({ deployment: deployment() })
      }
      if (call.url.endsWith('/deployment-environment')) {
        return json({ environment: environment() })
      }
      return json(
        {
          code: 'BOT_DEPLOYMENT_FENCE_GENERATION_CONFLICT',
          message: 'deployment fence generation conflict',
        },
        409
      )
    })

    const result = await command().handler()

    expect(result.exitCode).toBe(1)
    expect(calls).toHaveLength(3)
    expect(stderr).toMatch(/409.*fence generation conflict/i)
  })

  it('supports an explicit bot id without a project link and still uses the selected profile PAT', async () => {
    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-deployment-abort-empty-'))
    try {
      stubSuccessfulAbort({
        botId: OTHER_BOT_ID,
        before: deployment(),
        currentEnvironment: environment(),
        after: aborted(),
      })

      const result = await command({ botId: OTHER_BOT_ID, workDir: emptyDir }).handler()

      expect(result.exitCode).toBe(0)
      expect(calls[0]!.url).toContain(`/v1/admin/bots/${OTHER_BOT_ID}/deployments/`)
      expect(calls[2]!.init.headers).toMatchObject({
        authorization: `Bearer ${PAT_TOKEN}`,
        'x-workspace-id': WORKSPACE_ID,
      })
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true })
    }
  })

  function baseArgv(overrides: Record<string, unknown>): Record<string, unknown> {
    return {
      apiUrl: undefined,
      botId: undefined,
      botpressHome,
      confirm: false,
      deploymentId: DEPLOYMENT_ID,
      json: false,
      local: false,
      profile: 'default',
      verbose: false,
      workDir,
      ...overrides,
    }
  }

  function command(overrides: Record<string, unknown> = {}): AbortBotDeploymentCommand {
    const argv = baseArgv(overrides)
    return new AbortBotDeploymentCommand(
      {} as any,
      { confirm } as any,
      new Logger(argv as any),
      argv as any
    )
  }

  function stubSuccessfulAbort(input: {
    botId?: string
    before: Record<string, unknown>
    currentEnvironment: Record<string, unknown>
    after: Record<string, unknown>
  }): void {
    const botId = input.botId ?? BOT_ID
    stubFetch((call) => {
      if (call.url === `${API_URL}/v1/admin/bots/${botId}/deployments/${DEPLOYMENT_ID}`) {
        return json({ deployment: input.before })
      }
      if (call.url === `${API_URL}/v1/admin/bots/${botId}/deployment-environment`) {
        return json({ environment: input.currentEnvironment })
      }
      if (call.url === `${API_URL}/v1/admin/bots/${botId}/deployments/${DEPLOYMENT_ID}/abort`) {
        return json({ deployment: input.after })
      }
      return json({ message: 'not found' }, 404)
    })
  }

  function stubFetch(impl: (call: FetchCall) => Response | Promise<Response>): void {
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
      const call = { url: String(input), init }
      calls.push(call)
      return impl(call)
    }) as typeof fetch
  }
})
