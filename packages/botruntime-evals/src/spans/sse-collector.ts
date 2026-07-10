/**
 * SSECollector — connects to the brt dev server's SSE trace stream,
 * accumulates spans, and provides promise-based wait methods for
 * turn completion and workflow signals.
 *
 * Uses fetch() + async iteration with manual SSE line parsing
 * (Bun does not have native EventSource).
 */

import type { Span } from './trace'
import { EvalRunnerError } from '../errors'

type SSEFilter = { conversationId: string } | { workflowId: string }

interface WaitOptions {
  timeout: number
  /**
   * Optional abort signal — when fired, the wait rejects immediately rather
   * than burning the full timeout. Used by the runner so Stop unblocks
   * pending workflow assertions (otherwise a single negative-result wait
   * can hold the suite hostage for `idleTimeout` per assertion).
   */
  abortSignal?: AbortSignal
}

interface WorkflowWaitOptions extends WaitOptions {
  signal: 'entered' | 'completed'
}

interface TurnWaitOptions extends WaitOptions {
  /**
   * Which handler span names may complete this turn. A user-message turn
   * completes via `handler.conversation` only — async noise such as a
   * workflow callback closes a silent `handler.event` span, and counting it
   * releases the runner early, whose next message then interrupts the
   * still-running handler. An event-driven turn completes via
   * `handler.event`. Omitted = any turn-handler span (legacy behavior).
   */
  acceptSpanNames?: ReadonlySet<string>
  /**
   * Quiet window after the handler closes before the turn is considered
   * settled (default 100 ms). The runner raises it so async follow-through
   * the handler scheduled — a tool-started workflow run and its callback,
   * which only execute AFTER the handler closes — finishes before the next
   * message is sent. A message sent into that window can be absorbed by the
   * follow-through's transcript save and silently skipped as already
   * processed.
   */
  settleQuietMs?: number
  /** Hard cap on the settle phase (default 2 s; the runner raises it with settleQuietMs). */
  settleMaxMs?: number
  /**
   * Fail fast when no accepted handler span has even started within this window — nothing is
   * subscribed, so the turn can never complete. Omitted = wait the full `timeout`.
   */
  handlerStartTimeoutMs?: number
}

/**
 * Unique key for span deduplication.
 */
function spanKey(span: Span): string {
  return `${span.id.trace}:${span.id.span}`
}

/**
 * Type-safe accessor for span.data fields.
 */
function spanData(span: Span): Record<string, unknown> {
  return span.data && typeof span.data === 'object' ? (span.data as Record<string, unknown>) : {}
}

/**
 * Span names that mark a Conversation handler reaching the end of a turn.
 *
 * A turn driven by a user message emits `handler.conversation`; a turn driven
 * by an event (a Conversation's `events:` subscription — e.g. greeting on a
 * conversation-start signal) emits `handler.event`. Both close exactly once
 * per handler invocation, so either is a valid "turn complete" signal.
 */
const TURN_HANDLER_SPAN_NAMES = new Set(['handler.conversation', 'handler.event'])

function isTurnHandlerSpan(span: Span): boolean {
  return TURN_HANDLER_SPAN_NAMES.has(span.name)
}

export class SSECollector {
  private devServerUrl: string
  private headers: Record<string, string>

  /** All spans accumulated since connect(), keyed by spanKey for dedup. */
  private spanMap = new Map<string, Span>()

  /** Index into spanMap insertion order marking where the current turn started. */
  private turnStartKeys = new Set<string>()

  /** Handler span IDs seen before the current turn (for startTurn filtering). */
  private seenHandlerKeys = new Set<string>()

  /** Callbacks waiting for span updates. */
  private waiters: Array<(span: Span) => void> = []

  /** AbortController for the active SSE connection. */
  private abortController: AbortController | null = null

  /** Whether the background loop is running. */
  private connected = false

  /** Error from the SSE stream if it died unexpectedly. */
  private streamError: Error | null = null

  /** Passive counters used only to explain timeout failures. */
  private updateEventCount = 0
  private keepaliveEventCount = 0
  private lastEvent: { name: string; at: number } | null = null

  /** Set while a settle phase is in flight; called by disconnect() to short-circuit. */
  private _cancelSettle: (() => void) | null = null

  constructor(devServerUrl: string, headers: Record<string, string> = {}) {
    this.devServerUrl = devServerUrl
    this.headers = headers
  }

