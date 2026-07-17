import { context, defaultTextMapSetter, trace, type Span } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'

const propagator = new W3CTraceContextPropagator()

export function shouldPropagateTraceContext(enabled: boolean, isFirstParty: boolean): boolean {
  return enabled && isFirstParty
}

export function propagationHeadersForSpan(span: Span): Record<string, string> {
  const carrier: Record<string, string> = {}
  propagator.inject(trace.setSpan(context.active(), span), carrier, defaultTextMapSetter)
  return carrier
}
