import { trace, TraceFlags } from '@opentelemetry/api'
import { describe, expect, it } from 'vitest'
import {
  propagationHeadersForSpan,
  shouldPropagateTraceContext,
  tracePropagationOrigin,
} from './trace-propagation'

describe('HTTP trace propagation', () => {
  it('injects the actual client span context instead of an unrelated random trace', () => {
    const span = trace.wrapSpanContext({
      traceId: '0123456789abcdef0123456789abcdef',
      spanId: '0123456789abcdef',
      traceFlags: TraceFlags.SAMPLED,
      isRemote: false,
    })

    expect(propagationHeadersForSpan(span)).toEqual({
      traceparent: '00-0123456789abcdef0123456789abcdef-0123456789abcdef-01',
    })
  })

  it('propagates only to the exact configured platform API origin', () => {
    const production = tracePropagationOrigin('https://api.botruntime.ru/v1')
    const custom = tracePropagationOrigin('https://api.example.test/platform')
    const local = tracePropagationOrigin('http://127.0.0.1:8080/v1')

    expect(shouldPropagateTraceContext(true, 'https://api.botruntime.ru/v1/chat/actions', production)).toBe(true)
    expect(shouldPropagateTraceContext(true, 'https://api.example.test/v1/chat/actions', custom)).toBe(true)
    expect(shouldPropagateTraceContext(true, 'http://127.0.0.1:8080/v1/chat/actions', local)).toBe(true)
    expect(shouldPropagateTraceContext(true, 'https://provider.example/v1/generate', production)).toBe(false)
    expect(shouldPropagateTraceContext(true, 'https://api.botruntime.ru.evil.test/v1/chat/actions', production)).toBe(
      false
    )
    expect(shouldPropagateTraceContext(false, 'https://api.botruntime.ru/v1/chat/actions', production)).toBe(false)
    expect(shouldPropagateTraceContext(true, 'not a URL', production)).toBe(false)
    expect(shouldPropagateTraceContext(true, 'https://api.botruntime.ru/v1/chat/actions', undefined)).toBe(false)
  })
})
