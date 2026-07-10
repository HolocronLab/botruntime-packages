import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
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

const TRACE_SOURCES = new Set(['otlp', 'cognitive_v2', 'cognitive_action', 'observation', 'unknown'])
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
  'observation',
  'unknown',
])
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

const METADATA_FIELDS = {
  endpoint: { kind: 'enum', values: ENDPOINTS },
  actionType: { kind: 'enum', values: ACTION_TYPES },
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
  durationMs: number
  metadata?: TraceMetadata
}

type TracePage = { traces: TraceEntry[]; nextToken?: string }

export type TracesCommandDefinition = typeof commandDefinitions.traces

export class TracesCommand extends CloudCommand<TracesCommandDefinition> {
  public async run(): Promise<void> {
    const conversationId = this.argv.conversationId
    if (!CORRELATION_ID.test(conversationId)) {
      throw new errors.BotpressCLIError(
        '--conversation-id must be 1-128 characters using only letters, digits, dot, underscore, colon, or hyphen'
      )
    }

    const limit = this.argv.limit
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw new errors.BotpressCLIError(`--limit must be an integer between 1 and ${MAX_LIMIT}`)
    }
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
      const raw = await target.fetchPage({ conversationId, pageSize, nextToken }).catch((thrown) => {
        throw errors.BotpressCLIError.wrap(
          thrown,
          'could not fetch privacy-safe traces; check network connectivity, the API URL, and the selected target'
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

    const output = {
      schemaVersion: 1,
      target: target.output,
      conversationId,
      traces,
      nextToken: nextToken ?? null,
    }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }

    for (const entry of traces) this._printHuman(entry)
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
    fetchPage: (params: { conversationId: string; pageSize: number; nextToken?: string }) => Promise<unknown>
  }> {
    if (this.targetsDevBot) {
      const { client, workspaceId, runtimeBotId, targetBotId } = await this.devCloudapiTarget()
      return {
        output: {
          environment: 'development',
          workspaceId,
          runtimeBotId,
          targetBotId,
        },
        fetchPage: (params) => client.listDevelopmentTraces(runtimeBotId, params),
      }
    }

    const link = this.loadLink()
    const botId = this.requireBotId(link)
    const workspaceId = requirePositiveIdentity('workspaceId', link.workspaceId)
    requirePositiveIdentity('botId', botId)
    const { profile } = await this.resolveProfile()
    const apiUrl = this.resolveApiUrl(profile, link)
    const client = this.machineCloudapiClient(profile, apiUrl)
    return {
      output: { environment: 'production', workspaceId, botId },
      fetchPage: (params) => client.listWorkspaceTraces(workspaceId, botId, params),
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
    if (metadata.errorKind !== undefined) details.push(`errorKind=${metadata.errorKind}`)
    const suffix = details.length > 0 ? ` ${details.join(' ')}` : ''
    this.logger.log(
      `${entry.createdAt} ${entry.status.toUpperCase()} ${entry.durationMs}ms ${entry.source}/${entry.name}${suffix}`
    )
  }
}

function requirePositiveIdentity(field: 'workspaceId' | 'botId', value: string | undefined): string {
  if (value === undefined) {
    throw new errors.BotpressCLIError(
      `canonical project link has no ${field}; run \`brt link --bot-id <id> --workspace-id <id>\` first`
    )
  }
  if (!POSITIVE_DECIMAL_ID.test(value)) {
    throw new errors.BotpressCLIError(`canonical project link ${field} must be a positive decimal ID`)
  }
  return value
}

function parseTracePage(value: unknown, pageSize: number): TracePage {
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
  const durationMs = requiredInteger(value.durationMs, `${prefix}.durationMs`, 0, MAX_DURATION_MS)
  const metadata = value.metadata === undefined ? undefined : parseMetadata(value.metadata, prefix)

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
    durationMs,
    ...(metadata !== undefined ? { metadata } : {}),
  }
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
