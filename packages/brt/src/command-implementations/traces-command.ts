import type { TraceListParams } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { parseTimeFilter } from '../utils/time-filter'
import { CloudCommand } from './cloud-command'

const POSITIVE_DECIMAL_ID = /^[1-9][0-9]*$/
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const TRACE_ID = /^[0-9a-f]{32}$/i
const SPAN_ID = /^[0-9a-f]{16}$/i
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,95}$/
const CODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/\-]{0,63}$/
const MAX_PAGE_SIZE = 1_000
const MAX_LIMIT = 10_000
const MAX_PAGES = 100
const MAX_DURATION_MS = 86_400_000
const MAX_COUNT = 1_000_000_000
const MAX_COST = 1_000_000

const TRACE_SOURCES = new Set([
  'otlp',
  'cognitive_v2',
  'cognitive_action',
  'integration_action',
  'integration_delivery',
  'observation',
  'unknown',
])
const TRACE_NAMES = new Set([
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
  'cognitive.generateText',
  'cognitive.generateContent',
  'integration.action',
  'integration.delivery',
  'observation',
  'unknown',
])
const TRACE_FILTER_SOURCES = new Set([
  'otlp',
  'cognitive_v2',
  'cognitive_action',
  'integration_action',
  'integration_delivery',
  'observation',
])
const TRACE_FILTER_NAMES = new Set([...TRACE_NAMES].filter((name) => name !== 'unknown'))
const TRACE_KINDS = new Set(['internal', 'server', 'client', 'producer', 'consumer', 'observation'])
const TRACE_STATUSES = new Set(['unset', 'ok', 'error'])
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
const ERROR_KINDS = new Set(['disabled', 'payment_required', 'rate_limited', 'timeout', 'upstream', 'internal'])
const ERROR_NAME_LIMIT = 128
const ERROR_CODE_LIMIT = 128
const ERROR_MESSAGE_LIMIT = 8_192
const ERROR_STACK_LIMIT = 32_768
const UTF8_ENCODER = new TextEncoder()
const LLM_ATTRIBUTE_KEYS = new Set(['ai.instructions', 'ai.messages', 'ai.tools', 'ai.response'])
const LLM_TRACE_NAMES = new Set(['cognitive.request', 'cognitive.generateText', 'cognitive.generateContent'])

const METADATA_FIELDS = {
  endpoint: { kind: 'enum', values: ENDPOINTS },
  actionType: { kind: 'enum', values: ACTION_TYPES },
  actionName: { kind: 'pattern', pattern: CODE_ID },
  aiRequestedModel: { kind: 'pattern', pattern: MODEL_ID },
  aiModel: { kind: 'pattern', pattern: MODEL_ID },
  aiProvider: { kind: 'pattern', pattern: CODE_ID },
  aiStopReason: { kind: 'enum', values: STOP_REASONS },
  aiMessagesCount: { kind: 'integer', min: 0, max: MAX_COUNT },
  aiInputLength: { kind: 'integer', min: 0, max: MAX_COUNT },
  aiInputTokens: { kind: 'integer', min: 0, max: MAX_COUNT },
  aiOutputTokens: { kind: 'integer', min: 0, max: MAX_COUNT },
  aiCost: { kind: 'number', min: 0, max: MAX_COST },
  aiLatencyMs: { kind: 'integer', min: 0, max: MAX_DURATION_MS },
  integration: { kind: 'pattern', pattern: CODE_ID },
  channel: { kind: 'pattern', pattern: CODE_ID },
  aiPromptSource: { kind: 'pattern', pattern: CODE_ID },
  aiPromptCategory: { kind: 'pattern', pattern: CODE_ID },
  autonomousIteration: { kind: 'integer', min: 0, max: MAX_COUNT },
  autonomousStatus: { kind: 'enum', values: AUTONOMOUS_STATUSES },
  autonomousToolName: { kind: 'pattern', pattern: CODE_ID },
  autonomousToolObject: { kind: 'pattern', pattern: CODE_ID },
  autonomousToolStatus: { kind: 'enum', values: TOOL_STATUSES },
  workflowName: { kind: 'pattern', pattern: CODE_ID },
  httpStatusCode: { kind: 'integer', min: 100, max: 599 },
  payloadsOmittedCount: { kind: 'integer', min: 0, max: MAX_COUNT },
  errorKind: { kind: 'enum', values: ERROR_KINDS },
  errorName: { kind: 'string', max: ERROR_NAME_LIMIT },
  errorCode: { kind: 'string', max: ERROR_CODE_LIMIT },
  errorMessage: { kind: 'string', max: ERROR_MESSAGE_LIMIT },
  errorStack: { kind: 'string', max: ERROR_STACK_LIMIT },
} as const