  /**
   * Open a streaming SSE connection filtered by conversationId or workflowId.
   * Starts a background loop that parses SSE events and accumulates spans.
   */
  async connect(filter: SSEFilter): Promise<void> {
    const attributeName = 'conversationId' in filter ? 'conversationId' : 'workflowId'
    const attributeValue = 'conversationId' in filter ? filter.conversationId : filter.workflowId

    const url = `${this.devServerUrl}/api/traces/stream?attributeName=${encodeURIComponent(attributeName)}&attributeValue=${encodeURIComponent(attributeValue)}`

    this.abortController = new AbortController()
    const myController = this.abortController

    const response = await fetch(url, {
      headers: { ...this.headers, Accept: 'text/event-stream' },
      signal: myController.signal,
    })

    if (!response.ok) {
      throw new EvalRunnerError({
        code: 'SSE_CONNECT_FAILED',
        message: `SSE connection failed: ${response.status} ${response.statusText}`,
        expected: true,
        suggestion: 'Make sure the dev server is running (`brt dev`) and reachable.',
      })
    }

    if (!response.body) {
      throw new EvalRunnerError({ code: 'SSE_NO_BODY', message: 'SSE response has no body' })
    }

    this.connected = true

    // Start background parsing loop
    this._consumeStream(response.body).catch((err) => {
      // Ignore the deliberate abort from repoint(): only the current stream's failure counts.
      if (this.connected && this.abortController === myController) {
        this.streamError = err instanceof Error ? err : new Error(String(err))
      }
    })

    // Wait for the initial snapshot to arrive before returning.
    // This ensures that connect() resolves only after the snapshot
    // has been processed so callers can immediately check spans.
    await this._waitForSnapshot()
  }

  /**
   * Re-point at a new conversation, keeping `spanMap` and `seenHandlerKeys` (so
   * the earlier conversation stays visible and its completed handler can't
   * satisfy the next turn). Resets the snapshot latch so connect() awaits the
   * new conversation's snapshot.
   */
  async repoint(filter: SSEFilter): Promise<void> {
    this.connected = false
    this.abortController?.abort()
    this.abortController = null
    this._cancelSettle?.()
    this._cancelSettle = null
    this.waiters = []
    this.snapshotReceived = false
    this.snapshotResolvers = []
    // Clear any prior stream's error so a later timeout reports the new
    // conversation's state, not a dead connection we intentionally closed.
    this.streamError = null
    await this.connect(filter)
  }

  /**
   * Mark the beginning of a new turn.
   * Records which turn-handler span IDs (handler.conversation / handler.event)
   * have been seen so far, so waitForTurnComplete() only resolves on NEW
   * handler completions.
   */
  startTurn(): void {
    // Snapshot the current set of span keys as the turn boundary
    this.turnStartKeys = new Set(this.spanMap.keys())

    // Record all turn-handler spans seen so far
    for (const [key, span] of this.spanMap) {
      if (isTurnHandlerSpan(span)) {
        this.seenHandlerKeys.add(key)
      }
    }
  }

  private static readonly SETTLE_MS = 100

