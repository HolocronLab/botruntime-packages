import { context, defaultTextMapSetter, trace, type Span } from '@opentelemetry/api'
import { W3CTraceContextPropagator } from '@opentelemetry/core'

const propagator = new W3CTraceContextPropagator()

export function tracePropagationOrigin(apiUrl: string | undefined): string | undefined {
  if (!apiUrl) return undefined
  try {
    return new URL(apiUrl).origin
  } catch {
    return undefined
  }
}

export function shouldPropagateTraceContext(
  enabled: boolean,
  requestUrl: string,
  configuredOrigin: string | undefined
): boolean {
  if (!enabled || !configuredOrigin) return false
  try {
    return new URL(requestUrl).origin === configuredOrigin
  } catch {
    return false
  }
}

export function propagationHeadersForSpan(span: Span): Record<string, string> {
  const carrier: Record<string, string> = {}
  propagator.inject(trace.setSpan(context.active(), span), carrier, defaultTextMapSetter)
  return carrier
}
