import { afterEach, describe, expect, it, vi } from 'vitest'
import { VortexSpanSource } from './vortex-span-source'

const trace = (overrides: Record<string, unknown> = {}) => ({
  id: '1',
  createdAt: '2026-07-10T10:00:00.000Z',
  startedAt: '2026-07-10T10:00:00.000Z',
  endedAt: '2026-07-10T10:00:00.125Z',
  source: 'otlp',
  name: 'handler.conversation',
  kind: 'server',
  status: 'ok',
  traceId: '0123456789abcdef0123456789abcdef',
  spanId: '0123456789abcdef',
  parentSpanId: null,
  durationMs: 125,
  metadata: {
    endpoint: '/v2/cognitive/generate-text',
    actionType: 'generateText',
    aiModel: 'openai:gpt-5',
    aiInputTokens: 10,
    autonomousStatus: 'exit_success',
    workflowName: 'answer',
  },
  ...overrides,
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function humanSource() {
  return new VortexSpanSource({
    url: 'https://vortex.example/',
    pat: 'pat_secret',
    workspaceId: '42',
    targetBotId: '7',
    pollIntervalMs: 1,
  })
}

function botSource(development = false) {
  return new VortexSpanSource(
    development
      ? {
          mode: 'bot',
          url: 'https://vortex.example/',
          token: 'runtime-token',
          development: true,
          runtimeBotId: 'dev_runtime:7',
          pollIntervalMs: 1,
        }
      : {
          mode: 'bot',
          url: 'https://vortex.example/',
          token: 'runtime-token',
          development: false,
          pollIntervalMs: 1,
        }
  )
}

describe('VortexSpanSource cloud trace contract', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('uses the exact target-bot admin route, PAT auth only, and follows nextToken pages', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ traces: [trace()], meta: { nextToken: 'page-2' } }))
      .mockResolvedValueOnce(
        json({
          traces: [
            trace({
              id: '2',
              traceId: '1123456789abcdef0123456789abcdef',
              spanId: '1123456789abcdef',
            }),
          ],
          meta: {},
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const collector = humanSource()
    await collector.connect({ conversationId: 'conv:1' })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://vortex.example/v1/admin/workspaces/42/bots/7/traces?conversationId=conv%3A1&pageSize=1000'
    )
    expect(fetchMock.mock.calls[1]?.[0].toString()).toBe(
      'https://vortex.example/v1/admin/workspaces/42/bots/7/traces?conversationId=conv%3A1&pageSize=1000&nextToken=page-2'
    )
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({
      headers: { Authorization: 'Bearer pat_secret' },
    })
    expect(Object.keys((fetchMock.mock.calls[0]?.[1]?.headers ?? {}) as Record<string, string>)).not.toContain(
      'x-workspace-id'
    )
    expect(collector.getAllSpans()).toHaveLength(2)
  })

  it.each([
    [false, { Authorization: 'Bearer runtime-token' }],
    [true, { Authorization: 'Bearer runtime-token', 'x-bot-id': 'dev_runtime:7' }],
  ] as const)('uses the bot-scoped route and explicit %s development authority', async (development, headers) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ traces: [], meta: {} }))
    vi.stubGlobal('fetch', fetchMock)

    await botSource(development).connect({ conversationId: 'conv_1' })

    expect(fetchMock).toHaveBeenCalledOnce()
    expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
      'https://vortex.example/v1/traces?conversationId=conv_1&pageSize=1000'
    )
    expect(fetchMock.mock.calls[0]?.[1]).toEqual({ headers })
  })

  it('preflights bot-scoped reader auth with a bounded correlation and without mutating collector state', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ traces: [], meta: {} }))
    vi.stubGlobal('fetch', fetchMock)
    const collector = botSource(true)

    await collector.assertReadable()

    const url = new URL(fetchMock.mock.calls[0]![0].toString())
    expect(url.pathname).toBe('/v1/traces')
    expect(url.searchParams.get('conversationId')).toMatch(/^eval-preflight-[A-Za-z0-9_-]+$/)
    expect(url.searchParams.get('conversationId')!.length).toBeLessThanOrEqual(128)
    expect(collector.getAllSpans()).toEqual([])
  })

  it.each([400, 401, 403, 404])('fails the initial reader preflight immediately on HTTP %s', async (status) => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(json({ error: 'denied' }, status))
    vi.stubGlobal('fetch', fetchMock)

    await expect(botSource(true).assertReadable()).rejects.toThrow(new RegExp(`HTTP ${status}`))
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('projects only typed safe metadata and ignores legacy/raw row content', async () => {
    const unsafeRow = trace({
      userId: 'user-secret',
      messageId: 'message-secret',
      conversationId: 'conversation-secret',
      attributes: { prompt: 'raw prompt', 'tool.input': { secret: true } },
      payload: { request: 'raw request', response: 'raw response' },
      metadata: {
        endpoint: '/v2/cognitive/generate-text',
        aiRequestedModel: 'raw model with spaces',
        aiModel: 'openai:gpt-5',
        aiStopReason: 'max_tokens',
        aiInputTokens: 1_000_000_001,
        autonomousToolName: 'search',
        autonomousToolStatus: 'success',
        workflowName: 'answer',
        errorKind: 'raw-secret-error',
        errorName: 'TypeError',
        errorCode: 'BLOC_ITEM_INVALID',
        errorMessage: "Cannot read properties of undefined (reading 'imageUrl')",
        errorStack: 'TypeError: invalid bloc item\n    at Chat.transformMessage (src/runtime/chat/chat.ts:381:52)',
        prompt: 'must not cross the boundary',
        arbitrary: { secret: true },
      },
    })
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(json({ traces: [unsafeRow], meta: {} })))

    const collector = humanSource()
    await collector.connect({ conversationId: 'conv-1' })

    expect(collector.getAllSpans()).toEqual([
      expect.objectContaining({
        context: {},
        data: {
          endpoint: '/v2/cognitive/generate-text',
          'ai.model': 'openai:gpt-5',
          'ai.stop_reason': 'max_tokens',
          'autonomous.tool.name': 'search',
          'autonomous.tool.status': 'success',
          'workflow.name': 'answer',
          'error.name': 'TypeError',
          'error.code': 'BLOC_ITEM_INVALID',
          'error.message': "Cannot read properties of undefined (reading 'imageUrl')",
          'error.stack': 'TypeError: invalid bloc item\n    at Chat.transformMessage (src/runtime/chat/chat.ts:381:52)',
        },
      }),
    ])
    expect(JSON.stringify(collector.getAllSpans())).not.toContain('secret')
    expect(JSON.stringify(collector.getAllSpans())).not.toContain('raw prompt')
    expect(JSON.stringify(collector.getAllSpans())).not.toContain('must not cross')
    expect(JSON.stringify(collector.getAllSpans())).not.toContain('raw model')
    expect(JSON.stringify(collector.getAllSpans())).not.toContain('raw-secret-error')
  })

  it('enforces diagnostic limits in UTF-8 bytes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockResolvedValue(
        json({
          traces: [
            trace({
              metadata: {
                errorName: 'я'.repeat(64),
                errorCode: 'UNICODE_ERROR',
                errorMessage: '🙂'.repeat(2_049),
                errorStack: 'ё'.repeat(16_385),
              },
            }),
          ],
          meta: {},
        })
      )
    )

    const collector = humanSource()
    await collector.connect({ conversationId: 'conv-1' })

    expect(collector.getAllSpans()[0]?.data).toEqual({
      'error.name': 'я'.repeat(64),
      'error.code': 'UNICODE_ERROR',
    })
  })

  it('maps the server unset status to a locally running span', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(json({ traces: [trace({ status: 'unset', endedAt: undefined, metadata: {} })], meta: {} }))
    )

    const collector = humanSource()
    await collector.connect({ conversationId: 'conv-1' })

    expect(collector.getAllSpans()[0]?.status).toBe('running')
  })

  it('drops unsafe names and invalid IDs, normalizes valid IDs, and bounds duration', async () => {
    const traces = [
      trace({
        id: 'unsafe-name-row',
        name: 'private prompt copied into a label',
        traceId: '1123456789abcdef0123456789abcdef',
        spanId: '1123456789abcdef',
      }),
      trace({
        id: 'missing-id-row',
        traceId: undefined,
        spanId: undefined,
      }),
      trace({
        id: 'malformed-id-row',
        traceId: 'not-a-trace-id',
        spanId: 'not-a-span-id',
      }),
	  trace({
		id: 'zero-trace-row',
		traceId: '00000000000000000000000000000000',
		spanId: '1123456789abcdef',
	  }),
	  trace({
		id: 'zero-span-row',
		traceId: '1123456789abcdef0123456789abcdef',
		spanId: '0000000000000000',
	  }),
      trace({
        id: 'valid-row',
        traceId: 'ABCDEF0123456789ABCDEF0123456789',
        spanId: 'ABCDEF0123456789',
		parentSpanId: '0000000000000000',
        durationMs: 86_400_001,
      }),
    ]
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(json({ traces, meta: {} })))

    const collector = humanSource()
    await collector.connect({ conversationId: 'conv-1' })

    expect(collector.getAllSpans()).toEqual([
      expect.objectContaining({
        id: {
          trace: 'abcdef0123456789abcdef0123456789',
          span: 'abcdef0123456789',
          parent: null,
        },
        name: 'handler.conversation',
        label: 'handler.conversation',
        timing: expect.objectContaining({ duration: 125 }),
      }),
    ])
    const serialized = JSON.stringify(collector.getAllSpans())
    expect(serialized).not.toContain('private prompt')
    expect(serialized).not.toContain('missing-id-row')
    expect(serialized).not.toContain('malformed-id-row')
	expect(serialized).not.toContain('zero-trace-row')
	expect(serialized).not.toContain('zero-span-row')
  })

  it.each([
    [{ pat: '', workspaceId: '42', targetBotId: '7' }, /PAT/i],
    [{ pat: 'pat', workspaceId: 'ws_42', targetBotId: '7' }, /workspaceId.*positive decimal/i],
    [{ pat: 'pat', workspaceId: '42', targetBotId: 'dev_opaque' }, /targetBotId.*positive decimal/i],
  ])('rejects invalid authority config before polling: %j', (invalid, expected) => {
    expect(
      () =>
        new VortexSpanSource({
          url: 'https://vortex.example',
          pollIntervalMs: 1,
          ...invalid,
        })
    ).toThrow(expected)
  })

  it.each([
    [{ token: '', development: false }, /token/i],
    [{ token: 'token', development: true, runtimeBotId: '' }, /runtime bot/i],
    [{ token: 'token', development: true, runtimeBotId: '42' }, /opaque runtime bot/i],
    [{ token: 'token', development: true, runtimeBotId: 'invalid runtime id' }, /runtime bot/i],
  ] as const)('rejects invalid bot-scoped authority before polling: %j', (invalid, expected) => {
    expect(
      () =>
        new VortexSpanSource({
          mode: 'bot',
          url: 'https://vortex.example',
          pollIntervalMs: 1,
          ...invalid,
        } as ConstructorParameters<typeof VortexSpanSource>[0])
    ).toThrow(expected)
  })

  it('rejects malformed conversation correlation before polling', async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', fetchMock)

    await expect(botSource().connect({ conversationId: 'conversation with spaces' })).rejects.toThrow(
      /conversationId/i
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails loudly on a repeated nextToken without publishing a partial page', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ traces: [trace()], meta: { nextToken: 'loop' } }))
      .mockResolvedValueOnce(
        json({
          traces: [trace({ id: '2', spanId: '1123456789abcdef' })],
          meta: { nextToken: 'loop' },
        })
      )
    vi.stubGlobal('fetch', fetchMock)

    const collector = humanSource()
    await expect(collector.connect({ conversationId: 'conv-1' })).rejects.toThrow(/pagination.*loop/i)
    expect(collector.getAllSpans()).toEqual([])
  })

  it('fails loudly when a response exceeds the 10,000-row cap', async () => {
    const traces = Array.from({ length: 10_001 }, (_, index) =>
      trace({ id: String(index), spanId: index.toString(16).padStart(16, '0') })
    )
    vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockResolvedValue(json({ traces, meta: {} })))

    await expect(humanSource().connect({ conversationId: 'conv-1' })).rejects.toThrow(/10,000|10000/)
  })

  it('fails loudly instead of requesting an eleventh page', async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async () =>
      json({
        traces: [],
        meta: { nextToken: `page-${fetchMock.mock.calls.length + 1}` },
      })
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(humanSource().connect({ conversationId: 'conv-1' })).rejects.toThrow(/10 pages/i)
    expect(fetchMock).toHaveBeenCalledTimes(10)
  })
})
