import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EvalDefinition } from '../definition'
import type { EvalRunReport, TurnReport } from '../types'
import { VortexEvalStore, validateHostedEvalDefinitions } from './vortex-eval-store'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

const basicDefinition: EvalDefinition = {
  name: 'greeting',
  type: 'capability',
  tags: ['smoke'],
  conversation: [{ user: 'hello', assert: { response: [{ contains: 'hello' }] } }],
}

function store(development = false, evalManifestId = 'file_1'): VortexEvalStore {
  return new VortexEvalStore({
    url: 'https://vortex.example/',
    botId: development ? 'dev_runtime:7' : '42',
    token: 'runtime-token',
    development,
    evalManifestId,
  })
}

function bodyOf(call: [RequestInfo | URL, RequestInit?]): unknown {
  return JSON.parse(String(call[1]?.body))
}

function requestPath(call: [RequestInfo | URL, RequestInit?]): string {
  return new URL(String(call[0])).pathname
}

describe('VortexEvalStore strict hosted contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses bot-scoped prod auth and serializes only safe lifecycle fields', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ id: '9007199254740993' }))
      .mockResolvedValueOnce(json({ entries: [{ id: '2' }] }))
      .mockImplementation(async () => json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    const client = store()

    const runId = await client.createRun('scheduled', {
      workflowId: 'wf_1',
      definitions: [basicDefinition],
    })
    const entryId = await client.startEntry(runId, {
      evalName: 'greeting',
      evalType: 'capability',
      tags: ['smoke'],
      ...({ description: 'CANARY_DESCRIPTION_SECRET' } as Record<string, unknown>),
    })
    const turn: TurnReport = {
      turnIndex: 0,
      conversationId: 'conv_eval_1',
      traceId: '0123456789abcdef0123456789abcdef',
      userMessage: 'CANARY_USER_MESSAGE',
      botResponse: 'CANARY_BOT_RESPONSE',
      assertions: [
        {
          assertion: 'contains "CANARY_ASSERTION_CONTENT"',
          pass: true,
          expected: 'CANARY_EXPECTED',
          actual: 'CANARY_ACTUAL',
        },
        {
          assertion: 'llm_judge: "CANARY_JUDGE_PROMPT"',
          pass: false,
          skipped: true,
          expected: 'CANARY_JUDGE_EXPECTED',
          actual: 'CANARY_JUDGE_ACTUAL',
        },
      ],
      pass: false,
      botDuration: 25.125,
      evalDuration: 7.75,
    }
    await client.appendTurnResults(runId, entryId, turn)
    await client.appendOutcomeResults(runId, entryId, [
      {
        assertion: 'state: private.value equals',
        pass: false,
        expected: 'CANARY_OUTCOME_EXPECTED',
        actual: 'CANARY_OUTCOME_ACTUAL',
      },
    ])
    await client.finalizeEntry(runId, entryId, {
      passed: false,
      durationMs: 32,
      errorKind: 'chat',
      diagnostic: {
        code: 'CHAT_PAYLOAD_INVALID',
        phase: 'observation',
        turnIndex: 0,
        conversationId: 'conv_eval_1',
        traceId: '0123456789abcdef0123456789abcdef',
      },
    })
    await client.markRunComplete(runId, { errorKind: 'chat' })

    expect(runId).toBe('9007199254740993')
    expect(entryId).toBe('2')
    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({
      evalManifestId: 'file_1',
      workflowId: 'wf_1',
      triggerType: 'scheduled',
    })
    expect(bodyOf(fetchMock.mock.calls[1]!)).toEqual({
      entries: [{ evalName: 'greeting', evalType: 'capability', tags: ['smoke'] }],
    })
    expect(bodyOf(fetchMock.mock.calls[2]!)).toEqual({
      results: [
        {
          turnIndex: 0,
          conversationId: 'conv_eval_1',
          traceId: '0123456789abcdef0123456789abcdef',
          botDurationMs: 25.125,
          graderDurationMs: 7.75,
          assertionKind: 'response_contains',
          passed: true,
          skipped: false,
        },
        {
          turnIndex: 0,
          conversationId: 'conv_eval_1',
          traceId: '0123456789abcdef0123456789abcdef',
          botDurationMs: 25.125,
          graderDurationMs: 7.75,
          assertionKind: 'llm_judge',
          passed: false,
          skipped: true,
        },
      ],
    })
    expect(bodyOf(fetchMock.mock.calls[3]!)).toEqual({
      results: [
        {
          turnIndex: -1,
          assertionKind: 'outcome',
          passed: false,
          skipped: false,
        },
      ],
    })
    expect(bodyOf(fetchMock.mock.calls[4]!)).toEqual({
      passed: false,
      durationMs: 32,
      errorKind: 'chat',
      errorCode: 'CHAT_PAYLOAD_INVALID',
      errorPhase: 'observation',
      errorTurnIndex: 0,
      conversationId: 'conv_eval_1',
      traceId: '0123456789abcdef0123456789abcdef',
    })
    expect(bodyOf(fetchMock.mock.calls[5]!)).toEqual({ errorKind: 'chat' })

    for (const [, init] of fetchMock.mock.calls) {
      const headers = new Headers(init?.headers)
      expect(headers.get('Authorization')).toBe('Bearer runtime-token')
      expect(headers.has('x-bot-id')).toBe(false)
    }
    const serializedBodies = fetchMock.mock.calls.map((call) => String(call[1]?.body ?? '')).join('\n')
    for (const forbidden of [
      'workspaceId',
      'metadata',
      'description',
      'graderName',
      'evidence',
      'userMessage',
      'botResponse',
      'CANARY_',
    ]) {
      expect(serializedBodies).not.toContain(forbidden)
    }
  })

  it('adds the opaque x-bot-id only for explicit development authority', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ id: '1' }))
    vi.stubGlobal('fetch', fetchMock)

    await store(true).createRun('manual', {
      workflowId: 'wf_dev',
      definitions: [basicDefinition],
    })

    expect(requestPath(fetchMock.mock.calls[0]!)).toBe('/v1/evals/bot/dev_runtime%3A7/runs')
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('Authorization')).toBe('Bearer runtime-token')
    expect(headers.get('x-bot-id')).toBe('dev_runtime:7')
  })

  it.each([
    ['unsafe eval name', () => [{ ...basicDefinition, name: 'private name' }], /names.*safe ASCII/i],
    ['unsafe tag', () => [{ ...basicDefinition, tags: ['private/tag'] }], /tags.*safe ASCII/i],
    [
      'eval capacity',
      () =>
        Array.from({ length: 129 }, (_, index) => ({
          ...basicDefinition,
          name: `eval_${index}`,
        })),
      /between 1 and 128 evals/i,
    ],
    [
      'turn capacity',
      () => [
        {
          ...basicDefinition,
          conversation: Array.from({ length: 1025 }, () => ({ user: 'x' })),
        },
      ],
      /at most 1024 turns/i,
    ],
    [
      'per-turn result capacity',
      () => [
        {
          ...basicDefinition,
          conversation: [
            {
              user: 'x',
              assert: {
                tools: Array.from({ length: 64 }, (_, index) => ({
                  called: `tool_${index}`,
                })),
              },
            },
          ],
        },
      ],
      /at most 64 results/i,
    ],
    [
      'per-eval result capacity',
      () => [
        {
          ...basicDefinition,
          conversation: Array.from({ length: 600 }, () => ({
            user: 'x',
            assert: { tools: [{ called: 'safe_tool' }] },
          })),
        },
      ],
      /project at most 1024 results/i,
    ],
    [
      'run result capacity',
      () =>
        Array.from({ length: 65 }, (_, evalIndex) => ({
          ...basicDefinition,
          name: `eval_${evalIndex}`,
          conversation: [
            {
              user: 'x',
              assert: {
                tools: Array.from({ length: 63 }, (_, index) => ({
                  called: `tool_${index}`,
                })),
              },
            },
          ],
        })),
      /at most 4096 results/i,
    ],
  ] as const)('rejects %s before createRun performs fetch', async (_label, definitions, expected) => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      store().createRun('scheduled', {
        workflowId: 'wf_1',
        definitions: definitions(),
      })
    ).rejects.toThrow(expected)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('validates manifest/workflow and every outgoing safe DTO before fetch', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      store(false, 'invalid manifest').createRun('scheduled', {
        workflowId: 'wf_1',
        definitions: [basicDefinition],
      })
    ).rejects.toThrow(/evalManifestId/i)
    await expect(
      store().createRun('scheduled', {
        workflowId: 'invalid workflow',
        definitions: [basicDefinition],
      })
    ).rejects.toThrow(/workflowId/i)
    await expect(store().startEntry('1', { evalName: 'invalid/name' })).rejects.toThrow(/safe ASCII/i)
    await expect(
      store().appendTurnResults('1', '2', {
        turnIndex: 1024,
        userMessage: '',
        botResponse: '',
        assertions: [{ assertion: 'response', pass: true, expected: '', actual: '' }],
        pass: true,
        botDuration: 1,
        evalDuration: 1,
      })
    ).rejects.toThrow(/turnIndex/i)
    await expect(
      store().finalizeEntry('1', '2', {
        passed: false,
        diagnostic: { code: 'CHAT_PAYLOAD_INVALID', phase: 'observation' },
      })
    ).rejects.toThrow(/requires passed=false and an errorKind/i)
    await expect(
      store().finalizeEntry('1', '2', {
        passed: true,
        errorKind: 'chat',
        diagnostic: { code: 'CHAT_PAYLOAD_INVALID', phase: 'observation' },
      })
    ).rejects.toThrow(/requires passed=false and an errorKind/i)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('accepts the exact 1024-result per-eval boundary before create', () => {
    expect(() =>
      validateHostedEvalDefinitions([
        {
          ...basicDefinition,
          conversation: Array.from({ length: 1024 }, () => ({ user: 'x' })),
        },
      ])
    ).not.toThrow()
    expect(() =>
      validateHostedEvalDefinitions([
        {
          ...basicDefinition,
          conversation: Array.from({ length: 1024 }, () => ({ user: 'x' })),
          outcome: { workflow: [{ name: 'after', completed: true }] },
        },
      ])
    ).toThrow(/project at most 1024 results/i)
  })

  it('counts delivery assertions in hosted capacity and persists their platform kinds', async () => {
    expect(() =>
      validateHostedEvalDefinitions([
        {
          ...basicDefinition,
          conversation: [
            {
              user: 'x',
              assert: {
                deliveredTo: Array.from({ length: 63 }, (_, index) => `relation_${index}`),
              },
            },
          ],
        },
      ])
    ).not.toThrow()
    expect(() =>
      validateHostedEvalDefinitions([
        {
          ...basicDefinition,
          conversation: [
            {
              user: 'x',
              assert: {
                deliveredTo: Array.from({ length: 64 }, (_, index) => `relation_${index}`),
              },
            },
          ],
        },
      ])
    ).toThrow(/at most 64 results/i)

    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)
    await store().appendTurnResults('1', '2', {
      turnIndex: 0,
      userMessage: '',
      botResponse: '',
      assertions: [
        {
          assertion: 'delivered_to:lawyer',
          pass: true,
          expected: '',
          actual: '',
        },
        {
          assertion: 'not_delivered_to:client',
          pass: true,
          expected: '',
          actual: '',
        },
        {
          assertion: 'conversation_mode:client',
          pass: true,
          expected: '',
          actual: '',
        },
      ],
      pass: true,
      botDuration: 8,
      evalDuration: 3,
    })

    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({
      results: [
        expect.objectContaining({ assertionKind: 'delivered_to' }),
        expect.objectContaining({ assertionKind: 'not_delivered_to' }),
        expect.objectContaining({ assertionKind: 'conversation_mode' }),
      ],
    })
  })

  it('persists assertion-free successful turns as a deterministic safe response result', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () => json({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await store().appendTurnResults('1', '2', {
      turnIndex: 0,
      userMessage: 'CANARY_ASSERTION_FREE_USER',
      botResponse: 'CANARY_ASSERTION_FREE_BOT',
      assertions: [],
      pass: true,
      botDuration: 8,
      evalDuration: 3,
    })
    await store().appendTurnResults('1', '2', {
      turnIndex: 1,
      userMessage: 'CANARY_SILENCE_USER',
      botResponse: '',
      assertions: [
        {
          assertion: 'no_response',
          pass: true,
          expected: 'CANARY',
          actual: 'CANARY',
        },
      ],
      pass: true,
      botDuration: 4,
      evalDuration: 1,
    })

    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({
      results: [
        {
          turnIndex: 0,
          botDurationMs: 8,
          graderDurationMs: 3,
          assertionKind: 'response',
          passed: true,
          skipped: false,
        },
      ],
    })
    expect(bodyOf(fetchMock.mock.calls[1]!)).toEqual({
      results: [
        {
          turnIndex: 1,
          botDurationMs: 4,
          graderDurationMs: 1,
          assertionKind: 'no_response',
          passed: true,
          skipped: false,
        },
      ],
    })
    expect(fetchMock.mock.calls.map((call) => String(call[1]?.body)).join('\n')).not.toContain('CANARY')
  })

  it('performs the exact idempotent final reconciliation before completion', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/entries') && init?.method === 'POST') return json({ entries: [{ id: '20' }] })
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    const report: EvalRunReport = {
      id: 'local-report-id',
      timestamp: '2026-07-10T10:00:00.000Z',
      evals: [
        {
          name: 'greeting',
          type: 'capability',
          tags: ['smoke'],
          turns: [
            {
              turnIndex: 0,
              userMessage: 'CANARY_RECONCILE_USER',
              botResponse: 'CANARY_RECONCILE_BOT',
              assertions: [
                {
                  assertion: 'response',
                  pass: true,
                  expected: 'CANARY',
                  actual: 'CANARY',
                },
              ],
              pass: true,
              botDuration: 5,
              evalDuration: 2,
            },
          ],
          outcomeAssertions: [
            {
              assertion: 'workflow: secret completed',
              pass: true,
              expected: 'CANARY',
              actual: 'CANARY',
            },
          ],
          pass: true,
          duration: 7,
        },
      ],
      passed: 1,
      failed: 0,
      total: 1,
      duration: 7,
    }

    await store().completeRun('10', report)

    expect(fetchMock.mock.calls.map((call) => [call[1]?.method, requestPath(call)])).toEqual([
      ['POST', '/v1/evals/runs/10/entries'],
      ['POST', '/v1/evals/runs/10/entries/20/results'],
      ['POST', '/v1/evals/runs/10/entries/20/results'],
      ['PATCH', '/v1/evals/runs/10/entries/20'],
      ['POST', '/v1/evals/runs/10/complete'],
    ])
    expect(bodyOf(fetchMock.mock.calls[4]!)).toEqual({})
    expect(fetchMock.mock.calls.map((call) => String(call[1]?.body ?? '')).join('\n')).not.toContain('CANARY')
  })

  it('marks an aborted reconciled report with the only compatible terminal payload', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      const path = new URL(String(input)).pathname
      if (path.endsWith('/entries') && init?.method === 'POST') return json({ entries: [{ id: '2' }] })
      return json({ ok: true })
    })
    vi.stubGlobal('fetch', fetchMock)
    const report: EvalRunReport = {
      id: 'local',
      timestamp: new Date(0).toISOString(),
      evals: [
        {
          name: 'greeting',
          turns: [],
          outcomeAssertions: [],
          pass: false,
          duration: 0,
          error: 'CANARY_ABORT_DETAIL',
          errorCode: 'CHAT_NOT_CONNECTED',
        },
      ],
      passed: 0,
      failed: 1,
      total: 1,
      duration: 0,
      aborted: true,
    }

    await store().completeRun('1', report)

    expect(bodyOf(fetchMock.mock.calls.at(-2)!)).toEqual({
      passed: false,
      durationMs: 0,
      errorKind: 'chat',
    })
    expect(bodyOf(fetchMock.mock.calls.at(-1)!)).toEqual({
      aborted: true,
      errorKind: 'aborted',
    })
    expect(fetchMock.mock.calls.map((call) => String(call[1]?.body ?? '')).join('\n')).not.toContain(
      'CANARY_ABORT_DETAIL'
    )
  })

  it('returns typed errors without copying a raw server body into the message', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'CANARY_RAW_SERVER_SECRET' }, 401)))

    let caught: unknown
    try {
      await store().createRun('scheduled', {
        workflowId: 'wf_1',
        definitions: [basicDefinition],
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ kind: 'auth', status: 401 })
    expect((caught as Error).message).not.toContain('CANARY_RAW_SERVER_SECRET')
  })

  it('identifies the failed lifecycle operation without copying the response body', async () => {
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'CANARY_RAW_SERVER_SECRET' }, 409)))

    let caught: unknown
    try {
      await store().finalizeEntry('10', '20', {
        passed: false,
        durationMs: 15,
      })
    } catch (error) {
      caught = error
    }

    expect(caught).toMatchObject({ kind: 'internal', status: 409 })
    expect((caught as Error).message).toContain('PATCH /v1/evals/runs/10/entries/20')
    expect((caught as Error).message).toContain('HTTP 409')
    expect((caught as Error).message).not.toContain('CANARY_RAW_SERVER_SECRET')
  })

  it('projects read responses to safe metadata even if a legacy server includes content fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        json({
          id: '1',
          botId: '42',
          workspaceId: '99',
          evalManifestId: 'file_1',
          workflowId: 'wf_1',
          status: 'completed',
          triggerType: 'scheduled',
          startedAt: '2026-07-10T10:00:00.000Z',
          completedAt: '2026-07-10T10:00:01.000Z',
          createdAt: '2026-07-10T10:00:00.000Z',
          updatedAt: '2026-07-10T10:00:01.000Z',
          aborted: false,
          errorKind: null,
          entries: [
            {
              id: '2',
              evalRunId: '1',
              evalName: 'greeting',
              evalType: 'capability',
              description: 'CANARY_DESCRIPTION',
              tags: ['smoke'],
              passed: true,
              durationMs: 3,
              errorKind: null,
              error: 'CANARY_ERROR',
              createdAt: '2026-07-10T10:00:00.000Z',
              results: [
                {
                  id: '3',
                  evalEntryId: '2',
                  turnIndex: 0,
                  resultIndex: 0,
                  assertionKind: 'response',
                  graderName: 'CANARY_GRADER',
                  passed: true,
                  skipped: true,
                  score: null,
                  evidence: { expected: 'CANARY_EXPECTED' },
                  userMessage: 'CANARY_USER',
                  botResponse: 'CANARY_BOT',
                  botDurationMs: 2,
                  graderDurationMs: 1,
                  createdAt: '2026-07-10T10:00:00.000Z',
                },
              ],
            },
          ],
        })
      )
    )

    const report = await store().loadRunResult('1')

    expect(report?.evals[0]).toMatchObject({
      name: 'greeting',
      turns: [
        {
          userMessage: '',
          botResponse: '',
          assertions: [
            {
              assertion: 'response',
              expected: '',
              actual: '',
              pass: true,
              skipped: true,
            },
          ],
        },
      ],
    })
    expect(JSON.stringify(report)).not.toContain('CANARY_')
  })

  it('watchRun reconstructs an assertion-free turn from its synthetic safe response row', async () => {
    const run = {
      id: '1',
      botId: '42',
      evalManifestId: 'file_1',
      workflowId: 'wf_1',
      status: 'completed',
      triggerType: 'scheduled',
      startedAt: '2026-07-10T10:00:00.000Z',
      completedAt: '2026-07-10T10:00:01.000Z',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-10T10:00:01.000Z',
      aborted: false,
      errorKind: null,
    }
    const detail = {
      ...run,
      entries: [
        {
          id: '2',
          evalRunId: '1',
          evalName: 'greeting',
          evalType: 'capability',
          tags: [],
          passed: true,
          durationMs: 11,
          errorKind: null,
          createdAt: '2026-07-10T10:00:00.000Z',
          results: [
            {
              id: '3',
              evalEntryId: '2',
              turnIndex: 0,
              resultIndex: 0,
              assertionKind: 'response',
              passed: true,
              skipped: false,
              score: null,
              botDurationMs: 8,
              graderDurationMs: 3,
              createdAt: '2026-07-10T10:00:00.000Z',
            },
          ],
        },
      ],
    }
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ runs: [run] }))
      .mockResolvedValueOnce(json(detail))
    vi.stubGlobal('fetch', fetchMock)

    const events = []
    for await (const event of store().watchRun(undefined, { runId: '1' })) events.push(event)

    expect(events.map((event) => event.type)).toEqual([
      'eval_start',
      'turn_complete',
      'eval_complete',
      'suite_complete',
    ])
    expect(events.find((event) => event.type === 'turn_complete')).toMatchObject({
      turnReport: {
        turnIndex: 0,
        botDuration: 8,
        evalDuration: 3,
        assertions: [{ assertion: 'response', pass: true }],
      },
    })
  })

  it('exposes definition validation independently for hosts that preflight before auth/chat', () => {
    expect(() => validateHostedEvalDefinitions([basicDefinition])).not.toThrow()
  })
})
