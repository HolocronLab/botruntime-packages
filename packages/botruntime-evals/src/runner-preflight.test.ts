import type { Client as BpClient } from '@holocronlab/botruntime-client'
import type { SignalListener, Signals } from '@holocronlab/botruntime-chat'
import { CognitiveBeta } from '@holocronlab/botruntime-cognitive'
import { describe, expect, it, vi } from 'vitest'
import type { EvalDefinition, Span, SpanSource, SpanSourceCapabilities } from './types'
import type { ChatClient } from './types'
import {
  isPartialEvalSuiteAbort,
  runEval,
  runEvalSuite,
  validateEvalCapabilities,
  validateEvalControlCapabilities,
} from './runner'

function completedHandler(): Span {
  return {
    id: {
      trace: '0123456789abcdef0123456789abcdef',
      span: '0123456789abcdef',
      parent: null,
    },
    name: 'handler.conversation',
    label: 'handler.conversation',
    status: 'ok',
    timing: { startedAt: 1, endedAt: 2, duration: 1 },
    context: {},
    tier: 'standard',
    data: {},
    resource: { environment: 'production', versions: {} },
  }
}

function spanSource(overrides: Partial<SpanSource> = {}): SpanSource {
  return {
    capabilities: { toolParameters: false, stateMutations: false },
    assertReadable: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    repoint: vi.fn().mockResolvedValue(undefined),
    startTurn: vi.fn(),
    waitForTurnComplete: vi.fn().mockResolvedValue(undefined),
    waitForWorkflow: vi.fn().mockResolvedValue(undefined),
    getTurnSpans: vi.fn(() => [completedHandler()]),
    getAllSpans: vi.fn(() => [completedHandler()]),
    disconnect: vi.fn(),
    ...overrides,
  }
}

function chatHarness(response = 'listener response') {
  let onMessage: ((message: Signals['message_created']) => void) | undefined
  const listener = {
    on: vi.fn((event: string, handler: (message: Signals['message_created']) => void) => {
      if (event === 'message_created') onMessage = handler
    }),
    off: vi.fn(),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }
  const authenticatedClient = {
    user: { id: 'user-1' },
    createConversation: vi.fn().mockResolvedValue({ conversation: { id: 'conv-1' } }),
    listenConversation: vi.fn().mockResolvedValue(listener as unknown as SignalListener),
    createMessage: vi.fn(async () => {
      onMessage?.({
        id: 'bot-message-1',
        createdAt: '2026-07-10T10:00:00.000Z',
        payload: { type: 'text', text: response },
        userId: 'bot',
        conversationId: 'conv-1',
        isBot: true,
      })
      return {}
    }),
    createEvent: vi.fn().mockResolvedValue({}),
  }
  const chatClient = {
    connect: vi.fn().mockResolvedValue(authenticatedClient),
  } as unknown as ChatClient
  return { authenticatedClient, chatClient }
}

const basicEval: EvalDefinition = {
  name: 'listener-observation',
  conversation: [
    {
      user: 'hello',
      assert: { response: [{ contains: 'listener response' }] },
    },
  ],
}

const cloudCapabilities: SpanSourceCapabilities = {
  toolParameters: false,
  stateMutations: false,
}
const localCapabilities: SpanSourceCapabilities = {
  toolParameters: true,
  stateMutations: true,
}

function validSuiteClient(): BpClient {
  return {
    constructor: function TestClient() {},
    callAction: vi.fn(),
    config: {
      apiUrl: 'https://api.example',
      headers: {
        'x-bot-id': 'runtime-bot',
        Authorization: 'Bearer runtime-token',
      },
    },
  } as unknown as BpClient
}

const quietLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

