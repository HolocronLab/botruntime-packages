import type { Span } from './trace'

export interface WaitOptions {
  timeout: number
  abortSignal?: AbortSignal
}

export interface WorkflowWaitOptions extends WaitOptions {
  signal: 'entered' | 'completed'
}

export interface TurnWaitOptions extends WaitOptions {
  /**
   * Which handler span names may complete this turn (e.g. a user-message turn
   * completes via `handler.conversation`, an event-driven turn via
   * `handler.event`). Omitted = any turn-handler span.
   */
  acceptSpanNames?: ReadonlySet<string>
  /** Quiet window after the handler closes before the turn counts as settled. */
  settleQuietMs?: number
  /** Hard cap on the settle phase. */
  settleMaxMs?: number
  /**
   * Fail fast when no accepted handler span has even started within this window — nothing is
   * subscribed, so the turn can never complete. Omitted = wait the full `timeout`.
   */
  handlerStartTimeoutMs?: number
}

export interface SpanSourceCapabilities {
  /** Tool input is observable, so declared `params` assertions are gradeable. */
  toolParameters: boolean
  /** State mutation values are observable, so state assertions are gradeable. */
  stateMutations: boolean
}

export interface SpanSource {
  readonly capabilities: SpanSourceCapabilities
  /** Auth/scope/readability preflight that must not mutate eval/chat state. */
  assertReadable?(): Promise<void>
  connect(filter: { conversationId: string }): Promise<void>
  /**
   * Re-point the stream at a new conversation, keeping spans already
   * accumulated (so outcome assertions still see the earlier conversation and
   * its completed handler can't satisfy the next turn).
   */
  repoint(filter: { conversationId: string }): Promise<void>
  startTurn(): void
  waitForTurnComplete(opts: TurnWaitOptions): Promise<void>
  waitForWorkflow(name: string, opts: WorkflowWaitOptions): Promise<void>
  getTurnSpans(): Span[]
  getAllSpans(): Span[]
  disconnect(): void
}