  /**
   * Wait for a turn-handler span (handler.conversation or handler.event) to
   * reach terminal status (ok or error).
   * Only considers spans NOT seen before the last startTurn() call.
   *
   * After the handler closes, waits for a quiet period (no new spans for SETTLE_MS)
   * to ensure all child spans (tool calls, messages, state saves) have arrived.
   * The runtime's HttpSpanExporter fires POSTs without awaiting them, so child
   * spans may arrive slightly after the handler close event.
   */
  async waitForTurnComplete(opts: TurnWaitOptions): Promise<void> {
    const accept = opts.acceptSpanNames
    const settle = { quietMs: opts.settleQuietMs, maxMs: opts.settleMaxMs }
    // Check if a completed handler already exists (e.g. from snapshot)
    if (this._hasNewCompletedHandler(accept)) {
      return this._settleAfterHandler(settle)
    }
    if (opts.abortSignal?.aborted) {
      throw new Error('waitForTurnComplete aborted')
    }

    return new Promise<void>((resolve, reject) => {
      const expected = accept ? [...accept].join(' or ') : 'handler.conversation or handler.event'

      const timer = setTimeout(() => {
        clearStartTimer()
        this._removeWaiter(waiter)
        opts.abortSignal?.removeEventListener('abort', onAbort)
        const reason = this.streamError
          ? `SSE stream died: ${this.streamError.message}`
          : `no ${expected} span completed`
        reject(
          new Error(
            `waitForTurnComplete timed out after ${opts.timeout}ms — ${reason}; diagnostics: ${this._formatTurnDiagnostics()}`
          )
        )
      }, opts.timeout)

      // Early exit: if no accepted handler span has appeared within the grace window, nothing is
      // subscribed to this turn's trigger, so it can never complete. A slow handler is safe — its
      // span appears at start.
      let startTimer: ReturnType<typeof setTimeout> | undefined
      const clearStartTimer = () => {
        if (startTimer !== undefined) clearTimeout(startTimer)
        startTimer = undefined
      }
      if (opts.handlerStartTimeoutMs !== undefined && opts.handlerStartTimeoutMs < opts.timeout) {
        startTimer = setTimeout(() => {
          if (this._hasNewHandlerSpan(accept)) return // dispatched; the main timeout governs completion
          clearTimeout(timer)
          this._removeWaiter(waiter)
          opts.abortSignal?.removeEventListener('abort', onAbort)
          reject(
            new Error(
              `no ${expected} span started within ${opts.handlerStartTimeoutMs}ms — no handler is subscribed ` +
                `to this turn's trigger, so the turn can never complete; diagnostics: ${this._formatTurnDiagnostics()}`
            )
          )
        }, opts.handlerStartTimeoutMs)
      }

      const onAbort = () => {
        clearTimeout(timer)
        clearStartTimer()
        this._removeWaiter(waiter)
        reject(new Error('waitForTurnComplete aborted'))
      }
      opts.abortSignal?.addEventListener('abort', onAbort, { once: true })

      const waiter = (_span: Span) => {
        if (this._hasNewCompletedHandler(accept)) {
          clearTimeout(timer)
          clearStartTimer()
          this._removeWaiter(waiter)
          opts.abortSignal?.removeEventListener('abort', onAbort)
          this._settleAfterHandler(settle).then(resolve, reject)
        }
      }

      this.waiters.push(waiter)
    })
  }

  private static readonly MAX_SETTLE_MS = 2_000

  /**
   * After the handler span closes, wait for spans to stop arriving.
   * Resolves when no new spans arrive for SETTLE_MS, or after MAX_SETTLE_MS hard cap.
   *
   * Exposes a cancellation hook via _cancelSettle so disconnect() can short-
   * circuit an in-flight settle phase and avoid leaking timers for up to 2s.
   */
  private _settleAfterHandler(settle?: { quietMs?: number; maxMs?: number }): Promise<void> {
    const quietMs = settle?.quietMs ?? SSECollector.SETTLE_MS
    const maxMs = settle?.maxMs ?? SSECollector.MAX_SETTLE_MS
    return new Promise<void>((resolve) => {
      let resolved = false
      const done = () => {
        if (resolved) return
        resolved = true
        clearTimeout(hardCap)
        clearTimeout(settleTimer)
        this._removeWaiter(settleWaiter)
        this._cancelSettle = null
        resolve()
      }

      const hardCap = setTimeout(done, maxMs)

      let settleTimer = setTimeout(done, quietMs)

      const settleWaiter = () => {
        if (resolved) return
        clearTimeout(settleTimer)
        settleTimer = setTimeout(done, quietMs)
      }

      this.waiters.push(settleWaiter)
      this._cancelSettle = done
    })
  }

