import { AttributeValue, Context, Span, trace as _trace, context as otelContext } from '@opentelemetry/api'
import { context } from '../runtime/index'
import { SpanOf, type Spans as DefinedSpans, Spans as SpanDefinitions } from './spans/index'
import { tracer } from './tracing'
import {
  prepareTraceAttribute,
  prepareTraceAttributes,
  registerSpanOmittedPayloads,
  registerSpanPayloads,
} from './trace-payloads'
import {
  boundedErrorString,
  ERROR_CODE_LIMIT_BYTES,
  ERROR_MESSAGE_LIMIT_BYTES,
  ERROR_NAME_LIMIT_BYTES,
  ERROR_STACK_LIMIT_BYTES,
} from './error-diagnostics'

export type Attributes = {
  [key: string]: AttributeValue
}

export const HandledErrorProp = '$$HANDLED'

export function errorTraceAttributes(error: unknown): Attributes {
  const object = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : undefined
  const name = boundedErrorString(object?.name, ERROR_NAME_LIMIT_BYTES) ?? 'Error'
  const message =
    boundedErrorString(object?.message, ERROR_MESSAGE_LIMIT_BYTES) ??
    boundedErrorString(error, ERROR_MESSAGE_LIMIT_BYTES) ??
    name
  const code = boundedErrorString(object?.code, ERROR_CODE_LIMIT_BYTES) ?? name
  const stack = boundedErrorString(object?.stack, ERROR_STACK_LIMIT_BYTES)

  return {
    'error.name': name,
    'error.code': code,
    'error.message': message,
    ...(stack ? { 'error.stack': stack } : {}),
  }
}

const IMPORTANCE_TO_TIER: Record<string, string> = {
  high: 'concise',
  medium: 'standard',
  low: 'verbose',
  debug: 'verbose',
}

const LARGE_ATTRIBUTE_KEYS = new Set([
  'autonomous.tool.output',
  'autonomous.tool.input',
  'autonomous.exit.value',
  'ai.instructions',
  'ai.messages',
  'ai.response',
  'ai.tools',
  'message.preview',
])
const LARGE_ATTRIBUTE_LIMIT = 8192

function getAttributeLimit(key: string): number | undefined {
  return LARGE_ATTRIBUTE_KEYS.has(key) ? LARGE_ATTRIBUTE_LIMIT : undefined
}

export function truncateAttributes(attributes: Attributes): Attributes {
  return prepareTraceAttributes(attributes, getAttributeLimit).attributes as Attributes
}

export function addRemainingTimeAttribute(attributes: Attributes): void {
  try {
    if (!attributes['remaining_time_ms']) {
      attributes['remaining_time_ms'] = context.get('runtime').getRemainingExecutionTimeInMs()
    }
  } catch {}
}

export function createTypedSpanWrapper<T extends DefinedSpans['name']>(
  s: SpanWithContext,
  onSetStatus?: () => void
): TypedSpan<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const typedSpan = s as any

  // Override setAttributes with truncation
  const originalSetAttributes = s.setAttributes.bind(s)
  typedSpan.setAttributes = (attrs: Partial<SpanOf<T>['attributes']>) => {
    const prepared = prepareTraceAttributes(attrs as Attributes, getAttributeLimit)
    const cleanedAttrs = prepared.attributes as Attributes
    registerSpanPayloads(s, prepared.payloads)
    registerSpanOmittedPayloads(s, prepared.omittedPayloads)
    originalSetAttributes(cleanedAttrs)
    return typedSpan
  }

  // Override setAttribute with truncation
  const originalSetAttribute = s.setAttribute.bind(s)
  typedSpan.setAttribute = (key: string | symbol, value: AttributeValue | undefined) => {
    if (value !== undefined) {
      const stringKey = key as string
      const prepared = prepareTraceAttribute(stringKey, value, getAttributeLimit(stringKey))
      if (prepared.payload) {
        registerSpanPayloads(s, [prepared.payload])
      }
      if (prepared.omittedPayload) {
        registerSpanOmittedPayloads(s, [prepared.omittedPayload])
      }
      originalSetAttribute(stringKey, prepared.attribute)
    }
    return typedSpan
  }

  const originalSetStatus = s.setStatus.bind(s)
  typedSpan.setStatus = (status: Parameters<Span['setStatus']>[0]) => {
    onSetStatus?.()
    originalSetStatus(status)
    return typedSpan
  }

  // Override addEvent with truncation
  const originalAddEvent = s.addEvent.bind(s)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(typedSpan as any).addEvent = (name: string, attributesOrStartTime?: unknown, startTime?: unknown) => {
    if (attributesOrStartTime && typeof attributesOrStartTime === 'object' && !('getTime' in attributesOrStartTime)) {
      const cleanedAttrs = prepareTraceAttributes(attributesOrStartTime as Attributes, getAttributeLimit)
        .attributes as Attributes
      originalAddEvent(name, cleanedAttrs, startTime as number | undefined)
    } else {
      originalAddEvent(name, attributesOrStartTime as Attributes | undefined, startTime as number | undefined)
    }
    return typedSpan
  }

  return typedSpan
}

// ============================================================================
// Type Definitions
// ============================================================================

export interface DisposableSpan extends AsyncDisposable, Disposable, SpanWithContext {}

export interface SpanWithContext extends Span {
  ctx: Context
}