describe('eval observation capability preflight', () => {
  it('does not downgrade a complete suite when abort arrives after the final eval', () => {
    const controller = new AbortController()
    controller.abort()

    expect(isPartialEvalSuiteAbort(controller.signal, [{}], 1)).toBe(false)
    expect(isPartialEvalSuiteAbort(controller.signal, [{}], 2)).toBe(true)
    expect(isPartialEvalSuiteAbort(controller.signal, [{ errorCode: 'EVAL_ABORTED' }], 1)).toBe(true)
  })

  it.each([
    [
      {
        name: 'tool-input',
        conversation: [
          {
            user: 'x',
            assert: { tools: [{ called: 'search', params: { q: 'private' } }] },
          },
        ],
      },
      /tool parameter/i,
    ],
    [
      {
        name: 'turn-state',
        conversation: [
          {
            user: 'x',
            assert: {
              state: [{ path: 'conversation.private', changed: true }],
            },
          },
        ],
      },
      /state assertion/i,
    ],
    [
      {
        name: 'outcome-state',
        conversation: [{ user: 'x' }],
        outcome: { state: [{ path: 'user.private', equals: true }] },
      },
      /state assertion/i,
    ],
  ] as const)('rejects unsupported assertions before creating a chat session', (definition, message) => {
    expect(() => validateEvalCapabilities([definition as unknown as EvalDefinition], cloudCapabilities)).toThrow(
      message
    )
  })

  it('keeps safe tool name assertions available', () => {
    expect(() =>
      validateEvalCapabilities(
        [
          {
            name: 'safe-tools',
            conversation: [
              {
                user: 'x',
                assert: {
                  tools: [{ called: 'search' }, { not_called: 'delete' }, { call_order: ['search', 'answer'] }],
                },
              },
            ],
          },
        ],
        cloudCapabilities
      )
    ).not.toThrow()
  })

  it('rejects virtual time, faults, and parallel input before side effects when the host has no eval control', () => {
    const definition: EvalDefinition = {
      name: 'controlled',
      conversation: [
        {
          parallel: [{ message: 'a' }, { message: 'b' }],
          control: {
            advanceClock: { milliseconds: 72 * 60 * 60 * 1000 },
            faults: [{ point: 'workflow.after_dispatch' }],
          },
        },
      ],
    }
    expect(() => validateEvalControlCapabilities([definition], undefined)).toThrow(/eval control/i)
  })

  it('preserves tool-parameter and state assertions for rich local span sources', () => {
    expect(() =>
      validateEvalCapabilities(
        [
          {
            name: 'local-rich',
            conversation: [
              {
                user: 'x',
                assert: {
                  tools: [{ called: 'search', params: { q: 'private' } }],
                  state: [{ path: 'conversation.private', changed: true }],
                },
              },
            ],
            outcome: { state: [{ path: 'user.private', equals: true }] },
          },
        ],
        localCapabilities
      )
    ).not.toThrow()
  })

  it('rejects undeclared tool output assertion syntax even when local payloads are rich', () => {
    const definition = {
      name: 'unsupported-output-syntax',
      conversation: [
        {
          user: 'x',
          assert: {
            tools: [{ called: 'search', output: { contains: 'secret' } }],
          },
        },
      ],
    } as unknown as EvalDefinition

    expect(() => validateEvalCapabilities([definition], localCapabilities)).toThrow(/tool input\/output/i)
  })

  it('fails trace-reader auth before listener or message mutations in direct runEval', async () => {
    const readerError = new Error('Vortex trace reader failed with HTTP 403')
    const source = spanSource({
      assertReadable: vi.fn().mockRejectedValue(readerError),
    })
    const { authenticatedClient, chatClient } = chatHarness()

    await expect(
      runEval(
        basicEval,
        { client: {} as BpClient, botId: 'runtime-bot' },
        {
          spanSource: source,
          chatClient,
          chatWebhookId: 'webhook',
        }
      )
    ).rejects.toThrow(/HTTP 403/)

    expect(chatClient.connect).not.toHaveBeenCalled()
    expect(authenticatedClient.listenConversation).not.toHaveBeenCalled()
    expect(authenticatedClient.createMessage).not.toHaveBeenCalled()
  })

  it('uses message_created bot payloads for response grading when cloud traces contain no response content', async () => {
    const source = spanSource()
    const { authenticatedClient, chatClient } = chatHarness()

    const report = await runEval(
      basicEval,
      { client: {} as BpClient, botId: 'runtime-bot' },
      {
        spanSource: source,
        chatClient,
        chatWebhookId: 'webhook',
      }
    )

    expect(report.error).toBeUndefined()
    expect(report.turns[0]).toMatchObject({
      botResponse: 'listener response',
      pass: true,
      conversationId: 'conv-1',
      traceId: '0123456789abcdef0123456789abcdef',
    })
    expect(authenticatedClient.createMessage).toHaveBeenCalledOnce()
    expect(source.disconnect).toHaveBeenCalledOnce()
  })

  it('returns safe execution diagnostics when a turn fails before traces are available', async () => {
    const source = spanSource()
    const { authenticatedClient, chatClient } = chatHarness()
    authenticatedClient.createMessage.mockImplementationOnce(async () => {
      const listener = await authenticatedClient.listenConversation.mock.results[0]?.value
      void listener
      throw Object.assign(new Error('invalid response payload'), {
        code: 'CHAT_PAYLOAD_INVALID',
        expected: true,
      })
    })

    const report = await runEval(
      basicEval,
      { client: {} as BpClient, botId: 'runtime-bot' },
      {
        spanSource: source,
        chatClient,
        chatWebhookId: 'webhook',
      }
    )

    expect(report).toMatchObject({
      pass: false,
      diagnostic: {
        code: 'EVAL_INTERNAL',
        phase: 'dispatch',
        turnIndex: 0,
        conversationId: 'conv-1',
      },
    })
    expect(report.diagnostic).not.toHaveProperty('message')
  })

  it('resolves attachments before the turn and sends no signed URL to progress or reports', async () => {
    const source = spanSource()
    const { authenticatedClient, chatClient } = chatHarness()
    const onProgress = vi.fn()
    const resolveFixture = vi.fn().mockResolvedValue({
      fixture: 'ddu-valid',
      name: 'D.pdf',
      contentType: 'application/pdf',
      url: 'https://signed.example/file?token=secret',
      size: 42,
      sha256: 'a'.repeat(64),
    })

    const report = await runEval(
      {
        name: 'attachment',
        conversation: [{ user: 'document', attachments: [{ fixture: 'ddu-valid' }] }],
      },
      { client: {} as BpClient, botId: 'runtime-bot' },
      {
        spanSource: source,
        chatClient,
        chatWebhookId: 'webhook',
        resolveFixture,
        onProgress,
      }
    )

    expect(resolveFixture).toHaveBeenCalledWith('ddu-valid', expect.objectContaining({ botId: 'runtime-bot' }))
    expect(authenticatedClient.createMessage).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      payload: {
        type: 'bloc',
        items: [
          { type: 'text', text: 'document' },
          {
            type: 'file',
            fileUrl: 'https://signed.example/file?token=secret',
            title: 'D.pdf',
          },
        ],
      },
    })
    expect(JSON.stringify({ report, progress: onProgress.mock.calls })).not.toContain('signed.example')
    expect(JSON.stringify({ report, progress: onProgress.mock.calls })).not.toContain('token=secret')
    expect(report.turns[0]?.userMessage).toContain('ddu-valid')
  })

  it('routes a named actor to a linked conversation and grades relay to the primary client', async () => {
    const source = spanSource()
    const { chatClient } = chatHarness()
    const messages = new Map<string, any[]>([
      ['conv-1', []],
      ['hitl-1', []],
    ])
    const client = {
      listConversations: vi.fn().mockResolvedValue({
        conversations: [
          {
            id: 'hitl-1',
            tags: { root: 'conv-1' },
            properties: { mode: 'manual' },
          },
        ],
      }),
      createUser: vi.fn().mockResolvedValue({ user: { id: 'operator-user' } }),
      createMessage: vi.fn(async () => {
        messages.get('conv-1')!.push({
          id: 'relay-1',
          direction: 'outgoing',
          payload: { type: 'text', text: 'manual reply' },
        })
        return {}
      }),
      listMessages: vi.fn(async ({ conversationId }: { conversationId: string }) => ({
        messages: [...(messages.get(conversationId) ?? [])],
        meta: {},
      })),
      getConversation: vi.fn().mockResolvedValue({
        conversation: {
          id: 'hitl-1',
          tags: {},
          properties: { mode: 'manual' },
        },
      }),
    } as unknown as BpClient

    const report = await runEval(
      {
        name: 'hitl-relay',
        setup: {
          relations: { hitl_thread: { tags: { root: '$conversationId' } } },
        },
        conversation: [
          {
            actor: 'operator',
            target: { relation: 'hitl_thread' },
            message: 'manual reply',
            expectSilence: true,
            assert: {
              deliveredTo: 'client',
              conversationMode: { target: 'hitl_thread', equals: 'manual' },
            },
          },
        ],
      },
      { client, botId: 'runtime-bot' },
      { spanSource: source, chatClient, chatWebhookId: 'webhook' }
    )

    expect(report).toMatchObject({ pass: true })
    expect(report.turns[0]).toMatchObject({
      actor: 'operator',
      target: 'hitl_thread',
      pass: true,
    })
    expect(client.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        origin: 'synthetic',
        conversationId: 'hitl-1',
        userId: 'operator-user',
      })
    )
    expect(source.repoint).toHaveBeenCalledWith({ conversationId: 'hitl-1' })
  })

  it('applies isolated controls and emits parallel same-conversation inputs together', async () => {
    const source = spanSource()
    const { authenticatedClient, chatClient } = chatHarness()
    const evalControl = {
      advanceClock: vi.fn().mockResolvedValue({
        virtualNow: '2026-07-20T00:00:00Z',
        releasedJobs: 2,
      }),
      configureFaults: vi.fn().mockResolvedValue(undefined),
      clearFaults: vi.fn().mockResolvedValue(undefined),
    }
    const report = await runEval(
      {
        name: 'race',
        conversation: [
          {
            parallel: [{ message: 'first' }, { message: 'duplicate' }],
            control: {
              advanceClock: { milliseconds: 1_000, runDueWorkflows: true },
              faults: [
                {
                  point: 'workflow.after_dispatch',
                  mode: 'lost_ack',
                  times: 1,
                },
              ],
            },
          },
        ],
      },
      { client: {} as BpClient, botId: 'runtime-bot' },
      { spanSource: source, chatClient, chatWebhookId: 'webhook', evalControl }
    )

    expect(report.error).toBeUndefined()
    expect(authenticatedClient.createMessage).toHaveBeenCalledTimes(2)
    expect(evalControl.configureFaults).toHaveBeenCalledOnce()
    expect(evalControl.advanceClock).toHaveBeenCalledWith({
      milliseconds: 1_000,
      runDueWorkflows: true,
    })
    expect(evalControl.clearFaults).toHaveBeenCalledOnce()
  })

  it('returns a typed safe diagnostic when isolated eval control fails', async () => {
    const source = spanSource()
    const { chatClient } = chatHarness()
    const evalControl = {
      advanceClock: vi.fn().mockRejectedValue(new Error('upstream body with customer secret')),
      configureFaults: vi.fn().mockResolvedValue(undefined),
      clearFaults: vi.fn().mockResolvedValue(undefined),
    }

    const report = await runEval(
      {
        name: 'clock-failure',
        conversation: [
          {
            message: 'continue',
            control: { advanceClock: { milliseconds: 1_000, runDueWorkflows: true } },
          },
        ],
      },
      { client: {} as BpClient, botId: 'runtime-bot' },
      { spanSource: source, chatClient, chatWebhookId: 'webhook', evalControl }
    )

    expect(report).toMatchObject({
      pass: false,
      error: 'Eval control operation advance_clock failed.',
      errorCode: 'EVAL_CONTROL_FAILED',
      diagnostic: {
        code: 'EVAL_CONTROL_FAILED',
        phase: 'dispatch',
        turnIndex: 0,
        conversationId: 'conv-1',
      },
    })
    expect(JSON.stringify(report)).not.toContain('customer secret')
  })

  it('propagates turn-complete progress sink failures from both runEval and runEvalSuite', async () => {
    const sinkError = new Error('hosted persistence failed')
    const failTurnComplete = async (event: { type: string }) => {
      if (event.type === 'turn_complete') throw sinkError
    }

    const directSource = spanSource()
    const directChat = chatHarness()
    await expect(
      runEval(
        basicEval,
        { client: {} as BpClient, botId: 'runtime-bot' },
        {
          spanSource: directSource,
          chatClient: directChat.chatClient,
          chatWebhookId: 'webhook',
          onProgress: failTurnComplete,
        }
      )
    ).rejects.toBe(sinkError)
    expect(directSource.disconnect).toHaveBeenCalledOnce()

    vi.spyOn(CognitiveBeta.prototype, 'listModels').mockResolvedValue([])
    const suiteSource = spanSource()
    const suiteChat = chatHarness()

    await expect(
      runEvalSuite({
        client: validSuiteClient(),
        botId: 'runtime-bot',
        definitions: [basicEval],
        createSpanSource: () => suiteSource,
        sourcePreflighted: true,
        chatClient: suiteChat.chatClient,
        chatWebhookId: 'webhook',
        onProgress: failTurnComplete,
        logger: quietLogger,
      })
    ).rejects.toBe(sinkError)
    expect(suiteSource.disconnect).toHaveBeenCalled()
  })

  it('marks a mid-turn aborted eval explicitly, including when it is the last selected eval', async () => {
    const directController = new AbortController()
    const directSource = spanSource({
      waitForTurnComplete: vi.fn(async () => {
        directController.abort()
        throw new Error('wait aborted')
      }),
    })
    const directChat = chatHarness()

    const directReport = await runEval(
      basicEval,
      { client: {} as BpClient, botId: 'runtime-bot' },
      {
        spanSource: directSource,
        chatClient: directChat.chatClient,
        chatWebhookId: 'webhook',
        signal: directController.signal,
      }
    )
    expect(directReport).toMatchObject({
      pass: false,
      errorCode: 'EVAL_ABORTED',
    })

    vi.spyOn(CognitiveBeta.prototype, 'listModels').mockResolvedValue([])
    const suiteController = new AbortController()
    const suiteSource = spanSource({
      waitForTurnComplete: vi.fn(async () => {
        suiteController.abort()
        throw new Error('wait aborted')
      }),
    })
    const suiteChat = chatHarness()
    const suiteReport = await runEvalSuite({
      client: validSuiteClient(),
      botId: 'runtime-bot',
      definitions: [basicEval],
      createSpanSource: () => suiteSource,
      sourcePreflighted: true,
      chatClient: suiteChat.chatClient,
      chatWebhookId: 'webhook',
      signal: suiteController.signal,
      logger: quietLogger,
    })

    expect(suiteReport.aborted).toBe(true)
    expect(suiteReport.evals).toHaveLength(1)
    expect(suiteReport.evals[0]?.errorCode).toBe('EVAL_ABORTED')
  })

  it('keeps a suite complete when the signal fires only after the last eval completed', async () => {
    vi.spyOn(CognitiveBeta.prototype, 'listModels').mockResolvedValue([])
    const controller = new AbortController()
    const source = spanSource()
    const { chatClient } = chatHarness()

    const report = await runEvalSuite({
      client: validSuiteClient(),
      botId: 'runtime-bot',
      definitions: [basicEval],
      createSpanSource: () => source,
      sourcePreflighted: true,
      chatClient,
      chatWebhookId: 'webhook',
      signal: controller.signal,
      logger: quietLogger,
      onProgress: (event) => {
        if (event.type === 'eval_complete') controller.abort()
      },
    })

    expect(report.evals).toHaveLength(1)
    expect(report.evals[0]?.errorCode).toBeUndefined()
    expect(report.aborted).toBeUndefined()
  })

  it('preflights a suite source before initializing any chat session', async () => {
    const source = spanSource({
      assertReadable: vi.fn().mockRejectedValue(new Error('HTTP 404 foreign scope')),
    })
    const { authenticatedClient, chatClient } = chatHarness()

    await expect(
      runEvalSuite({
        client: {} as BpClient,
        botId: 'runtime-bot',
        definitions: [basicEval],
        createSpanSource: () => source,
        chatClient,
        chatWebhookId: 'webhook',
      })
    ).rejects.toThrow(/HTTP 404/)

    expect(chatClient.connect).not.toHaveBeenCalled()
    expect(authenticatedClient.createMessage).not.toHaveBeenCalled()
  })

  it('lets a durable host checkpoint each complete eval including its progress side effects', async () => {
    vi.spyOn(CognitiveBeta.prototype, 'listModels').mockResolvedValue([])
    const source = spanSource()
    const progress: string[] = []
    const checkpointEval = vi.fn(
      async ({
        definition,
        index,
      }: {
        definition: EvalDefinition
        index: number
        execute: () => Promise<unknown>
      }) => ({
        name: definition.name,
        turns: [],
        outcomeAssertions: [],
        pass: true,
        duration: index + 1,
      })
    )

    const report = await runEvalSuite({
      client: validSuiteClient(),
      botId: 'runtime-bot',
      definitions: [basicEval],
      createSpanSource: () => source,
      sourcePreflighted: true,
      chatClient: chatHarness().chatClient,
      chatWebhookId: 'webhook',
      logger: quietLogger,
      checkpointEval,
      onProgress: (event) => {
        progress.push(event.type)
      },
    })

    expect(checkpointEval).toHaveBeenCalledOnce()
    expect(report).toMatchObject({ passed: 1, failed: 0, total: 1 })
    expect(progress).toEqual(['suite_start', 'suite_complete'])
  })

  it('validates only filtered definitions before reader preflight', async () => {
    const source = spanSource({
      assertReadable: vi.fn().mockRejectedValue(new Error('reader-preflight-marker')),
    })
    const unsupported: EvalDefinition = {
      name: 'unselected-unsupported',
      conversation: [{ user: 'x', assert: { state: [{ path: 'private', changed: true }] } }],
    }

    await expect(
      runEvalSuite(
        {
          client: {} as BpClient,
          botId: 'runtime-bot',
          definitions: [basicEval, unsupported],
          createSpanSource: () => source,
        },
        { names: [basicEval.name] }
      )
    ).rejects.toThrow(/reader-preflight-marker/)

    expect(source.assertReadable).toHaveBeenCalledOnce()
  })

  it('rejects unsupported selected definitions before reader or chat side effects', async () => {
    const source = spanSource()
    const { chatClient } = chatHarness()
    const unsupported: EvalDefinition = {
      name: 'selected-unsupported',
      conversation: [{ user: 'x', assert: { state: [{ path: 'private', changed: true }] } }],
    }

    await expect(
      runEvalSuite({
        client: {} as BpClient,
        botId: 'runtime-bot',
        definitions: [unsupported],
        createSpanSource: () => source,
        chatClient,
      })
    ).rejects.toMatchObject({ code: 'EVAL_OBSERVATION_UNSUPPORTED' })

    expect(source.assertReadable).not.toHaveBeenCalled()
    expect(chatClient.connect).not.toHaveBeenCalled()
  })

  it('does not repeat reader auth after a trusted host already preflighted before createRun', async () => {
    const source = spanSource()

    await expect(
      runEvalSuite({
        client: {} as BpClient,
        botId: 'runtime-bot',
        definitions: [basicEval],
        createSpanSource: () => source,
        sourcePreflighted: true,
      })
    ).rejects.toThrow(/valid instance/i)

    expect(source.assertReadable).not.toHaveBeenCalled()
    expect(source.disconnect).toHaveBeenCalledOnce()
  })
})
