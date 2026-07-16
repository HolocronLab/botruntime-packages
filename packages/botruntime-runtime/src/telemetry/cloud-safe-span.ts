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
import { getSpanOmittedPayloads } from './trace-payloads'

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

export const CLOUD_SAFE_ATTRIBUTE_KEYS = new Set([
  'endpoint',
  'action.type',
  'ai.requested_model',
  'ai.model',
  'ai.provider',
  'ai.stop_reason',
  'ai.messages_count',
  'ai.input_length',
  'ai.input_tokens',
  'ai.output_tokens',
  'ai.cost',
  'ai.latency_ms',
  'integration',
  'channel',
  'ai.prompt_source',
  'ai.prompt_category',
  'autonomous.iteration',
  'autonomous.status',
  'autonomous.tool.name',
  'autonomous.tool.object',
  'autonomous.tool.status',
  'workflow.name',
  'http.status_code',
  'payloads.omitted_count',
  'error.kind',
  'error.name',
  'error.code',
  'error.message',
  'error.stack',
])

const TRACE_ID = /^[0-9a-f]{32}$/
const SPAN_ID = /^[0-9a-f]{16}$/
const ZERO_TRACE_ID = '0'.repeat(32)
const ZERO_SPAN_ID = '0'.repeat(16)
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,95}$/
const CODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/\-]{0,63}$/

const COUNT_KEYS = new Set([
  'ai.messages_count',
  'ai.input_length',
  'ai.input_tokens',
  'ai.output_tokens',
  'autonomous.iteration',
])
const MODEL_KEYS = new Set(['ai.requested_model', 'ai.model'])
const CODE_KEYS = new Set([
  'ai.provider',
  'integration',
  'channel',
  'ai.prompt_source',
  'ai.prompt_category',
  'autonomous.tool.name',
  'autonomous.tool.object',
  'workflow.name',
])
const ENDPOINTS = new Set(['/v2/cognitive/generate-text', '/v1/chat/actions'])
const ACTION_TYPES = new Set(['generateText', 'generateContent'])
const STOP_REASONS = new Set(['stop', 'max_tokens', 'tool_calls', 'content_filter', 'other'])
const AUTONOMOUS_STATUSES = new Set([
  'pending',
  'generation_error',
  'execution_error',
  'invalid_code_error',
  'thinking_requested',
  'callback_requested',
  'exit_success',
  'exit_error',
  'aborted',
])
const TOOL_STATUSES = new Set(['think', 'success', 'error'])
const ERROR_KINDS = new Set([
  'disabled',
  'payment_required',
  'rate_limited',
  'timeout',
  'upstream',
  'internal',
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

function boundedNumber(value: AttributeValue, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= max
}

function validString(value: AttributeValue, pattern: RegExp): value is string {
  return typeof value === 'string' && pattern.test(value)
}

function safeAttribute(key: string, value: AttributeValue): AttributeValue | undefined {
  // Transport-only correlation: the server extracts this into its private
  // conversation column and removes it from stored/public metadata. No other
  // user/message/session identifier is allowed through this boundary.
  if (key === 'conversationId') return validString(value, CORRELATION_ID) ? value : undefined
  if (!CLOUD_SAFE_ATTRIBUTE_KEYS.has(key)) return undefined

  if (key === 'error.name') return boundedErrorString(value, ERROR_NAME_LIMIT_BYTES)
  if (key === 'error.code') return boundedErrorString(value, ERROR_CODE_LIMIT_BYTES)
  if (key === 'error.message') return boundedErrorString(value, ERROR_MESSAGE_LIMIT_BYTES)
  if (key === 'error.stack') return boundedErrorString(value, ERROR_STACK_LIMIT_BYTES)

  if (COUNT_KEYS.has(key)) return boundedInteger(value, 1_000_000_000) ? value : undefined
  if (MODEL_KEYS.has(key)) return validString(value, MODEL_ID) ? value : undefined
  if (CODE_KEYS.has(key)) return validString(value, CODE_ID) ? value : undefined

  switch (key) {
    case 'endpoint':
      return typeof value === 'string' && ENDPOINTS.has(value) ? value : undefined
    case 'action.type':
      return typeof value === 'string' && ACTION_TYPES.has(value) ? value : undefined
    case 'ai.stop_reason':
      return typeof value === 'string' && STOP_REASONS.has(value) ? value : undefined
    case 'autonomous.status':
      return typeof value === 'string' && AUTONOMOUS_STATUSES.has(value) ? value : undefined
    case 'autonomous.tool.status':
      return typeof value === 'string' && TOOL_STATUSES.has(value) ? value : undefined
    case 'error.kind':
      return typeof value === 'string' && ERROR_KINDS.has(value) ? value : undefined
    case 'ai.cost':
      return boundedNumber(value, 1_000_000) ? value : undefined
    case 'ai.latency_ms':
      return boundedInteger(value, 86_400_000) ? value : undefined
    case 'http.status_code':
      return boundedInteger(value, 599) && value >= 100 ? value : undefined
    default:
      return undefined
  }
}

export function sanitizeCloudAttributes(attributes: Attributes): Attributes {
  const safe: Attributes = {}
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    const sanitized = safeAttribute(key, value)
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

/**
 * Returns a structurally valid OTEL span containing only the cloud-safe
 * projection. Invalid or unapproved spans fail closed and are not exported.
 */
export function sanitizeCloudSpan(span: ReadableSpan): ReadableSpan | null {
  if (!VORTEX_EXPORTED_SPANS.has(span.name)) return null
  if (!OTEL_SPAN_KINDS.has(span.kind) || !OTEL_STATUS_CODES.has(span.status.code)) return null
  if (!validDuration(span.duration)) return null
  const context = normalizedSpanContext(span.spanContext())
  if (!context) return null

  const parent = span.parentSpanContext ? normalizedSpanContext(span.parentSpanContext) : undefined
  const attributes = sanitizeCloudAttributes(span.attributes)
  const omittedPayloadCount = getSpanOmittedPayloads(span).length
  if (omittedPayloadCount > 0 && boundedInteger(omittedPayloadCount, 1_000_000_000)) {
    attributes['payloads.omitted_count'] = omittedPayloadCount
  }
  if (span.status.code === SpanStatusCode.ERROR && attributes['error.kind'] === undefined) {
    attributes['error.kind'] = 'internal'
  }

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
    instrumentationScope: { name: 'brt.cloud-safe' },
    droppedAttributesCount: 0,
    droppedEventsCount: 0,
    droppedLinksCount: 0,
  }
}

/** Applies the same safe projection used by the local exporter before OTLP encoding. */
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
