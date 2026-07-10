import { SpanKind, SpanStatusCode, TraceFlags } from '@opentelemetry/api'
import { resourceFromAttributes } from '@opentelemetry/resources'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'

export function unsafeReadableSpan(overrides: Partial<ReadableSpan> = {}): ReadableSpan {
  return {
    name: 'cognitive.request',
    kind: SpanKind.CLIENT,
    spanContext: () => ({
      traceId: 'ABCDEF0123456789ABCDEF0123456789',
      spanId: 'ABCDEF0123456789',
      traceFlags: TraceFlags.SAMPLED,
    }),
    parentSpanContext: {
      traceId: 'ABCDEF0123456789ABCDEF0123456789',
      spanId: 'not-a-span-id',
      traceFlags: TraceFlags.SAMPLED,
    },
    startTime: [1, 2],
    endTime: [2, 3],
    duration: [1, 1],
    status: { code: SpanStatusCode.ERROR, message: 'secret upstream response body' },
    attributes: {
      'ai.model': 'openai/gpt-5.1-mini',
      'ai.provider': 'openai',
      'ai.messages_count': 4,
      'ai.input_tokens': 100,
      'ai.cost': 0.25,
      'action.type': 'generateContent',
      'ai.latency_ms': 125,
      'ai.instructions': 'private system prompt',
      'autonomous.tool.input': '{"creditCard":"4111111111111111"}',
      conversationId: 'conv-safe_123',
      userId: 'user-secret',
      messageId: 'message-secret',
      'session.id': 'session-secret',
      'http.url': 'https://example.test/private?q=secret',
      payload: '{"raw":"secret"}',
    },
    links: [
      {
        context: {
          traceId: '12345678901234567890123456789012',
          spanId: '1234567890123456',
          traceFlags: TraceFlags.SAMPLED,
        },
        attributes: { prompt: 'linked secret' },
      },
    ],
    events: [{ name: 'exception', time: [1, 3], attributes: { exception: 'raw secret error' } }],
    ended: true,
    resource: resourceFromAttributes({
      'service.name': 'private-bot-name',
      workspaceId: 'workspace-secret',
      botId: 'bot-secret',
    }),
    instrumentationScope: { name: 'private-runtime-scope', version: '1.2.3' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
    ...overrides,
  }
}