type TraceMetadata = Partial<Record<keyof typeof METADATA_FIELDS, string | number>>

export interface TraceEntry {
  id: string
  createdAt: string
  startedAt?: string
  endedAt?: string
  source: string
  name: string
  kind: string
  status: string
  traceId?: string
  spanId?: string
  parentSpanId?: string
  conversationId?: string
  userId?: string
  messageId?: string
  durationMs: number
  metadata?: TraceMetadata
  attributes: Record<string, unknown>
  payload: Record<string, unknown>
}

type TracePage = { traces: TraceEntry[]; nextToken?: string }

export type TracesCommandDefinition = typeof commandDefinitions.traces

export class TracesCommand extends CloudCommand<TracesCommandDefinition> {
  public async run(): Promise<void> {
    const { query, limit } = resolveTraceFilters(this.argv, Date.now())
    const conversationId = query.conversationId
    if (this.argv.nextToken !== undefined && !POSITIVE_DECIMAL_ID.test(this.argv.nextToken)) {
      throw new errors.BotpressCLIError('--next-token must be a positive decimal cursor returned by brt traces')
    }

    const target = await this._resolveTarget()
    const traces: TraceEntry[] = []
    const seenTokens = new Set<string>()
    let nextToken = this.argv.nextToken
    if (nextToken) seenTokens.add(nextToken)

    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const pageSize = Math.min(MAX_PAGE_SIZE, limit - traces.length)
      const raw = await target.fetchPage({ ...query, pageSize, nextToken }).catch((thrown) => {
        throw errors.BotpressCLIError.wrap(
          thrown,
          'could not fetch runtime traces; check network connectivity, the API URL, and the selected target',
        )
      })
      const page = parseTracePage(raw, pageSize)
      traces.push(...page.traces)

      if (!page.nextToken) {
        nextToken = undefined
        break
      }
      if (seenTokens.has(page.nextToken)) {
        throw new errors.BotpressCLIError('trace pagination cursor loop detected; retry and check the server')
      }
      seenTokens.add(page.nextToken)
      nextToken = page.nextToken

      if (traces.length >= limit) break
      if (page.traces.length === 0) {
        throw new errors.BotpressCLIError('trace response advanced pagination without returning rows')
      }
      if (pageNumber === MAX_PAGES) {
        throw new errors.BotpressCLIError(`trace pagination exceeded the ${MAX_PAGES}-page safety limit`)
      }
    }

