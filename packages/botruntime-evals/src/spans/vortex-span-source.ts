import type { SpanSource, TurnWaitOptions, WaitOptions, WorkflowWaitOptions } from './span-source'
import type { Span } from './trace'

interface VortexSpanSourceConfig {
  url: string
  botId: string
  workspaceId?: string
  token?: string
  pollIntervalMs?: number
}

type VortexTraceResponse = Span[] | { spans?: Span[] }

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
  private config: Required<Omit<VortexSpanSourceConfig, 'workspaceId' | 'token'>> &
    Pick<VortexSpanSourceConfig, 'workspaceId' | 'token'>
  private conversationId = ''
  private traceIds = new Set<string>()
  private spanMap = new Map<string, Span>()
  private turnStartKeys = new Set<string>()
  private seenHandlerKeys = new Set<string>()
  private consecutiveFailures = 0

  constructor(config: VortexSpanSourceConfig) {
    this.config = {
      url: config.url.replace(/\/$/, ''),
      botId: config.botId,
      pollIntervalMs: config.pollIntervalMs ?? 500,
      ...(config.workspaceId ? { workspaceId: config.workspaceId } : {}),
      ...(config.token ? { token: config.token } : {}),
    }
  }

  async connect(filter: { conversationId: string }): Promise<void> {
    this.conversationId = filter.conversationId
    await this._pollOnce()
  }

  /**
   * Switch polling to a new conversation, keeping `spanMap` and
   * `seenHandlerKeys`. `traceIds` resets — they belonged to the prior conversation.
   */
  async repoint(filter: { conversationId: string }): Promise<void> {
    this.conversationId = filter.conversationId
    this.traceIds = new Set()
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
    const url = new URL(`${this.config.url}/v1/traces/bot/${this.config.botId}/spans/adk`)
    url.searchParams.set('conversationId', this.conversationId)
    for (const traceId of this.traceIds) {
      url.searchParams.append('traceId', traceId)
    }

    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(this.config.token ? { Authorization: `Bearer ${this.config.token}` } : {}),
      },
    })

    if (!res.ok) {
      this.consecutiveFailures++
      const body = await res.text().catch(() => '')
      const msg = `Vortex poll failed: ${res.status} ${body.slice(0, 200)}`
      if (this.consecutiveFailures >= 5) {
        throw new Error(`${msg} (${this.consecutiveFailures} consecutive failures)`)
      }
      console.warn(`[VortexSpanSource] ${msg}`)
      return
    }

    this.consecutiveFailures = 0
    const payload = (await res.json()) as VortexTraceResponse
    const spans = Array.isArray(payload) ? payload : Array.isArray(payload.spans) ? payload.spans : []

    for (const rawSpan of spans) {
      const span = normalizeSpan(rawSpan)
      this.spanMap.set(spanKey(span), span)
      this.traceIds.add(span.id.trace)
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
