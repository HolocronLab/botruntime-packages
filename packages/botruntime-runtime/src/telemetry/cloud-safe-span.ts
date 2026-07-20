import { SpanKind, SpanStatusCode, type AttributeValue, type Attributes, type SpanContext } from '@opentelemetry/api'
import { ExportResultCode } from '@opentelemetry/core'
import { resourceFromAttributes } from '@opentelemetry/resources'
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base'
import {
  boundedErrorString,
  ERROR_CODE_LIMIT_BYTES,
  ERROR_MESSAGE_LIMIT_BYTES,
  ERROR_NAME_LIMIT_BYTES,
  ERROR_STACK_LIMIT_BYTES,
} from './error-diagnostics'
import { Spans } from './spans'
import { getSpanOmittedPayloads, getSpanPayloads } from './trace-payloads'

/**
 * The only runtime spans that may cross the managed-cloud boundary.
 *
 * Keep this list explicit: adding a local diagnostic span must never make it
 * cloud-visible as a side effect.
 */
export const VORTEX_EXPORTED_SPANS = new Set([
  'request.incoming',
  'handler.conversation',
  'handler.event',
  'handler.trigger',
  'handler.workflow',
  'autonomous.execution',
  'autonomous.iteration',
  'autonomous.tool',
  'chat.sendMessage',
  'state.saveAllDirty',
  'state.save',
  'cognitive.request',
])

const TRACE_ID = /^[0-9a-f]{32}$/
const SPAN_ID = /^[0-9a-f]{16}$/
const ZERO_TRACE_ID = '0'.repeat(32)
const ZERO_SPAN_ID = '0'.repeat(16)
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const CANONICAL_SPAN_ATTRIBUTES: ReadonlyMap<string, ReadonlySet<string>> = new Map(
  Object.values(Spans).map((definition) => [definition.name, new Set(Object.keys(definition.attributes))]),
)
const COMMON_SPAN_ATTRIBUTES = new Set([
  'importance',
  'adk.tier',
  'remaining_time_ms',
  'payloads.omitted_count',
  'error.kind',
  'error.name',
  'error.code',
  'error.message',
  'error.stack',
])
const OTEL_SPAN_KINDS = new Set([
  SpanKind.INTERNAL,
  SpanKind.SERVER,
  SpanKind.CLIENT,
  SpanKind.PRODUCER,
  SpanKind.CONSUMER,
])
const OTEL_STATUS_CODES = new Set([SpanStatusCode.UNSET, SpanStatusCode.OK, SpanStatusCode.ERROR])

const emptyCloudResource = resourceFromAttributes({})

function boundedInteger(value: AttributeValue, max: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= max
}

function validString(value: AttributeValue, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}

function validOtelAttribute(value: AttributeValue): boolean {
  if (typeof value === 'number') return Number.isFinite(value)
  if (!Array.isArray(value)) return true
  return value.every((item) => typeof item !== 'number' || Number.isFinite(item))
}

function safeAttribute(spanName: string, key: string, value: AttributeValue): AttributeValue | undefined {
  const canonicalKeys = CANONICAL_SPAN_ATTRIBUTES.get(spanName)
  if (!canonicalKeys?.has(key) && !COMMON_SPAN_ATTRIBUTES.has(key)) return undefined
  if (key === 'conversationId' || key === 'userId' || key === 'messageId') {
    return validString(value, CORRELATION_ID) ? value : undefined
  }
  if (key === 'error.name') return boundedErrorString(value, ERROR_NAME_LIMIT_BYTES)
  if (key === 'error.code') return boundedErrorString(value, ERROR_CODE_LIMIT_BYTES)
  if (key === 'error.message') return boundedErrorString(value, ERROR_MESSAGE_LIMIT_BYTES)
  if (key === 'error.stack') return boundedErrorString(value, ERROR_STACK_LIMIT_BYTES)

  if (key === 'error.kind') return boundedErrorString(value, ERROR_CODE_LIMIT_BYTES)
  if (key === 'payloads.omitted_count') return boundedInteger(value, 1_000_000_000) ? value : undefined
  return validOtelAttribute(value) ? value : undefined
}

export function sanitizeCloudAttributes(spanName: string, attributes: Attributes): Attributes {
  const safe: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    const sanitized = safeAttribute(spanName, key, value)
    if (sanitized !== undefined) safe[key] = sanitized
  }
  return safe
}

function normalizedSpanContext(context: SpanContext): SpanContext | undefined {
  const traceId = context.traceId.toLowerCase()
  const spanId = context.spanId.toLowerCase()
  if (
    !TRACE_ID.test(traceId) ||
    !SPAN_ID.test(spanId) ||
    traceId === ZERO_TRACE_ID ||
    spanId === ZERO_SPAN_ID
  ) {
    return undefined
  }
  return {
    traceId,
    spanId,
    traceFlags: context.traceFlags,
    ...(context.isRemote === undefined ? {} : { isRemote: context.isRemote }),
  }
}

function validDuration(duration: ReadableSpan['duration']): boolean {
  const milliseconds = duration[0] * 1_000 + duration[1] / 1_000_000
  return Number.isFinite(milliseconds) && milliseconds >= 0 && milliseconds <= 86_400_000
}