    const displayedTraces = this.argv.includeLlm ? traces : traces.map(withoutLlmContent)
    const output = {
      schemaVersion: 1,
      target: target.output,
      conversationId,
      traces: displayedTraces,
      nextToken: nextToken ?? null,
    }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }

    for (const entry of displayedTraces) this._printHuman(entry)
    if (nextToken) this.logger.log(`Next token: ${nextToken}`)
  }

  private async _resolveTarget(): Promise<{
    output:
      | { environment: 'production'; workspaceId: string; botId: string }
      | {
          environment: 'development'
          workspaceId: string
          runtimeBotId: string
          targetBotId: string
        }
    fetchPage: (params: TraceListParams) => Promise<unknown>
  }> {
    const target = await this.diagnosticCloudapiTarget()
    if ('runtimeBotId' in target) {
      return {
        output: target.output,
        fetchPage: (params) => target.client.listDevelopmentTraces(target.runtimeBotId, params),
      }
    }
    return {
      output: target.output,
      fetchPage: (params) => target.client.listWorkspaceTraces(target.workspaceId, target.botId, params),
    }
  }

  private _printHuman(entry: TraceEntry): void {
    const metadata = entry.metadata ?? {}
    const details: string[] = []
    if (metadata.aiModel !== undefined) details.push(`model=${metadata.aiModel}`)
    if (metadata.aiInputTokens !== undefined) details.push(`inputTokens=${metadata.aiInputTokens}`)
    if (metadata.aiOutputTokens !== undefined) details.push(`outputTokens=${metadata.aiOutputTokens}`)
    if (metadata.workflowName !== undefined) details.push(`workflow=${metadata.workflowName}`)
    if (metadata.autonomousToolName !== undefined) details.push(`tool=${metadata.autonomousToolName}`)
    if (metadata.actionName !== undefined) details.push(`action=${metadata.actionName}`)
    if (metadata.errorKind !== undefined) details.push(`errorKind=${metadata.errorKind}`)
    const suffix = details.length > 0 ? ` ${details.join(' ')}` : ''
    this.logger.log(
      `${entry.createdAt} ${entry.status.toUpperCase()} ${entry.durationMs}ms ${entry.source}/${entry.name}${suffix}`,
    )
    const errorMessage = typeof metadata.errorMessage === 'string' ? metadata.errorMessage : undefined
    if (errorMessage !== undefined) {
      const identity =
        typeof metadata.errorCode === 'string'
          ? metadata.errorCode
          : typeof metadata.errorName === 'string'
            ? metadata.errorName
            : 'Error'
      this.logger.log(`  ${identity}: ${errorMessage}`)
    }
    const errorStack = typeof metadata.errorStack === 'string' ? metadata.errorStack : undefined
    if (this.argv.verbose && errorStack !== undefined) {
      for (const line of errorStack.split('\n')) this.logger.log(`  ${line}`)
    }
    const toolInput = firstTraceValue(entry, ['input', 'autonomous.tool.input', 'tool.input'])
    const toolOutput = firstTraceValue(entry, ['output', 'autonomous.tool.output', 'tool.output'])
    if (toolInput !== undefined) this.logger.log(`  input: ${formatTraceValue(toolInput)}`)
    if (toolOutput !== undefined) this.logger.log(`  output: ${formatTraceValue(toolOutput)}`)
    if (this.argv.includeLlm && LLM_TRACE_NAMES.has(entry.name)) {
      for (const [label, value] of [
        ['instructions', firstLlmValue(entry, 'ai.instructions', 'instructions')],
        ['messages', firstLlmValue(entry, 'ai.messages', 'messages')],
        ['tools', firstLlmValue(entry, 'ai.tools', 'tools')],
        ['response', entry.payload.response ?? entry.attributes['ai.response']],
      ] as const) {
        if (value !== undefined) this.logger.log(`  ${label}: ${formatTraceValue(value)}`)
      }
    }
    if (this.argv.verbose) {
      this.logger.log(`  attributes: ${formatTraceValue(entry.attributes)}`)
      this.logger.log(`  payload: ${formatTraceValue(entry.payload)}`)
    }
  }
}

function firstLlmValue(entry: TraceEntry, attributeKey: string, requestKey: string): unknown {
  const request = entry.payload.request
  if (isRecord(request) && request[requestKey] !== undefined) return request[requestKey]
  return entry.attributes[attributeKey]
}

function firstTraceValue(entry: TraceEntry, keys: string[]): unknown {
  for (const key of keys) {
    if (entry.attributes[key] !== undefined) return entry.attributes[key]
    if (entry.payload[key] !== undefined) return entry.payload[key]
  }
  return undefined
}

function formatTraceValue(value: unknown): string {
  return JSON.stringify(value) ?? String(value)
}

type TraceFilterInput = {
  tokens?: string[]
  conversationId?: string
  status?: string
  error?: boolean
  source?: string
  name?: string
  workflow?: string
  action?: string
  traceId?: string
  since?: string
  until?: string
  limit?: number
}

type TraceQuery = Omit<TraceListParams, 'pageSize' | 'nextToken'>

