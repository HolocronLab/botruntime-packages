import type { SpanSource, SpanSourceCapabilities, TurnWaitOptions, WorkflowWaitOptions } from './span-source'
import type { Span, SpanStatus, TraceMetadata } from './trace'

interface VortexSpanSourceBaseConfig {
  url: string
  pollIntervalMs?: number
}

export type VortexSpanSourceConfig = VortexHumanSpanSourceConfig | VortexBotSpanSourceConfig

export interface VortexHumanSpanSourceConfig extends VortexSpanSourceBaseConfig {
  mode?: 'human'
  /** Personal Access Token used for the human/admin trace reader. */
  pat: string
  /** Positive-decimal workspace database ID. */
  workspaceId: string
  /** Positive-decimal target bot database ID, never the opaque runtime bot ID. */
  targetBotId: string
}

export type VortexBotSpanSourceConfig = VortexSpanSourceBaseConfig &
  (
    | {
        mode: 'bot'
        token: string
        development: true
        runtimeBotId: string
      }
    | {
        mode: 'bot'
        token: string
        development: false
        runtimeBotId?: string
      }
  )

type ResolvedVortexSpanSourceConfig =
  | (Required<Omit<VortexHumanSpanSourceConfig, 'mode'>> & { mode: 'human' })
  | (Required<Omit<VortexSpanSourceBaseConfig, 'pollIntervalMs'>> & {
      mode: 'bot'
      token: string
      development: boolean
      runtimeBotId?: string
      pollIntervalMs: number
    })

interface VortexTraceRow {
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
  parentSpanId?: string | null
  durationMs: number
  metadata?: TraceMetadata
}

interface VortexTraceResponse {
  traces: VortexTraceRow[]
  meta: { nextToken?: string }
}

