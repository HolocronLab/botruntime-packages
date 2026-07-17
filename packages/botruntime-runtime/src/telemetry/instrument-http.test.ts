import { trace, TraceFlags } from '@opentelemetry/api'
import { describe, expect, it } from 'vitest'
import { propagationHeadersForSpan, shouldPropagateTraceContext } from './trace-propagation'

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

  it('propagates internal trace context only to first-party runtime endpoints', () => {
    expect(shouldPropagateTraceContext(true, true)).toBe(true)
    expect(shouldPropagateTraceContext(true, false)).toBe(false)
    expect(shouldPropagateTraceContext(false, true)).toBe(false)
  })
})