function resolveTraceFilters(input: TraceFilterInput, nowMs: number): { query: TraceQuery; limit: number } {
  const tokens = parseTraceTokens(input.tokens ?? [])
  const conversationId = mergedFilter(input.conversationId, tokens.get('conversation'), 'conversation')
  if (conversationId !== undefined && !CORRELATION_ID.test(conversationId)) {
    throw new errors.BotpressCLIError(
      '--conversation-id must be 1-128 characters using only letters, digits, dot, underscore, colon, or hyphen',
    )
  }

  const rawLimit = mergedFilter(input.limit, tokenNumber(tokens.get('limit'), 'limit'), 'limit') ?? 20
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > MAX_LIMIT) {
    throw new errors.BotpressCLIError(`--limit must be an integer between 1 and ${MAX_LIMIT}`)
  }

  const status = input.status
  if (status !== undefined && !TRACE_STATUSES.has(status)) {
    throw new errors.BotpressCLIError('--status must be one of unset, ok, or error')
  }
  const source = input.source
  if (source !== undefined && !TRACE_FILTER_SOURCES.has(source)) {
    throw new errors.BotpressCLIError('--source is not a supported typed trace source')
  }
  const name = input.name
  if (name !== undefined && !TRACE_FILTER_NAMES.has(name)) {
    throw new errors.BotpressCLIError('--name is not a supported typed trace name')
  }

  const workflow = mergedFilter(input.workflow, tokens.get('workflow'), 'workflow')
  validateCodeFilter(workflow, '--workflow')
  const action = mergedFilter(input.action, tokens.get('action'), 'action')
  validateCodeFilter(action, '--action')

  const rawTraceId = mergedFilter(input.traceId, tokens.get('trace'), 'trace')
  if (rawTraceId !== undefined && (!TRACE_ID.test(rawTraceId) || /^0+$/.test(rawTraceId))) {
    throw new errors.BotpressCLIError('--trace-id must be a non-zero 32-character hexadecimal trace ID')
  }

  const rawSince = mergedFilter(input.since, tokens.get('since'), 'since')
  const rawUntil = mergedFilter(input.until, tokens.get('until'), 'until')
  const since = rawSince === undefined ? undefined : parseTimeFilter(rawSince, '--since', nowMs)
  const until = rawUntil === undefined ? undefined : parseTimeFilter(rawUntil, '--until', nowMs)
  if (since !== undefined && until !== undefined && since.timeMs > until.timeMs) {
    throw new errors.BotpressCLIError('--since must not be after --until')
  }

  if (conversationId === undefined) {
    if (workflow === undefined && action === undefined && rawTraceId === undefined) {
      throw new errors.BotpressCLIError(
        'conversation is required unless a workflow, action, or trace filter is provided',
      )
    }
    if (rawTraceId === undefined && since === undefined) {
      throw new errors.BotpressCLIError('--since is required when querying traces without a conversation')
    }
  }

  const tokenError = tokens.has('error') ? true : undefined
  const error = mergedFilter(input.error, tokenError, 'error')
  return {
    query: {
      ...(conversationId !== undefined ? { conversationId } : {}),
      ...(status !== undefined ? { status: status as TraceListParams['status'] } : {}),
      ...(error !== undefined ? { error } : {}),
      ...(source !== undefined ? { source } : {}),
      ...(name !== undefined ? { name } : {}),
      ...(workflow !== undefined ? { workflow } : {}),
      ...(action !== undefined ? { action } : {}),
      ...(rawTraceId !== undefined ? { traceId: rawTraceId.toLowerCase() } : {}),
      ...(since !== undefined ? { since: since.wire } : {}),
      ...(until !== undefined ? { until: until.wire } : {}),
    },
    limit: rawLimit,
  }
}

function parseTraceTokens(tokens: string[]): Map<string, string> {
  const parsed = new Map<string, string>()
  for (const token of tokens) {
    if (token === 'include-llm') {
      throw new errors.BotpressCLIError(
        'use the --include-llm flag to include canonical LLM request and response content',
      )
    }
    if (token === 'follow') {
      throw new errors.BotpressCLIError('follow is not supported by the cloud trace API')
    }
    if (token === 'error') {
      addToken(parsed, 'error', 'true')
      continue
    }
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) {
      throw new errors.BotpressCLIError(`unknown trace filter token: ${token}`)
    }
    const key = token.slice(0, separator)
    const value = token.slice(separator + 1)
    if (key === 'trigger') {
      throw new errors.BotpressCLIError('trigger is not supported until the API exposes a bounded typed trigger.name')
    }
    if (!['conversation', 'workflow', 'action', 'trace', 'since', 'until', 'limit'].includes(key)) {
      throw new errors.BotpressCLIError(`unknown trace filter token: ${token}`)
    }
    addToken(parsed, key, value)
  }
  return parsed
}