function enrichErrorAttributes(span: ReadableSpan, attributes: Attributes): void {
  if (span.status.code !== SpanStatusCode.ERROR) return

  attributes['error.kind'] ??= 'internal'
  const exception = [...span.events].reverse().find((event) => event.name === 'exception')
  const exceptionName = boundedErrorString(exception?.attributes?.['exception.type'], ERROR_NAME_LIMIT_BYTES)
  const exceptionMessage = boundedErrorString(
    exception?.attributes?.['exception.message'],
    ERROR_MESSAGE_LIMIT_BYTES
  )
  const exceptionStack = boundedErrorString(
    exception?.attributes?.['exception.stacktrace'],
    ERROR_STACK_LIMIT_BYTES
  )
  const statusMessage = boundedErrorString(span.status.message, ERROR_MESSAGE_LIMIT_BYTES)
  const message = attributes['error.message'] ?? exceptionMessage ?? statusMessage

  if (message !== undefined) attributes['error.message'] = message
  if (exceptionStack !== undefined && attributes['error.stack'] === undefined) {
    attributes['error.stack'] = exceptionStack
  }
  if (message !== undefined || attributes['error.stack'] !== undefined) {
    const name = attributes['error.name'] ?? exceptionName ?? 'Error'
    attributes['error.name'] = name
    attributes['error.code'] ??= name
  }
}

/**
 * Returns a structurally valid OTEL span containing the canonical attributes
 * declared by that runtime span. Invalid or unregistered spans fail closed.
 */
export function sanitizeCloudSpan(span: ReadableSpan): ReadableSpan | null {
  if (!VORTEX_EXPORTED_SPANS.has(span.name)) return null
  if (!OTEL_SPAN_KINDS.has(span.kind) || !OTEL_STATUS_CODES.has(span.status.code)) return null
  if (!validDuration(span.duration)) return null
  const context = normalizedSpanContext(span.spanContext())
  if (!context) return null

  const parent = span.parentSpanContext ? normalizedSpanContext(span.parentSpanContext) : undefined
  const attributes = sanitizeCloudAttributes(span.name, span.attributes)
  for (const payload of getSpanPayloads(span)) {
    if (CANONICAL_SPAN_ATTRIBUTES.get(span.name)?.has(payload.key)) attributes[payload.key] = payload.value
  }
  const omittedPayloadCount = getSpanOmittedPayloads(span).length
  if (omittedPayloadCount > 0 && boundedInteger(omittedPayloadCount, 1_000_000_000)) {
    attributes['payloads.omitted_count'] = omittedPayloadCount
  }
  enrichErrorAttributes(span, attributes)

  return {
    name: span.name,
    kind: span.kind,
    spanContext: () => context,
    ...(parent ? { parentSpanContext: { ...parent, traceId: context.traceId } } : {}),
    startTime: span.startTime,
    endTime: span.endTime,
    duration: span.duration,
    status: { code: span.status.code },
    attributes,
    links: [],
    events: [],
    ended: span.ended,
    resource: emptyCloudResource,
    instrumentationScope: { name: 'brt.cloud' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  }
}

/** Applies the canonical runtime span schema before OTLP encoding. */
export class CloudSafeSpanExporter implements SpanExporter {
  public constructor(private readonly delegate: SpanExporter) {}

  public export(spans: ReadableSpan[], resultCallback: Parameters<SpanExporter['export']>[1]): void {
    const safeSpans = spans.flatMap((span) => {
      const safe = sanitizeCloudSpan(span)
      return safe ? [safe] : []
    })
    if (safeSpans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS })
      return
    }
    this.delegate.export(safeSpans, resultCallback)
  }

  public forceFlush(): Promise<void> {
    return this.delegate.forceFlush?.() ?? Promise.resolve()
  }

  public shutdown(): Promise<void> {
    return this.delegate.shutdown()
  }
}

export type CloudTraceHeaderOptions = {
  token?: string
  development: boolean
  runtimeBotId?: string
}

export type CloudTraceEnvironment = {
  apiUrl?: string
  token?: string
  runtimeBotId?: string
}

export function resolveCloudTraceEnvironment(env: NodeJS.ProcessEnv): CloudTraceEnvironment {
  const apiUrl = env.BP_API_URL || env.ADK_API_URL
  const token = env.BP_TOKEN || env.ADK_TOKEN
  const runtimeBotId = env.BP_BOT_ID || env.ADK_BOT_ID
  return {
    ...(apiUrl ? { apiUrl } : {}),
    ...(token ? { token } : {}),
    ...(runtimeBotId ? { runtimeBotId } : {}),
  }
}

/**
 * Build managed-ingestion auth headers without ever emitting workspace scope.
 * Development uses a human PAT plus the opaque tunnel/runtime bot identity;
 * production preserves the existing api_key Authorization behavior.
 */
export function cloudTraceHeaders(options: CloudTraceHeaderOptions): Record<string, string> {
  if (!options.token) throw new Error('Cloud trace token is required')
  const headers: Record<string, string> = { Authorization: `Bearer ${options.token}` }
  if (!options.development) return headers

  const runtimeBotId = options.runtimeBotId
  if (!runtimeBotId || !CORRELATION_ID.test(runtimeBotId)) {
    throw new Error('A valid runtime bot id is required for development cloud traces')
  }
  if (/^[1-9][0-9]*$/.test(runtimeBotId)) {
    throw new Error('Development cloud traces require an opaque runtime bot id, not a numeric target bot id')
  }
  headers['x-bot-id'] = runtimeBotId
  return headers
}