  /**
   * Wait for a handler.workflow span with matching workflow name.
   * - signal 'entered': resolves when the span appears (any status)
   * - signal 'completed': resolves when the span has status !== 'running'
   */
  async waitForWorkflow(name: string, opts: WorkflowWaitOptions): Promise<void> {
    // Check if condition is already met
    if (this._matchesWorkflowCondition(name, opts.signal)) {
      return
    }
    if (opts.abortSignal?.aborted) {
      throw new Error(`waitForWorkflow("${name}", { signal: "${opts.signal}" }) aborted`)
    }

    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this._removeWaiter(waiter)
        opts.abortSignal?.removeEventListener('abort', onAbort)
        const reason = this.streamError ? `SSE stream died: ${this.streamError.message}` : 'span not found'
        reject(
          new Error(
            `waitForWorkflow("${name}", { signal: "${opts.signal}" }) timed out after ${opts.timeout}ms — ${reason}`
          )
        )
      }, opts.timeout)

      const onAbort = () => {
        clearTimeout(timer)
        this._removeWaiter(waiter)
        reject(new Error(`waitForWorkflow("${name}", { signal: "${opts.signal}" }) aborted`))
      }
      opts.abortSignal?.addEventListener('abort', onAbort, { once: true })

      const waiter = (_span: Span) => {
        if (this._matchesWorkflowCondition(name, opts.signal)) {
          clearTimeout(timer)
          this._removeWaiter(waiter)
          opts.abortSignal?.removeEventListener('abort', onAbort)
          resolve()
        }
      }

      this.waiters.push(waiter)
    })
  }

  /**
   * Return spans accumulated since the last startTurn() call.
   */
  getTurnSpans(): Span[] {
    const result: Span[] = []
    for (const [key, span] of this.spanMap) {
      if (!this.turnStartKeys.has(key)) {
        result.push(span)
      }
    }
    return result
  }

  /**
   * Return all spans accumulated since connect().
   */
  getAllSpans(): Span[] {
    return Array.from(this.spanMap.values())
  }

  /**
   * Close the SSE connection and clean up.
   */
  disconnect(): void {
    this.connected = false
    this.abortController?.abort()
    this.abortController = null
    // Short-circuit an in-flight settle phase so its hardCap / settleTimer
    // don't fire after disconnect.
    this._cancelSettle?.()
    this._cancelSettle = null
    // Waiters hold setTimeout references that will reject on their own;
    // clearing the array just prevents further notifications.
    this.waiters = []
    this.snapshotResolvers = []
  }

  // ── Private ──────────────────────────────────────────────────

  /** Whether we have received the initial snapshot. */
  private snapshotReceived = false
  private snapshotResolvers: Array<() => void> = []

  private static readonly SNAPSHOT_TIMEOUT_MS = 10_000

  /**
   * Returns a promise that resolves once the snapshot event has been processed,
   * or rejects after a timeout to prevent connect() from hanging indefinitely.
   */
  private _waitForSnapshot(): Promise<void> {
    if (this.snapshotReceived) {
      return Promise.resolve()
    }
    return new Promise<void>((resolve, reject) => {
      let settled = false
      const resolver = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve()
      }
      const timer = setTimeout(() => {
        if (settled) return
        settled = true
        const idx = this.snapshotResolvers.indexOf(resolver)
        if (idx !== -1) this.snapshotResolvers.splice(idx, 1)
        reject(
          new Error(
            `SSE snapshot not received within ${SSECollector.SNAPSHOT_TIMEOUT_MS}ms — is the dev server healthy?`
          )
        )
      }, SSECollector.SNAPSHOT_TIMEOUT_MS)
      this.snapshotResolvers.push(resolver)
    })
  }

  /**
   * Consume the ReadableStream body, parse SSE lines, and dispatch events.
   */
  private async _consumeStream(body: ReadableStream<Uint8Array>): Promise<void> {
    const decoder = new TextDecoder()
    let buffer = ''

    const reader = body.getReader()

    try {
      while (this.connected) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Split on double-newline boundaries to get complete SSE events
        const parts = buffer.split('\n\n')
        // The last part may be incomplete — keep it in the buffer
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          this._parseSSEBlock(part)
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  /**
   * Parse a single SSE event block (text between \n\n boundaries).
   * Extracts event name and data payload.
   */
  private _parseSSEBlock(block: string): void {
    const lines = block.split('\n')
    let eventName = ''
    let dataLine = ''

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim()
      } else if (line.startsWith('data:')) {
        const value = line.slice('data:'.length).trim()
        dataLine = dataLine ? `${dataLine}\n${value}` : value
      }
      // id: and retry: lines are ignored
    }

    if (!eventName || !dataLine) {
      // Could be a retry: line or empty block — skip
      if (!this.snapshotReceived && block.includes('retry:')) {
        // The retry line comes before the snapshot; don't resolve yet
      }
      return
    }

    try {
      const payload = JSON.parse(dataLine)
      this._handleEvent(eventName, payload)
    } catch {
      // Malformed JSON — skip
    }
  }

  /**
   * Dispatch a parsed SSE event to the appropriate handler.
   */
  private _handleEvent(eventName: string, payload: unknown): void {
    this._recordEvent(eventName)

    if (eventName === 'snapshot') {
      const data = payload as { spans: Span[] }
      const spans = Array.isArray(data.spans) ? data.spans : []
      for (const span of spans) {
        this._upsertSpan(span)
      }
      this.snapshotReceived = true
      for (const resolve of this.snapshotResolvers) {
        resolve()
      }
      this.snapshotResolvers = []
    } else if (eventName === 'update') {
      const data = payload as { span: Span }
      if (data.span) {
        this._upsertSpan(data.span)
        this._notifyWaiters(data.span)
      }
    }
    // keepalive events are intentionally ignored
  }

  private _recordEvent(eventName: string): void {
    this.lastEvent = { name: eventName, at: Date.now() }

    if (eventName === 'update') {
      this.updateEventCount++
    } else if (eventName === 'keepalive') {
      this.keepaliveEventCount++
    }
  }

  private _formatTurnDiagnostics(): string {
    const turnSpans = this.getTurnSpans()
    const spanNames = new Set<string>()
    const handlerStatuses = new Set<string>()

    for (const span of turnSpans) {
      spanNames.add(span.name)
      // Tracks both handler.conversation and handler.event so an event-driven
      // turn that times out still surfaces its handler status.
      if (isTurnHandlerSpan(span)) {
        handlerStatuses.add(span.status)
      }
    }

    const lastEvent = this.lastEvent ? `${this.lastEvent.name} ${Date.now() - this.lastEvent.at}ms ago` : 'none'

    return [
      `snapshotReceived=${this.snapshotReceived}`,
      `totalUpdates=${this.updateEventCount}`,
      `totalKeepalives=${this.keepaliveEventCount}`,
      `lastEvent=${lastEvent}`,
      `totalSpans=${this.spanMap.size}`,
      `turnSpans=${turnSpans.length}`,
      `turnSpanNames=${this._formatSet(spanNames)}`,
      `turnHandlerStatuses=${this._formatSet(handlerStatuses)}`,
    ].join(', ')
  }

  private _formatSet(values: Set<string>, limit = 12): string {
    if (values.size === 0) {
      return 'none'
    }

    const items = Array.from(values)
    const suffix = items.length > limit ? `|+${items.length - limit} more` : ''
    return `${items.slice(0, limit).join('|')}${suffix}`
  }

  /**
   * Insert or replace a span in the map (dedup by trace+span ID).
   */
  private _upsertSpan(span: Span): void {
    this.spanMap.set(spanKey(span), span)
  }

  /**
   * Notify all waiters that a new span was received.
   */
  private _notifyWaiters(span: Span): void {
    // Copy the array since waiters may remove themselves during iteration
    const current = [...this.waiters]
    for (const waiter of current) {
      waiter(span)
    }
  }

  /**
   * Remove a waiter callback from the list.
   */
  private _removeWaiter(fn: (span: Span) => void): void {
    const idx = this.waiters.indexOf(fn)
    if (idx !== -1) {
      this.waiters.splice(idx, 1)
    }
  }

  /**
   * Check if there is a turn-handler span (handler.conversation / handler.event) that:
   * 1. Was NOT seen before startTurn()
   * 2. Has terminal status (ok or error)
   *
   * Marks the matched key as consumed so the same handler span cannot
   * satisfy both the current turn's settle phase AND the next turn's
   * waitForTurnComplete check (which would otherwise resolve instantly
   * against stale data instead of waiting for the new turn's handler).
   */
  private _hasNewCompletedHandler(acceptSpanNames?: ReadonlySet<string>): boolean {
    for (const [key, span] of this.spanMap) {
      if (
        isTurnHandlerSpan(span) &&
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

  /**
   * Whether a turn-handler span has appeared since startTurn() — any status. Proves a handler was
   * dispatched. Never consumes keys (unlike {@link _hasNewCompletedHandler}).
   */
  private _hasNewHandlerSpan(acceptSpanNames?: ReadonlySet<string>): boolean {
    for (const [key, span] of this.spanMap) {
      if (
        isTurnHandlerSpan(span) &&
        (!acceptSpanNames || acceptSpanNames.has(span.name)) &&
        !this.seenHandlerKeys.has(key)
      ) {
        return true
      }
    }
    return false
  }

  /**
   * Check if a handler.workflow span matches the given condition.
   */
  private _matchesWorkflowCondition(name: string, signal: 'entered' | 'completed'): boolean {
    for (const span of this.spanMap.values()) {
      if (span.name !== 'handler.workflow') continue

      const d = spanData(span)
      const wfName = d['workflow.name'] || d['workflowName']
      if (wfName !== name) continue

      if (signal === 'entered') {
        // Any status means the workflow was entered
        return true
      }

      if (signal === 'completed') {
        return span.status === 'ok' || span.status === 'error'
      }
    }
    return false
  }
}