function withoutLlmContent(entry: TraceEntry): TraceEntry {
  const attributes = Object.fromEntries(
    Object.entries(entry.attributes).filter(([key]) => !LLM_ATTRIBUTE_KEYS.has(key)),
  )
  if (!LLM_TRACE_NAMES.has(entry.name)) return { ...entry, attributes }

  const payload = { ...entry.payload }
  delete payload.request
  delete payload.response
  return { ...entry, attributes, payload }
}

function addToken(tokens: Map<string, string>, key: string, value: string): void {
  if (tokens.has(key)) throw new errors.BotpressCLIError(`${key} filter was provided more than once`)
  tokens.set(key, value)
}

function mergedFilter<T>(named: T | undefined, token: T | undefined, label: string): T | undefined {
  if (named !== undefined && token !== undefined) {
    throw new errors.BotpressCLIError(`${label} filter conflict: provide it only once as a flag or token`)
  }
  return named ?? token
}

function tokenNumber(value: string | undefined, label: string): number | undefined {
  if (value === undefined) return undefined
  if (!POSITIVE_DECIMAL_ID.test(value)) {
    throw new errors.BotpressCLIError(`${label}= must be a positive decimal integer`)
  }
  const result = Number(value)
  if (!Number.isSafeInteger(result)) throw new errors.BotpressCLIError(`${label}= is too large`)
  return result
}

function validateCodeFilter(value: string | undefined, flag: string): void {
  if (value !== undefined && !CODE_ID.test(value)) {
    throw new errors.BotpressCLIError(`${flag} must be a 1-64 character workflow/action identifier`)
  }
}

export function parseTracePage(value: unknown, pageSize: number): TracePage {
  if (!isRecord(value) || !Array.isArray(value.traces)) {
    throw new errors.BotpressCLIError('trace response has malformed traces')
  }
  if (!isRecord(value.meta)) {
    throw new errors.BotpressCLIError('trace response has malformed meta')
  }
  if (value.traces.length > pageSize) {
    throw new errors.BotpressCLIError('trace response returned more rows than the requested pageSize')
  }
  const rawNextToken = value.meta.nextToken
  if (rawNextToken !== undefined && typeof rawNextToken !== 'string') {
    throw new errors.BotpressCLIError('trace response has a malformed nextToken')
  }
  if (typeof rawNextToken === 'string' && rawNextToken !== '' && !POSITIVE_DECIMAL_ID.test(rawNextToken)) {
    throw new errors.BotpressCLIError('trace response has a malformed nextToken')
  }
  return {
    traces: value.traces.map((row, index) => parseTraceEntry(row, index)),
    nextToken: rawNextToken || undefined,
  }
}

