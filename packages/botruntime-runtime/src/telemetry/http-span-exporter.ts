/**
 * HttpSpanExporter — sends raw OTEL span data to the CLI over HTTP.
 *
 * Implements the SpanProcessor interface. Fire-and-forget fetch calls
 * so we never block the runtime's span processing pipeline. Shares the
 * `postJsonToCli` transport with HttpLogExporter.
 */

import type { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { Context } from '@opentelemetry/api'
import { hrTimeToNanoseconds } from '@opentelemetry/core'
import { postJsonToCli } from './cli-transport'
import { getSpanOmittedPayloads, getSpanPayloads } from './trace-payloads'

function serializeSpan(span: ReadableSpan, type: 'start' | 'end'): string {
  const ctx = span.spanContext()

  const record: Record<string, unknown> = {
    type,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: span.kind,
    startNs: hrTimeToNanoseconds(span.startTime),
    resource: span.resource.attributes,
    attrs: span.attributes,
  }

  const payloads = getSpanPayloads(span)
  if (payloads.length > 0) {
    record.payloads = payloads
  }

  const omittedPayloads = getSpanOmittedPayloads(span)
  if (omittedPayloads.length > 0) {
    record.omittedPayloads = omittedPayloads
  }

  if (type === 'end') {
    record.endNs = hrTimeToNanoseconds(span.endTime)
    record.durationNs = hrTimeToNanoseconds(span.duration)
    record.status = { code: span.status.code, msg: span.status.message ?? null }
    record.events = span.events.map((e) => ({
      name: e.name,
      timeNs: hrTimeToNanoseconds(e.time),
      attrs: e.attributes,
    }))
    record.links = span.links.map((l) => ({
      traceId: l.context.traceId,
      spanId: l.context.spanId,
      attrs: l.attributes,
    }))
  }

  return JSON.stringify(record)
}

export class HttpSpanExporter implements SpanProcessor {
  private cliUrl: string

  constructor(cliUrl: string) {
    this.cliUrl = cliUrl.replace(/\/$/, '')
  }

  onStart(span: ReadableSpan, _ctx: Context): void {
    try {
      postJsonToCli(this.cliUrl, '/v1/traces', serializeSpan(span, 'start'))
    } catch {
      // Silent
    }
  }

  onEnd(span: ReadableSpan): void {
    try {
      postJsonToCli(this.cliUrl, '/v1/traces', serializeSpan(span, 'end'))
    } catch {
      // Silent
    }
  }

  async forceFlush(): Promise<void> {
    // Fire-and-forget — nothing to flush
  }

  async shutdown(): Promise<void> {
    // Nothing to clean up
  }
}
