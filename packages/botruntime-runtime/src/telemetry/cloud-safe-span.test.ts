import { SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { describe, expect, it, vi } from 'vitest'
import {
  CloudSafeSpanExporter,
  cloudTraceHeaders,
  resolveCloudTraceEnvironment,
  sanitizeCloudSpan,
} from './cloud-safe-span'
import { unsafeReadableSpan } from './cloud-safe-span.fixture'
import { registerSpanOmittedPayloads } from './trace-payloads'

describe('cloud-safe spans', () => {
  it('normalizes identifiers and exports the canonical span payload', () => {
    const safe = sanitizeCloudSpan(unsafeReadableSpan())

    expect(safe).not.toBeNull()
    expect(safe!.spanContext()).toMatchObject({
      traceId: 'abcdef0123456789abcdef0123456789',
      spanId: 'abcdef0123456789',
    })
    expect(safe!.parentSpanContext).toBeUndefined()
    expect(safe!.attributes).toEqual({
      'ai.model': 'openai/gpt-5.1-mini',
      'ai.provider': 'openai',
      'ai.messages_count': 4,
      'ai.input_tokens': 100,
      'ai.cost': 0.25,
      'ai.instructions': 'private system prompt',
      'ai.messages': '[{"role":"user","content":"developer trace message"}]',
      'ai.response': '{"text":"developer trace response"}',
      'ai.tools': '[{"name":"lookup_account"}]',
      conversationId: 'conv-safe_123',
      'error.kind': 'internal',
      'error.name': 'TypeError',
      'error.code': 'BLOC_ITEM_INVALID',
      'error.message': "Cannot read properties of undefined (reading 'imageUrl')",
      'error.stack': 'TypeError: invalid bloc item\n    at Chat.transformMessage (src/runtime/chat/chat.ts:381:52)',
    })
    expect(safe!.resource.attributes).toEqual({})
    expect(safe!.events).toEqual([])
    expect(safe!.links).toEqual([])
    expect(safe!.status).toEqual({ code: SpanStatusCode.ERROR })
    expect(safe!.instrumentationScope).toEqual({ name: 'brt.cloud' })
    expect(safe!.attributes).not.toHaveProperty('userId')
    expect(safe!.attributes).not.toHaveProperty('messageId')
  })

  it('projects standard exception events and status messages at the export boundary', () => {
    const fromException = sanitizeCloudSpan(
      unsafeReadableSpan({
        attributes: {},
        status: { code: SpanStatusCode.ERROR, message: 'fallback status' },
        events: [
          {
            name: 'exception',
            time: [1, 3],
            attributes: {
              'exception.type': 'RangeError',
              'exception.message': 'document index is out of range',
              'exception.stacktrace': 'RangeError: document index is out of range\n    at handler.ts:42:7',
            },
          },
        ],
      })
    )
    expect(fromException!.attributes).toEqual({
      'error.kind': 'internal',
      'error.name': 'RangeError',
      'error.code': 'RangeError',
      'error.message': 'document index is out of range',
      'error.stack': 'RangeError: document index is out of range\n    at handler.ts:42:7',
    })

    const fromStatus = sanitizeCloudSpan(
      unsafeReadableSpan({
        attributes: {},
        events: [],
        status: { code: SpanStatusCode.ERROR, message: 'workflow failed before callback' },
      })
    )
    expect(fromStatus!.attributes).toEqual({
      'error.kind': 'internal',
      'error.name': 'Error',
      'error.code': 'Error',
      'error.message': 'workflow failed before callback',
    })
  })

  it('keeps the canonical span schema while rejecting invalid transport structure', () => {
    expect(sanitizeCloudSpan(unsafeReadableSpan({ name: 'user.supplied.span' }))).toBeNull()
    expect(
      sanitizeCloudSpan(
        unsafeReadableSpan({
          spanContext: () => ({ traceId: 'bad', spanId: 'abcdef0123456789', traceFlags: TraceFlags.SAMPLED }),
        })
      )
    ).toBeNull()
    expect(
      sanitizeCloudSpan(
        unsafeReadableSpan({
          spanContext: () => ({
            traceId: '00000000000000000000000000000000',
            spanId: 'abcdef0123456789',
            traceFlags: TraceFlags.SAMPLED,
          }),
        })
      )
    ).toBeNull()
    expect(
      sanitizeCloudSpan(
        unsafeReadableSpan({
          spanContext: () => ({
            traceId: 'abcdef0123456789abcdef0123456789',
            spanId: '0000000000000000',
            traceFlags: TraceFlags.SAMPLED,
          }),
        })
      )
    ).toBeNull()

    const zeroParent = sanitizeCloudSpan(
      unsafeReadableSpan({
        parentSpanContext: {
          traceId: 'abcdef0123456789abcdef0123456789',
          spanId: '0000000000000000',
          traceFlags: TraceFlags.SAMPLED,
        },
      })
    )
    expect(zeroParent).not.toBeNull()
    expect(zeroParent!.parentSpanContext).toBeUndefined()
    const zeroParentTrace = sanitizeCloudSpan(
      unsafeReadableSpan({
        parentSpanContext: {
          traceId: '00000000000000000000000000000000',
          spanId: 'abcdef0123456789',
          traceFlags: TraceFlags.SAMPLED,
        },
      })
    )
    expect(zeroParentTrace).not.toBeNull()
    expect(zeroParentTrace!.parentSpanContext).toBeUndefined()
    expect(sanitizeCloudSpan(unsafeReadableSpan({ duration: [86_401, 0] }))).toBeNull()
    expect(sanitizeCloudSpan(unsafeReadableSpan({ kind: 99 as SpanKind }))).toBeNull()
    expect(sanitizeCloudSpan(unsafeReadableSpan({ status: { code: 99 as SpanStatusCode } }))).toBeNull()

    const safe = sanitizeCloudSpan(
      unsafeReadableSpan({
        attributes: {
          'ai.model': 'model with spaces',
          'ai.messages_count': 1_000_000_001,
          'ai.latency_ms': Number.POSITIVE_INFINITY,
          'ai.cost': -1,
          'action.type': 'arbitraryAction',
          conversationId: 'invalid conversation/raw',
          userId: 'user-must-never-cross',
          messageId: 'message-must-never-cross',
          'session.id': 'session-must-never-cross',
          'http.status_code': 99,
          'autonomous.status': 'raw secret status',
          'autonomous.tool.status': 'success',
          'error.kind': 'raw upstream error',
        },
        status: { code: SpanStatusCode.OK },
      })
    )

    expect(safe!.attributes).toEqual({
      'ai.model': 'model with spaces',
      'ai.messages_count': 1_000_000_001,
      'ai.cost': -1,
      'error.kind': 'raw upstream error',
    })
  })

  it('validates canonical correlation identifiers', () => {
    const valid = sanitizeCloudSpan(
      unsafeReadableSpan({
        attributes: {
          conversationId: `c${'a'.repeat(127)}`,
          userId: 'user-secret',
          messageId: 'message-secret',
          'session.id': 'session-secret',
        },
        status: { code: SpanStatusCode.OK },
      })
    )
    expect(valid!.attributes).toEqual({ conversationId: `c${'a'.repeat(127)}` })

    for (const conversationId of ['', 'contains spaces', 'https://example.test/conv', `c${'a'.repeat(128)}`]) {
      const invalid = sanitizeCloudSpan(
        unsafeReadableSpan({ attributes: { conversationId }, status: { code: SpanStatusCode.OK } })
      )
      expect(invalid!.attributes).toEqual({})
    }
  })

  it('keeps canonical handler correlation fields while dropping undeclared resource-like attributes', () => {
    const safe = sanitizeCloudSpan(
      unsafeReadableSpan({
        name: 'handler.conversation',
        attributes: {
          botId: 'bot_1',
          conversationId: 'conv_1',
          eventId: 'event_1',
          integration: 'telegram',
          channel: 'channel_1',
          'event.type': 'message_created',
          userId: 'user_1',
          messageId: 'message_1',
          'session.id': 'undeclared-session',
          'process.env': 'undeclared-environment',
        },
        status: { code: SpanStatusCode.OK },
      })
    )

    expect(safe!.attributes).toEqual({
      botId: 'bot_1',
      conversationId: 'conv_1',
      eventId: 'event_1',
      integration: 'telegram',
      channel: 'channel_1',
      'event.type': 'message_created',
      userId: 'user_1',
      messageId: 'message_1',
    })
  })

  it('keeps canonical tool input and output', () => {
    const safe = sanitizeCloudSpan(
      unsafeReadableSpan({
        name: 'autonomous.tool',
        attributes: {
          conversationId: 'conv_1',
          'autonomous.tool.name': 'lookup',
          'autonomous.tool.status': 'success',
          'autonomous.tool.input': '{"query":"customer"}',
          'autonomous.tool.output': '{"found":true}',
          'ai.instructions': 'not part of a tool span',
        },
        status: { code: SpanStatusCode.OK },
      })
    )

    expect(safe!.attributes).toEqual({
      conversationId: 'conv_1',
      'autonomous.tool.name': 'lookup',
      'autonomous.tool.status': 'success',
      'autonomous.tool.input': '{"query":"customer"}',
      'autonomous.tool.output': '{"found":true}',
    })
  })

  it('sanitizes every span before delegating to the OTLP exporter', async () => {
    const exportSpy = vi.fn<SpanExporter['export']>((spans, done) => {
      expect(spans).toHaveLength(1)
      expect(spans[0]!.attributes).toHaveProperty('ai.instructions', 'private system prompt')
      expect(spans[0]!.resource.attributes).toEqual({})
      done({ code: ExportResultCode.SUCCESS })
    })
    const delegate: SpanExporter = {
      export: exportSpy,
      forceFlush: vi.fn().mockResolvedValue(undefined),
      shutdown: vi.fn().mockResolvedValue(undefined),
    }
    const exporter = new CloudSafeSpanExporter(delegate)

    exporter.export(
      [unsafeReadableSpan(), unsafeReadableSpan({ name: 'unapproved.span' })],
      (result) => expect(result.code).toBe(ExportResultCode.SUCCESS)
    )
    await exporter.forceFlush()
    await exporter.shutdown()

    expect(exportSpy).toHaveBeenCalledOnce()
    expect(delegate.forceFlush).toHaveBeenCalledOnce()
    expect(delegate.shutdown).toHaveBeenCalledOnce()
  })

  it('derives only an omitted-payload count and never exports registry details', () => {
    const span = unsafeReadableSpan()
    span.attributes['payloads.omitted_count'] = 999
    registerSpanOmittedPayloads(span, [
      {
        key: 'ai.instructions.secret-key',
        reason: 'too_large',
        sizeBytes: 10_485_761,
        maxSizeBytes: 10_485_760,
      },
    ])

    const safe = sanitizeCloudSpan(span)

    expect(safe!.attributes['payloads.omitted_count']).toBe(1)
    expect(JSON.stringify(safe)).not.toContain('ai.instructions.secret-key')
    expect(JSON.stringify(safe)).not.toContain('too_large')
    expect(JSON.stringify(safe)).not.toContain('10485761')
  })

  it('uses the opaque runtime bot only for dev PAT ingestion and never sends workspace scope', () => {
    expect(
      cloudTraceHeaders({ token: 'pat-secret', development: true, runtimeBotId: 'dev_runtime:123' })
    ).toEqual({ Authorization: 'Bearer pat-secret', 'x-bot-id': 'dev_runtime:123' })
    expect(
      cloudTraceHeaders({
        token: 'api_key-secret',
        development: false,
        runtimeBotId: 'prod-runtime-is-not-an-extra-header',
      })
    ).toEqual({ Authorization: 'Bearer api_key-secret' })
    expect(() => cloudTraceHeaders({ token: 'pat-secret', development: true })).toThrow(/runtime bot/i)
    expect(() =>
      cloudTraceHeaders({ token: 'pat-secret', development: true, runtimeBotId: 'invalid runtime id' })
    ).toThrow(/runtime bot/i)
    expect(() => cloudTraceHeaders({ token: 'pat-secret', development: true, runtimeBotId: '42' })).toThrow(
      /opaque runtime bot/i
    )
    expect(() => cloudTraceHeaders({ development: true, runtimeBotId: 'dev_runtime:123' })).toThrow(/token/i)
  })

  it('resolves cloud coordinates from BP first with ADK compatibility fallback', () => {
    expect(
      resolveCloudTraceEnvironment({
        BP_API_URL: 'https://bp.example',
        ADK_API_URL: 'https://adk.example',
        BP_TOKEN: 'bp-token',
        ADK_TOKEN: 'adk-token',
        BP_BOT_ID: 'dev_bp',
        ADK_BOT_ID: 'dev_adk',
      })
    ).toEqual({ apiUrl: 'https://bp.example', token: 'bp-token', runtimeBotId: 'dev_bp' })
    expect(
      resolveCloudTraceEnvironment({
        ADK_API_URL: 'https://adk.example',
        ADK_TOKEN: 'adk-token',
        ADK_BOT_ID: 'dev_adk',
      })
    ).toEqual({ apiUrl: 'https://adk.example', token: 'adk-token', runtimeBotId: 'dev_adk' })
  })
})
