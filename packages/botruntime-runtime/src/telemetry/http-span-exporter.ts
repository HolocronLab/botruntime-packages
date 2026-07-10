/**
 * HttpSpanExporter — sends local-only observation data to the CLI over HTTP.
 *
 * onStart/onEnd stay non-blocking, while forceFlush/shutdown can reliably drain
 * the tracked requests. Every request has a hard five-second deadline.
 */

import type { SpanProcessor, ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { Context } from '@opentelemetry/api'
import { hrTimeToNanoseconds } from '@opentelemetry/core'
import { postJsonToCli } from './cli-transport'
import { getSpanOmittedPayloads, getSpanPayloads, type TracePayload } from './trace-payloads'

const EXPORT_TIMEOUT_MS = 5_000
const MAX_LOCAL_PAYLOAD_ENTRIES = 16
const MAX_LOCAL_PAYLOAD_BYTES = 1 * 1024 * 1024
const MAX_LOCAL_EXPORT_BODY_BYTES = 4 * 1024 * 1024
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])
const encoder = new TextEncoder()

function loopbackOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('HttpSpanExporter requires a valid loopback URL')
  }

  if (url.protocol !== 'http:') {
    throw new Error('HttpSpanExporter requires plain HTTP on the loopback interface')
  }
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error('HttpSpanExporter requires localhost, 127.0.0.1, or ::1')
  }
  if (!url.port) {
    throw new Error('HttpSpanExporter requires an explicit loopback port')
  }
  if (url.username || url.password) {
    throw new Error('HttpSpanExporter loopback URL must not contain credentials')
  }
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('HttpSpanExporter requires a loopback origin without path, query, or fragment')
  }

  return url.origin
}

function boundedLocalPayloads(span: ReadableSpan): TracePayload[] {
  const result: TracePayload[] = []
  for (const payload of getSpanPayloads(span)) {
    if (result.length >= MAX_LOCAL_PAYLOAD_ENTRIES) break
    if (!payload.key || payload.key.length > 256) continue
    if (payload.contentType !== 'application/json' && payload.contentType !== 'text/plain') continue
    if (typeof payload.value !== 'string') continue
    const sizeBytes = encoder.encode(payload.value).byteLength
    if (sizeBytes > MAX_LOCAL_PAYLOAD_BYTES) continue
    result.push({
      key: payload.key,
      contentType: payload.contentType,
      value: payload.value,
      sizeBytes,
    })
  }
  return result
}

function serializeSpan(span: ReadableSpan, type: 'start' | 'end'): string | undefined {
  const ctx = span.spanContext()
  const attributes = { ...span.attributes }
  const omittedPayloadCount = getSpanOmittedPayloads(span).length
  if (omittedPayloadCount > 0) attributes['payloads.omitted_count'] = omittedPayloadCount

  const record: Record<string, unknown> = {
    type,
    traceId: ctx.traceId,
    spanId: ctx.spanId,
    parentSpanId: span.parentSpanContext?.spanId ?? null,
    name: span.name,
    kind: span.kind,
    startNs: hrTimeToNanoseconds(span.startTime),
    attrs: attributes,
  }
  const payloads = boundedLocalPayloads(span)
  if (payloads.length > 0) record.payloads = payloads

  if (type === 'end') {
    record.endNs = hrTimeToNanoseconds(span.endTime)
    record.durationNs = hrTimeToNanoseconds(span.duration)
    record.status = { code: span.status.code }
  }

  let body = JSON.stringify(record)
  while (payloads.length > 0 && encoder.encode(body).byteLength > MAX_LOCAL_EXPORT_BODY_BYTES) {
    payloads.pop()
    if (payloads.length === 0) delete record.payloads
    body = JSON.stringify(record)
  }
  return encoder.encode(body).byteLength <= MAX_LOCAL_EXPORT_BODY_BYTES ? body : undefined
}

export class HttpSpanExporter implements SpanProcessor {
  private readonly cliUrl: string
  private readonly inFlight = new Set<Promise<void>>()
  private closed = false

  constructor(cliUrl: string) {
    this.cliUrl = loopbackOrigin(cliUrl)
  }

  onStart(span: ReadableSpan, _ctx: Context): void {
    try {
      this.send(serializeSpan(span, 'start'))
    } catch {
      // Telemetry must never break the bot.
    }
  }

  onEnd(span: ReadableSpan): void {
    try {
      this.send(serializeSpan(span, 'end'))
    } catch {
      // Telemetry must never break the bot.
    }
  }

  private send(body: string | undefined): void {
    if (this.closed || body === undefined) return
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), EXPORT_TIMEOUT_MS)
      timeout.unref?.()
      let tracked!: Promise<void>
      tracked = postJsonToCli(this.cliUrl, '/v1/traces', body, controller.signal).finally(() => {
        clearTimeout(timeout)
        this.inFlight.delete(tracked)
      })
      this.inFlight.add(tracked)
    } catch {
      // Telemetry must never break the bot.
    }
  }

  async forceFlush(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.allSettled([...this.inFlight])
    }
  }

  async shutdown(): Promise<void> {
    this.closed = true
    await this.forceFlush()
  }
}
