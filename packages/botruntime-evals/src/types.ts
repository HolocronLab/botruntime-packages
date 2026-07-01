/**
 * Eval type definitions.
 *
 * User-facing types live in @holocronlab/botruntime-evals so eval authors can update eval
 * tooling without tying the authoring API to the agent runtime package.
 */

import type { EvalDefinition as _EvalDefinition } from './definition'

export {
  Eval,
  type EvalDefinition,
  type EvalSetup,
  type ConversationTurn,
  type TurnAssertions,
  type OutcomeAssertions,
  type ResponseAssertion,
  type ToolAssertion,
  type StateAssertion,
  type WorkflowAssertion,
  type TimingAssertion,
  type MatchOperator,
  type NumericOperator,
} from './definition'

export type { Span, SpanStatus } from './spans/trace'
export type { WaitOptions, WorkflowWaitOptions } from './spans/span-source'
import type { SpanSource } from './spans/span-source'
export type { SpanSource }

/**
 * The @holocronlab/botruntime-chat Client *class* (constructor) — not an instance. Callers
 * inject it (the CLI passes its bundled chat client) and the runner calls the
 * static `.connect()`. Typed via `typeof import(...)` so this types-only module
 * doesn't pull in a value import.
 */
export type ChatClient = typeof import('@holocronlab/botruntime-chat').Client

// --- Grader result (universal currency for all graders) ---

export interface GraderResult {
  assertion: string
  pass: boolean
  expected: string
  actual: string
  /**
   * True when the assertion could not actually be evaluated (e.g. the llm_judge had no credentials,
   * returned an empty response, or errored). Distinguishes a genuine pass from a "didn't run" pass.
   * Callers that demand a trustworthy verdict (e.g. the benchmark) should treat `skipped` as a failure.
   */
  skipped?: boolean
}

// --- Tool call extracted from traces ---

export interface ToolCall {
  name: string
  input: Record<string, unknown>
  output: string
  status: string
}

// --- Turn report ---

export interface TurnReport {
  turnIndex: number
  userMessage: string
  botResponse: string
  assertions: GraderResult[]
  pass: boolean
  /** Time spent waiting for the bot to respond (ms) */
  botDuration: number
  /** Time spent fetching traces + running graders (ms) */
  evalDuration: number
}

// --- Single eval report ---

export interface EvalReport {
  name: string
  description?: string
  type?: 'capability' | 'regression'
  tags?: string[]
  turns: TurnReport[]
  outcomeAssertions: GraderResult[]
  pass: boolean
  duration: number
  error?: string
  /** Stable EvalErrorCode when `error` came from a typed EvalRunnerError — lets consumers distinguish setup/config failures from bot failures. */
  errorCode?: string
}

// --- Progress event for real-time UI updates ---

export type EvalProgressEvent =
  | { type: 'suite_start'; totalEvals: number }
  | { type: 'eval_start'; evalName: string; index: number; totalTurns: number }
  | {
      type: 'turn_start'
      evalName: string
      evalIndex: number
      turnIndex: number
      totalTurns: number
      userMessage: string
    }
  | {
      type: 'turn_complete'
      evalName: string
      evalIndex: number
      turnIndex: number
      totalTurns: number
      turnReport: TurnReport
    }
  | { type: 'eval_complete'; evalName: string; index: number; report: EvalReport }
  | { type: 'suite_complete'; report: EvalRunReport; error?: string }

// --- Eval run report (full suite) ---

export interface EvalRunReport {
  id: string
  timestamp: string
  evals: EvalReport[]
  passed: number
  failed: number
  total: number
  duration: number
  filter?: {
    names?: string[]
    tags?: string[]
    type?: 'capability' | 'regression'
  }
  /**
   * True when the suite was aborted mid-run (e.g. user clicked Stop). The
   * persisted report is partial — `evals` reflects only the completed evals,
   * and `total` matches that count, not the original suite size.
   */
  aborted?: boolean
}

// --- Bot connection info ---

export interface BotConnection {
  client: import('@holocronlab/botruntime-client').Client
  botId: string
}