const POSITIVE_DECIMAL_ID = /^[1-9][0-9]*$/
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const PAGE_SIZE = 1_000
const MAX_PAGES = 10
const MAX_ROWS = 10_000
const MAX_COUNT = 1_000_000_000
const MAX_DURATION_MS = 86_400_000
const MAX_COST = 1_000_000
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/+\-]{0,95}$/
const CODE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/\-]{0,63}$/
const TRACE_ID = /^[0-9a-fA-F]{32}$/
const SPAN_ID = /^[0-9a-fA-F]{16}$/

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
const VORTEX_SPAN_NAMES = new Set([
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

const METADATA_FIELDS = [
  ['endpoint', 'endpoint'],
  ['actionType', 'action.type'],
  ['aiRequestedModel', 'ai.requested_model'],
  ['aiModel', 'ai.model'],
  ['aiProvider', 'ai.provider'],
  ['aiStopReason', 'ai.stop_reason'],
  ['aiMessagesCount', 'ai.messages_count'],
  ['aiInputLength', 'ai.input_length'],
  ['aiInputTokens', 'ai.input_tokens'],
  ['aiOutputTokens', 'ai.output_tokens'],
  ['aiCost', 'ai.cost'],
  ['aiLatencyMs', 'ai.latency_ms'],
  ['integration', 'integration'],
  ['channel', 'channel'],
  ['aiPromptSource', 'ai.prompt_source'],
  ['aiPromptCategory', 'ai.prompt_category'],
  ['autonomousIteration', 'autonomous.iteration'],
  ['autonomousStatus', 'autonomous.status'],
  ['autonomousToolName', 'autonomous.tool.name'],
  ['autonomousToolObject', 'autonomous.tool.object'],
  ['autonomousToolStatus', 'autonomous.tool.status'],
  ['workflowName', 'workflow.name'],
  ['httpStatusCode', 'http.status_code'],
  ['payloadsOmittedCount', 'payloads.omitted_count'],
  ['errorKind', 'error.kind'],
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseTracePage(value: unknown): VortexTraceResponse {
  if (!isRecord(value) || !Array.isArray(value.traces) || !isRecord(value.meta)) {
    throw new Error('Vortex trace response is malformed')
  }

  const nextToken = value.meta.nextToken
  if (nextToken !== undefined && typeof nextToken !== 'string') {
    throw new Error('Vortex trace response has a malformed nextToken')
  }

  return {
    traces: value.traces as VortexTraceRow[],
    meta: nextToken === undefined ? {} : { nextToken },
  }
}

function safeMetadata(value: unknown): Record<string, string | number> {
  if (!isRecord(value)) return {}

  const result: Record<string, string | number> = {}
  for (const [wireName, spanName] of METADATA_FIELDS) {
    const field = safeMetadataValue(wireName, value[wireName])
    if (field !== undefined) result[spanName] = field
  }
  return result
}

function safeMetadataValue(wireName: (typeof METADATA_FIELDS)[number][0], value: unknown): string | number | undefined {
  switch (wireName) {
    case 'endpoint':
      return typeof value === 'string' && ENDPOINTS.has(value) ? value : undefined
    case 'actionType':
      return typeof value === 'string' && ACTION_TYPES.has(value) ? value : undefined
    case 'aiRequestedModel':
    case 'aiModel':
      return typeof value === 'string' && MODEL_ID.test(value) ? value : undefined
    case 'aiProvider':
    case 'integration':
    case 'channel':
    case 'aiPromptSource':
    case 'aiPromptCategory':
    case 'autonomousToolName':
    case 'autonomousToolObject':
    case 'workflowName':
      return typeof value === 'string' && CODE_ID.test(value) ? value : undefined
    case 'aiStopReason':
      return typeof value === 'string' && STOP_REASONS.has(value) ? value : undefined
    case 'autonomousStatus':
      return typeof value === 'string' && AUTONOMOUS_STATUSES.has(value) ? value : undefined
    case 'autonomousToolStatus':
      return typeof value === 'string' && TOOL_STATUSES.has(value) ? value : undefined
    case 'errorKind':
      return typeof value === 'string' && ERROR_KINDS.has(value) ? value : undefined
    case 'aiMessagesCount':
    case 'aiInputLength':
    case 'aiInputTokens':
    case 'aiOutputTokens':
    case 'autonomousIteration':
    case 'payloadsOmittedCount':
      return boundedInteger(value, 0, MAX_COUNT)
    case 'aiLatencyMs':
      return boundedInteger(value, 0, MAX_DURATION_MS)
    case 'httpStatusCode':
      return boundedInteger(value, 100, 599)
    case 'aiCost':
      return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_COST ? value : undefined
  }
}

function boundedInteger(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : undefined
}

function parseTimestamp(value: unknown, field: string): number {
  if (typeof value !== 'string') throw new Error(`Vortex trace row has a malformed ${field}`)
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`Vortex trace row has a malformed ${field}`)
  return timestamp
}

function normalizeStatus(value: unknown): SpanStatus {
  if (value === 'unset') return 'running'
  if (value === 'running' || value === 'error' || value === 'ok') return value
  throw new Error('Vortex trace row has a malformed status')
}

function normalizeHexId(value: unknown, pattern: RegExp): string | undefined {
  if (typeof value !== 'string' || !pattern.test(value) || /^0+$/.test(value)) return undefined
  return value.toLowerCase()
}

function isKnownTraceName(source: unknown, name: unknown): name is string {
  if (typeof source !== 'string' || typeof name !== 'string') return false
  if (source === 'otlp') return VORTEX_SPAN_NAMES.has(name)
  if (source === 'cognitive_v2') return name === 'cognitive.generateText'
  if (source === 'cognitive_action') return name === 'cognitive.generateContent'
  return source === 'observation' && name === 'observation'
}

function traceRowToSpan(value: unknown): Span | undefined {
  if (!isRecord(value)) throw new Error('Vortex trace row is malformed')

  if (!isKnownTraceName(value.source, value.name)) return undefined
  const traceId = normalizeHexId(value.traceId, TRACE_ID)
  const spanId = normalizeHexId(value.spanId, SPAN_ID)
  if (!traceId || !spanId) return undefined

  const startedAt = parseTimestamp(value.startedAt ?? value.createdAt, 'startedAt')
  const endedAt = value.endedAt === undefined ? undefined : parseTimestamp(value.endedAt, 'endedAt')
  const derivedDuration = endedAt === undefined ? 0 : Math.max(0, endedAt - startedAt)
  const duration =
    typeof value.durationMs === 'number' &&
    Number.isInteger(value.durationMs) &&
    value.durationMs >= 0 &&
    value.durationMs <= MAX_DURATION_MS
      ? value.durationMs
      : derivedDuration <= MAX_DURATION_MS
        ? derivedDuration
        : 0

  return {
    id: {
      trace: traceId,
      span: spanId,
      parent: normalizeHexId(value.parentSpanId, SPAN_ID) ?? null,
    },
    name: value.name,
    label: value.name,
    status: normalizeStatus(value.status),
    timing: {
      startedAt,
      ...(endedAt === undefined ? {} : { endedAt }),
      duration,
    },
    context: {},
    tier: 'standard',
    data: safeMetadata(value.metadata),
    resource: {
      environment: 'production',
      versions: {},
    },
  }
}

function spanKey(span: Span): string {
  return `${span.id.trace}:${span.id.span}`
}

function spanData(span: Span): Record<string, unknown> {
  return span.data && typeof span.data === 'object' ? (span.data as Record<string, unknown>) : {}
}

function normalizeSpan(span: Span): Span {
  if (span.status !== 'running') return span
  const data = spanData(span)
  const autonomousStatus = data['autonomous.status']

  if (
    autonomousStatus === 'generation_error' ||
    autonomousStatus === 'execution_error' ||
    autonomousStatus === 'invalid_code_error' ||
    autonomousStatus === 'exit_error' ||
    autonomousStatus === 'aborted'
  ) {
    return { ...span, status: 'error' }
  }

  if (
    autonomousStatus === 'thinking_requested' ||
    autonomousStatus === 'callback_requested' ||
    autonomousStatus === 'exit_success'
  ) {
    return { ...span, status: 'ok' }
  }

  const { startedAt, endedAt } = span.timing
  if (typeof endedAt === 'number' && Number.isFinite(endedAt) && endedAt > startedAt) {
    return { ...span, status: 'ok' }
  }

  return span
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'))
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('aborted'))
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export class VortexSpanSource implements SpanSource {
  static readonly capabilities: SpanSourceCapabilities = {
    toolParameters: false,
    stateMutations: false,
  }
  readonly capabilities = VortexSpanSource.capabilities
  private config: ResolvedVortexSpanSourceConfig
  private conversationId = ''
  private spanMap = new Map<string, Span>()
  private turnStartKeys = new Set<string>()
  private seenHandlerKeys = new Set<string>()

  constructor(config: VortexSpanSourceConfig) {
    const base = {
      url: config.url.replace(/\/+$/, ''),
      pollIntervalMs: config.pollIntervalMs ?? 500,
    }

    if (config.mode === 'bot') {
      if (!config.token.trim()) throw new Error('VortexSpanSource bot token is required')
      if (config.development) {
        if (!CORRELATION_ID.test(config.runtimeBotId)) {
          throw new Error('VortexSpanSource requires a valid runtime bot id in development')
        }
        if (POSITIVE_DECIMAL_ID.test(config.runtimeBotId)) {
          throw new Error('VortexSpanSource development mode requires an opaque runtime bot id')
        }
      }
      this.config = {
        ...base,
        mode: 'bot',
        token: config.token,
        development: config.development,
        ...(config.runtimeBotId ? { runtimeBotId: config.runtimeBotId } : {}),
      }
      return
    }

    if (!config.pat.trim()) throw new Error('VortexSpanSource PAT is required')
    if (!POSITIVE_DECIMAL_ID.test(config.workspaceId)) {
      throw new Error('VortexSpanSource workspaceId must be a positive decimal ID')
    }
    if (!POSITIVE_DECIMAL_ID.test(config.targetBotId)) {
      throw new Error('VortexSpanSource targetBotId must be a positive decimal ID')
    }
    this.config = { ...base, mode: 'human', pat: config.pat, workspaceId: config.workspaceId, targetBotId: config.targetBotId }
  }

  async connect(filter: { conversationId: string }): Promise<void> {
    this.assertConversationId(filter.conversationId)
    this.conversationId = filter.conversationId
    await this._pollOnce()
  }

  /** Validate reader authority before any eval/chat mutation. */
  async assertReadable(): Promise<void> {
    const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
    await this._fetchSpans(`eval-preflight-${suffix}`)
  }

  /**
   * Switch polling to a new conversation while keeping spans and completed
   * handler identities from earlier turns in the eval.
   */
  async repoint(filter: { conversationId: string }): Promise<void> {
    this.assertConversationId(filter.conversationId)
    this.conversationId = filter.conversationId
    await this._pollOnce()
  }

  private static readonly TURN_HANDLER_SPAN_NAMES = new Set(['handler.conversation', 'handler.event'])

  startTurn(): void {
    this.turnStartKeys = new Set(this.spanMap.keys())
    for (const [key, span] of this.spanMap) {
      if (VortexSpanSource.TURN_HANDLER_SPAN_NAMES.has(span.name)) {
        this.seenHandlerKeys.add(key)
      }
    }
  }

  private static readonly SETTLE_POLLS = 3

  async waitForTurnComplete(opts: TurnWaitOptions): Promise<void> {
    const deadline = Date.now() + opts.timeout
    // Honor the requested quiet window by polling at least that long after the
    // handler closes (async follow-through such as a workflow run + callback
    // only executes after the handler closes).
    const maxPolls = opts.settleMaxMs ? Math.floor(opts.settleMaxMs / this.config.pollIntervalMs) : Infinity
    const settlePolls = Math.min(
      maxPolls,
      Math.max(
        VortexSpanSource.SETTLE_POLLS,
        opts.settleQuietMs ? Math.ceil(opts.settleQuietMs / this.config.pollIntervalMs) : 0
      )
    )

    while (Date.now() < deadline) {
      if (opts.abortSignal?.aborted) throw new Error('waitForTurnComplete aborted')

      await this._pollOnce()

      if (this._hasNewCompletedHandler(opts.acceptSpanNames)) {
        for (let i = 0; i < settlePolls; i++) {
          await sleep(this.config.pollIntervalMs, opts.abortSignal).catch(() => {})
          await this._pollOnce()
        }
        return
      }

      await sleep(this.config.pollIntervalMs, opts.abortSignal).catch(() => {})
    }

    throw new Error(`waitForTurnComplete timed out after ${opts.timeout}ms`)
  }

  async waitForWorkflow(name: string, opts: WorkflowWaitOptions): Promise<void> {
    const deadline = Date.now() + opts.timeout

    while (Date.now() < deadline) {
      if (opts.abortSignal?.aborted) throw new Error(`waitForWorkflow("${name}") aborted`)

      await this._pollOnce()

      if (this._matchesWorkflowCondition(name, opts.signal)) return

      await sleep(this.config.pollIntervalMs, opts.abortSignal).catch(() => {})
    }

    throw new Error(`waitForWorkflow("${name}", { signal: "${opts.signal}" }) timed out after ${opts.timeout}ms`)
  }

  getTurnSpans(): Span[] {
    const result: Span[] = []
    for (const [key, span] of this.spanMap) {
      if (!this.turnStartKeys.has(key)) {
        result.push(span)
      }
    }
    return result
  }

  getAllSpans(): Span[] {
    return Array.from(this.spanMap.values())
  }

  disconnect(): void {
    // Stateless polling client.
  }

  private async _pollOnce(): Promise<void> {
    const polledSpans = await this._fetchSpans(this.conversationId)
    for (const rawSpan of polledSpans) {
      const span = normalizeSpan(rawSpan)
      this.spanMap.set(spanKey(span), span)
    }
  }

  private async _fetchSpans(conversationId: string): Promise<Span[]> {
    const polledSpans: Span[] = []
    const seenTokens = new Set<string>()
    let nextToken: string | undefined
    let polledRowCount = 0

    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const path =
        this.config.mode === 'human'
          ? `/v1/admin/workspaces/${this.config.workspaceId}/bots/${this.config.targetBotId}/traces`
          : '/v1/traces'
      const url = new URL(`${this.config.url}${path}`)
      url.searchParams.set('conversationId', conversationId)
      url.searchParams.set('pageSize', String(PAGE_SIZE))
      if (nextToken) url.searchParams.set('nextToken', nextToken)

      const headers: Record<string, string> = {
        Authorization: `Bearer ${this.config.mode === 'human' ? this.config.pat : this.config.token}`,
      }
      if (this.config.mode === 'bot' && this.config.development) {
        headers['x-bot-id'] = this.config.runtimeBotId!
      }
      const res = await fetch(url, { headers })

      if (!res.ok) {
        throw new Error(`Vortex trace reader failed with HTTP ${res.status}`)
      }

      let body: unknown
      try {
        body = await res.json()
      } catch {
        throw new Error('Vortex trace response is malformed JSON')
      }
      const payload = parseTracePage(body)
      if (polledRowCount + payload.traces.length > MAX_ROWS) {
        throw new Error('Vortex trace pagination exceeded the 10,000-row safety limit')
      }
      polledRowCount += payload.traces.length
      for (const row of payload.traces) {
        const span = traceRowToSpan(row)
        if (span) polledSpans.push(span)
      }

      const followingToken = payload.meta.nextToken
      if (!followingToken) {
        return polledSpans
      }
      if (seenTokens.has(followingToken)) {
        throw new Error('Vortex trace pagination cursor loop detected')
      }
      seenTokens.add(followingToken)
      nextToken = followingToken
    }

    throw new Error(`Vortex trace pagination exceeded ${MAX_PAGES} pages`)
  }

  private assertConversationId(conversationId: string): void {
    if (!CORRELATION_ID.test(conversationId)) {
      throw new Error('VortexSpanSource conversationId is malformed')
    }
  }

  private _hasNewCompletedHandler(acceptSpanNames?: ReadonlySet<string>): boolean {
    for (const [key, span] of this.spanMap) {
      if (
        VortexSpanSource.TURN_HANDLER_SPAN_NAMES.has(span.name) &&
        (!acceptSpanNames || acceptSpanNames.has(span.name)) &&
        !this.seenHandlerKeys.has(key) &&
        (span.status === 'ok' || span.status === 'error')
      ) {
        this.seenHandlerKeys.add(key)
        return true
      }
    }
    return false
  }

  private _matchesWorkflowCondition(name: string, signal: 'entered' | 'completed'): boolean {
    for (const span of this.spanMap.values()) {
      if (span.name !== 'handler.workflow') continue
      const d = spanData(span)
      const wfName = d['workflow.name'] || d['workflowName']
      if (wfName !== name) continue
      if (signal === 'entered') return true
      if (signal === 'completed') return span.status === 'ok' || span.status === 'error'
    }
    return false
  }
}