function parseTraceEntry(value: unknown, index: number): TraceEntry {
  const prefix = `trace response row ${index}`
  if (!isRecord(value)) throw new errors.BotpressCLIError(`${prefix} is malformed`)

  const id = requiredString(value.id, `${prefix}.id`, POSITIVE_DECIMAL_ID)
  const createdAt = requiredTimestamp(value.createdAt, `${prefix}.createdAt`)
  const startedAt = optionalTimestamp(value.startedAt, `${prefix}.startedAt`)
  const endedAt = optionalTimestamp(value.endedAt, `${prefix}.endedAt`)
  const source = requiredEnum(value.source, `${prefix}.source`, TRACE_SOURCES)
  const name = requiredEnum(value.name, `${prefix}.name`, TRACE_NAMES)
  const kind = requiredEnum(value.kind, `${prefix}.kind`, TRACE_KINDS)
  const status = requiredEnum(value.status, `${prefix}.status`, TRACE_STATUSES)
  const traceId = optionalString(value.traceId, `${prefix}.traceId`, TRACE_ID)
  const spanId = optionalString(value.spanId, `${prefix}.spanId`, SPAN_ID)
  const parentSpanId = optionalNullableString(value.parentSpanId, `${prefix}.parentSpanId`, SPAN_ID)
  const conversationId = optionalString(value.conversationId, `${prefix}.conversationId`, CORRELATION_ID)
  const userId = optionalString(value.userId, `${prefix}.userId`, CORRELATION_ID)
  const messageId = optionalString(value.messageId, `${prefix}.messageId`, CORRELATION_ID)
  const durationMs = requiredInteger(value.durationMs, `${prefix}.durationMs`, 0, MAX_DURATION_MS)
  const metadata = value.metadata === undefined ? undefined : parseMetadata(value.metadata, prefix)
  const attributes = optionalRecord(value.attributes, `${prefix}.attributes`)
  const payload = optionalRecord(value.payload, `${prefix}.payload`)

  return {
    id,
    createdAt,
    ...(startedAt !== undefined ? { startedAt } : {}),
    ...(endedAt !== undefined ? { endedAt } : {}),
    source,
    name,
    kind,
    status,
    ...(traceId !== undefined ? { traceId: traceId.toLowerCase() } : {}),
    ...(spanId !== undefined ? { spanId: spanId.toLowerCase() } : {}),
    ...(parentSpanId !== undefined ? { parentSpanId: parentSpanId.toLowerCase() } : {}),
    ...(conversationId !== undefined ? { conversationId } : {}),
    ...(userId !== undefined ? { userId } : {}),
    ...(messageId !== undefined ? { messageId } : {}),
    durationMs,
    ...(metadata !== undefined ? { metadata } : {}),
    attributes,
    payload,
  }
}

function optionalRecord(value: unknown, field: string): Record<string, unknown> {
  if (value === undefined) return {}
  if (!isRecord(value)) throw new errors.BotpressCLIError(`${field} is malformed`)
  return value
}

function parseMetadata(value: unknown, prefix: string): TraceMetadata {
  if (!isRecord(value)) throw new errors.BotpressCLIError(`${prefix}.metadata is malformed`)
  const safe: TraceMetadata = {}
  for (const [field, rule] of Object.entries(METADATA_FIELDS) as Array<
    [keyof typeof METADATA_FIELDS, (typeof METADATA_FIELDS)[keyof typeof METADATA_FIELDS]]
  >) {
    const candidate = value[field]
    if (candidate === undefined) continue
    const path = `${prefix}.metadata.${field}`
    switch (rule.kind) {
      case 'enum':
        safe[field] = requiredEnum(candidate, path, rule.values)
        break
      case 'pattern':
        safe[field] = requiredString(candidate, path, rule.pattern)
        break
      case 'integer':
        safe[field] = requiredInteger(candidate, path, rule.min, rule.max)
        break
      case 'number':
        safe[field] = requiredNumber(candidate, path, rule.min, rule.max)
        break
      case 'string':
        safe[field] = requiredBoundedString(candidate, path, rule.max)
        break
    }
  }
  return safe
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function requiredString(value: unknown, field: string, pattern?: RegExp): string {
  if (typeof value !== 'string' || (pattern !== undefined && !pattern.test(value))) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return value
}

function requiredBoundedString(value: unknown, field: string, max: number): string {
  const result = requiredString(value, field)
  if (result.length === 0 || UTF8_ENCODER.encode(result).byteLength > max) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return result
}

function optionalString(value: unknown, field: string, pattern: RegExp): string | undefined {
  return value === undefined ? undefined : requiredString(value, field, pattern)
}

function optionalNullableString(value: unknown, field: string, pattern: RegExp): string | undefined {
  return value === undefined || value === null ? undefined : requiredString(value, field, pattern)
}

function requiredEnum(value: unknown, field: string, values: ReadonlySet<string>): string {
  if (typeof value !== 'string' || !values.has(value)) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return value
}

function requiredTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return value
}

function optionalTimestamp(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requiredTimestamp(value, field)
}

function requiredInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return value as number
}

function requiredNumber(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return value
}