// --- Logger interface ---

export interface EvalLogger {
  info: (message: string) => void
  warn: (message: string) => void
  error: (message: string) => void
}

/**
 * Fallback when no logger is injected (programmatic use outside the CLI).
 * console rather than a no-op so warnings stay visible — a silent default
 * would hide judge failures and skipped pre-flights, the exact swallow
 * anti-pattern docs/ERROR-HANDLING.md bans. The CLI always injects its own
 * structured logger via EvalRunnerConfig.logger.
 */
export const defaultLogger: EvalLogger = console

// --- Eval runner configuration ---

export interface EvalRunnerConfig {
  /** Authenticated Botpress client. Used for state seeding, workflow triggers, webhook discovery, and LLM judge. */
  client: import('@holocronlab/botruntime-client').Client
  botId: string
  /** Path to the agent directory. Used to discover eval files from `<agentPath>/evals/`. Not needed when `definitions` is provided. */
  agentPath?: string
  /** Pre-loaded eval definitions. When provided, `agentPath` is not used for eval discovery. */
  definitions?: _EvalDefinition[]
  /** URL of the dev server providing traces and config. Defaults to the discovered DevConsole URL. */
  devServerUrl?: string
  /** Headers for dev-server requests, e.g. X-Agent-Path when routed through the singleton proxy. */
  devServerHeaders?: Record<string, string>
  /**
   * Optional host-provided chat client. The CLI passes its bundled chat client
   * here so the eval engine does not depend on @botpress/adk.
   */
  chatClient?: ChatClient
  onProgress?: (event: EvalProgressEvent) => void | Promise<void>
  /** Logger for warnings and errors. Defaults to console. */
  logger?: EvalLogger
  /**
   * Called for unexpected (internal-bug) eval failures that runEval folds
   * into report.error — they never propagate to the CLI's command boundary,
   * so without this hook they'd be invisible to error tracking. The CLI binds
   * this to telemetry.captureException; evals itself stays telemetry-free.
   */
  onException?: (error: unknown, properties?: Record<string, unknown>) => void
  /**
   * Optional abort signal — when fired, the suite stops starting new evals.
   * The currently running eval continues to completion (LLM calls in flight
   * cannot always be cancelled), but no further evals are started.
   */
  signal?: AbortSignal
  /** Bot-level eval options from agent.config.ts. Cascades: eval > agent config > default. */
  evalOptions?: {
    idleTimeout?: number
    /** LLM judge pass threshold (integer, 1-5). Values outside this range are clamped. Cascades: eval > agent config > default (3). */
    judgePassThreshold?: number
    /** Model to use for llm_judge assertions (e.g. 'openai:gpt-4o'). Defaults to 'fast'. */
    judgeModel?: string
  }
  /** Factory for creating span sources. Each eval gets its own instance. Defaults to LocalSpanSource (SSE from dev server). */
  createSpanSource?: () => SpanSource
  /** Externally-provided run ID. When set, the runner uses this instead of generating its own. */
  runId?: string
  /** Pre-resolved chat integration webhook ID. Skips the getBot() discovery call when provided. */
  chatWebhookId?: string
  /** Base URL for the chat service. Defaults to the botruntime chat host (https://botruntime.ru). */
  chatBaseUrl?: string
}

// --- Eval suite filter ---

export interface EvalFilter {
  names?: string[]
  tags?: string[]
  type?: 'capability' | 'regression'
}

// --- Transformer types (trace-driven eval engine) ---

export interface StateMutation {
  type: string // 'bot', 'user', 'conversation'
  changedKeys: string[]
  previous: unknown
  current: unknown
  swappedToFile: boolean // data['swapped_to_file'] === true
}

export interface WorkflowSpan {
  name: string
  status: 'running' | 'ok' | 'error'
  statusFinal?: string // 'completed', 'continue', 'failed'
}

export interface TurnData {
  messages: string[]
  toolCalls: ToolCall[]
  stateMutations: StateMutation[]
  workflowSpans: WorkflowSpan[]
  handlerDuration: number
  handlerStatus: 'ok' | 'error'
}
