import type { AttributeValue, Span } from '@opentelemetry/api'
import stringify from 'fast-safe-stringify'
import { truncateAttribute } from './utils'

export type TracePayloadContentType = 'application/json' | 'text/plain'

export interface TracePayload {
  key: string
  contentType: TracePayloadContentType
  value: string
  sizeBytes: number
}

export interface OmittedTracePayload {
  key: string
  reason: 'too_large'
  sizeBytes: number
  maxSizeBytes: number
}

export interface PreparedAttribute {
  attribute: AttributeValue
  payload?: TracePayload
  omittedPayload?: OmittedTracePayload
}

const payloadsBySpan = new WeakMap<object, Map<string, TracePayload>>()
const omittedPayloadsBySpan = new WeakMap<object, Map<string, OmittedTracePayload>>()
const encoder = new TextEncoder()
const TRUNCATED_MARKER = '...(truncated)'
const MAX_TRACE_PAYLOAD_BYTES = 10 * 1024 * 1024

function byteLength(value: string): number {
  return encoder.encode(value).byteLength
}

function isJsonText(value: string): boolean {
  try {
    JSON.parse(value)
    return true
  } catch {
    return false
  }
}

function serializePayloadValue(value: unknown): { contentType: TracePayloadContentType; value: string } | undefined {
  if (typeof value === 'string') {
    return {
      contentType: isJsonText(value) ? 'application/json' : 'text/plain',
      value,
    }
  }

  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return undefined
  }

  const serialized = stringify(value, undefined, 2)
  if (typeof serialized !== 'string') return undefined

  return {
    contentType: 'application/json',
    value: serialized,
  }
}

function ensurePreviewIsNotFullPayload(
  attribute: AttributeValue,
  fullValue: string,
  maxLength: number
): AttributeValue {
  const previewText =
    typeof attribute === 'string' ? attribute : Array.isArray(attribute) ? stringify(attribute) : String(attribute)

  if (byteLength(previewText) <= maxLength || previewText.endsWith(TRUNCATED_MARKER)) {
    return attribute
  }

  const headLength = Math.max(1, Math.floor(maxLength / 2))
  return fullValue.slice(0, headLength) + TRUNCATED_MARKER
}

export function prepareTraceAttribute(key: string, value: unknown, maxLength = 1024): PreparedAttribute {
  let attribute = truncateAttribute(value, maxLength)

  if (typeof value === 'string' && value.length <= maxLength) {
    return { attribute }
  }

  const serialized = serializePayloadValue(value)

  if (!serialized) {
    return { attribute }
  }

  const sizeBytes = byteLength(serialized.value)
  if (sizeBytes <= maxLength) {
    return { attribute }
  }

  attribute = ensurePreviewIsNotFullPayload(attribute, serialized.value, maxLength)

  if (sizeBytes > MAX_TRACE_PAYLOAD_BYTES) {
    return {
      attribute,
      omittedPayload: {
        key,
        reason: 'too_large',
        sizeBytes,
        maxSizeBytes: MAX_TRACE_PAYLOAD_BYTES,
      },
    }
  }

  return {
    attribute,
    payload: {
      key,
      contentType: serialized.contentType,
      value: serialized.value,
      sizeBytes,
    },
  }
}

export function prepareTraceAttributes(
  attributes: Record<string, unknown>,
  getLimit: (key: string) => number | undefined = () => undefined
): {
  attributes: Record<string, AttributeValue>
  payloads: TracePayload[]
  omittedPayloads: OmittedTracePayload[]
} {
  const preparedAttributes: Record<string, AttributeValue> = {}
  const payloads: TracePayload[] = []
  const omittedPayloads: OmittedTracePayload[] = []

  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined) continue
    const prepared = prepareTraceAttribute(key, value, getLimit(key))
    preparedAttributes[key] = prepared.attribute
    if (prepared.payload) {
      payloads.push(prepared.payload)
    }
    if (prepared.omittedPayload) {
      omittedPayloads.push(prepared.omittedPayload)
    }
  }

  return { attributes: preparedAttributes, payloads, omittedPayloads }
}

export function registerSpanPayloads(span: object, payloads: TracePayload[]): void {
  if (payloads.length === 0) return

  let spanPayloads = payloadsBySpan.get(span)
  if (!spanPayloads) {
    spanPayloads = new Map()
    payloadsBySpan.set(span, spanPayloads)
  }

  for (const payload of payloads) {
    spanPayloads.set(payload.key, payload)
  }
}

export function registerSpanOmittedPayloads(span: object, omittedPayloads: OmittedTracePayload[]): void {
  if (omittedPayloads.length === 0) return

  let spanOmittedPayloads = omittedPayloadsBySpan.get(span)
  if (!spanOmittedPayloads) {
    spanOmittedPayloads = new Map()
    omittedPayloadsBySpan.set(span, spanOmittedPayloads)
  }

  for (const omittedPayload of omittedPayloads) {
    spanOmittedPayloads.set(omittedPayload.key, omittedPayload)
  }
}

export function getSpanPayloads(span: object): TracePayload[] {
  return Array.from(payloadsBySpan.get(span)?.values() ?? [])
}

export function getSpanOmittedPayloads(span: object): OmittedTracePayload[] {
  return Array.from(omittedPayloadsBySpan.get(span)?.values() ?? [])
}

export function setSpanAttributeWithPayload(
  span: Span,
  key: string,
  value: unknown,
  maxLength?: number
): AttributeValue {
  const prepared = prepareTraceAttribute(key, value, maxLength)
  span.setAttribute(key, prepared.attribute)
  if (prepared.payload) {
    registerSpanPayloads(span, [prepared.payload])
  }
  if (prepared.omittedPayload) {
    registerSpanOmittedPayloads(span, [prepared.omittedPayload])
  }
  return prepared.attribute
}
