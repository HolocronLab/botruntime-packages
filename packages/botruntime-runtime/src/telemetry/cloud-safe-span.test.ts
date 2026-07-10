import { SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import type { SpanExporter } from '@opentelemetry/sdk-trace-base'
import { describe, expect, it, vi } from 'vitest'
import {
  CloudSafeSpanExporter,
  CLOUD_SAFE_ATTRIBUTE_KEYS,
  cloudTraceHeaders,
  resolveCloudTraceEnvironment,
  sanitizeCloudSpan,
} from './cloud-safe-span'
import { unsafeReadableSpan } from './cloud-safe-span.fixture'
import { registerSpanOmittedPayloads } from './trace-payloads'

describe('cloud-safe spans', () => {
  it('normalizes identifiers and exports only validated safe metadata', () => {
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
      'action.type': 'generateContent',
      'ai.latency_ms': 125,
      conversationId: 'conv-safe_123',
      'error.kind': 'internal',
    })
    expect(safe!.resource.attributes).toEqual({})
    expect(safe!.events).toEqual([])
    expect(safe!.links).toEqual([])
    expect(safe!.status).toEqual({ code: SpanStatusCode.ERROR })
    expect(safe!.instrumentationScope).toEqual({ name: 'brt.cloud-safe' })
    expect(JSON.stringify(safe)).not.toContain('secret')
  })

  it('drops unsupported span names, invalid ids, values outside bounds, and raw-looking strings', () => {
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

    expect(safe!.attributes).toEqual({ 'autonomous.tool.status': 'success' })
  })

  it('keeps only validated conversation correlation as transport-only data', () => {
    expect(CLOUD_SAFE_ATTRIBUTE_KEYS.has('conversationId')).toBe(false)
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

  it('sanitizes every span before delegating to the OTLP exporter', async () => {
    const exportSpy = vi.fn<SpanExporter['export']>((spans, done) => {
      expect(spans).toHaveLength(1)
      expect(spans[0]!.attributes).not.toHaveProperty('ai.instructions')
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