export interface TypedSpan<T extends DefinedSpans['name']> extends Omit<
  SpanWithContext,
  'setAttributes' | 'setAttribute'
> {
  setAttributes(attributes: Partial<SpanOf<T>['attributes']>): this
  setAttribute<K extends keyof SpanOf<T>['attributes']>(key: K, value: SpanOf<T>['attributes'][K]): this
  setAttribute(key: string, value: AttributeValue): this
}

// ============================================================================
// Public API
// ============================================================================

export function span<T extends DefinedSpans['name'], Output>(
  name: T,
  attributes: SpanOf<T>['attributes'],
  f: (span: TypedSpan<T>) => Promise<Output>
): Promise<Output>
export function span<T extends DefinedSpans['name'], Output>(
  name: T,
  attributes: SpanOf<T>['attributes'],
  options: { parentContext?: Context },
  f: (span: TypedSpan<T>) => Promise<Output>
): Promise<Output>
export function span<T extends DefinedSpans['name'], Output>(
  name: T,
  attributes: SpanOf<T>['attributes'],
  optionsOrF: { parentContext?: Context } | ((span: TypedSpan<T>) => Promise<Output>),
  f?: (span: TypedSpan<T>) => Promise<Output>
): Promise<Output> {
  // Handle overloaded signatures
  let options: { parentContext?: Context } | undefined
  let handler: (span: TypedSpan<T>) => Promise<Output>

  if (typeof optionsOrF === 'function') {
    // span(name, attributes, f)
    options = undefined
    handler = optionsOrF as (span: TypedSpan<T>) => Promise<Output>
  } else {
    // span(name, attributes, options, f)
    options = optionsOrF as { parentContext?: Context } | undefined
    handler = f!
  }

  // Get the span definition to extract importance
  const spanDef = Object.values(SpanDefinitions).find((def) => def.name === name)

  // Add importance from span definition if not already set
  const attrsWithImportance: Record<string, unknown> = {
    ...attributes,
  }

  if (spanDef?.importance) {
    attrsWithImportance.importance = spanDef.importance
    attrsWithImportance['adk.tier'] = IMPORTANCE_TO_TIER[spanDef.importance] ?? 'verbose'
  }

  // Truncate and add remaining time
  const preparedAttributes = prepareTraceAttributes(attrsWithImportance as Attributes, getAttributeLimit)
  const cleanedAttributes = preparedAttributes.attributes as Attributes
  addRemainingTimeAttribute(cleanedAttributes)

  const spanOptions = { attributes: cleanedAttributes }
  const parentContext = options?.parentContext

  const executeInSpan = async (s: Span) => {
    try {
      const spanWithContext = s as SpanWithContext
      spanWithContext.ctx = otelContext.active()
      registerSpanPayloads(s, preparedAttributes.payloads)
      registerSpanOmittedPayloads(s, preparedAttributes.omittedPayloads)

      // Create typed wrapper with overridden methods
      let explicitStatus = false
      const typedSpan = createTypedSpanWrapper<T>(spanWithContext, () => {
        explicitStatus = true
      })

      const result = await handler(typedSpan)
      if (!explicitStatus) s.setStatus({ code: 1 })
      return result
    } catch (e: unknown) {
      if (typeof e === 'object' && e !== null && HandledErrorProp in e) {
        // The error has been handled, so ignore failing the span here
        throw e
      }

      s.setAttributes(errorTraceAttributes(e))
      s.recordException(e instanceof Error ? e : String(e))
      s.setStatus({ code: 2, message: e instanceof Error ? e.message : String(e) })
      throw e
    } finally {
      s.end()
    }
  }

  if (parentContext) {
    return tracer.startActiveSpan(name, spanOptions, parentContext, executeInSpan)
  } else {
    return tracer.startActiveSpan(name, spanOptions, executeInSpan)
  }
}

/**
 * Create a typed span that can be manually controlled (not auto-ended)
 */
export const createSpan = <T extends DefinedSpans['name']>(
  name: T,
  attributes: SpanOf<T>['attributes'],
  { parentContext }: { parentContext?: Context } = {}
): TypedSpan<T> & DisposableSpan => {
  const spanDef = Object.values(SpanDefinitions).find((def) => def.name === name)

  const attrsWithImportance: Record<string, unknown> = {
    ...attributes,
  }

  if (spanDef?.importance) {
    attrsWithImportance.importance = spanDef.importance
    attrsWithImportance['adk.tier'] = IMPORTANCE_TO_TIER[spanDef.importance] ?? 'verbose'
  }

  const preparedAttributes = prepareTraceAttributes(attrsWithImportance as Attributes, getAttributeLimit)
  const cleanedAttributes = preparedAttributes.attributes as Attributes

  const s = (
    parentContext
      ? tracer.startSpan(name, { attributes: cleanedAttributes }, parentContext)
      : tracer.startSpan(name, { attributes: cleanedAttributes })
  ) as DisposableSpan
  registerSpanPayloads(s, preparedAttributes.payloads)
  registerSpanOmittedPayloads(s, preparedAttributes.omittedPayloads)

  const ctx = _trace.setSpan(parentContext || otelContext.active(), s)
  s.ctx = ctx

  s[Symbol.dispose] = () => s.end()
  s[Symbol.asyncDispose] = async () => s.end()

  const typedSpan = createTypedSpanWrapper<T>(s) as TypedSpan<T> & DisposableSpan

  return typedSpan
}
