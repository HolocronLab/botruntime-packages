import { AdkError } from './internal/adk-error'

/**
 * Stable error codes for the eval engine. Typed as a literal union so a typo'd
 * code is a compile error and PostHog issue-slicing stays consistent.
 * Conventions per docs/ERROR-HANDLING.md.
 */
export const EVAL_ERROR_CODES = [
  'EVAL_LOAD_FAILED',
  'EVAL_FILE_EMPTY',
  'EVAL_DUPLICATE_NAME',
  'EVAL_SEED_NO_CONVERSATION',
  'EVAL_TABLE_SETUP_INVALID',
  'EVAL_TABLE_SEED_FAILED',
  'EVAL_TABLE_CLEANUP_FAILED',
  'EVAL_TABLE_ASSERTION_INVALID',
  'EVAL_NO_CONVERSATION_ID',
  'EVAL_TURN_CONFIG_INVALID',
  'EVAL_RELATION_UNDECLARED',
  'EVAL_RELATION_NOT_FOUND',
  'EVAL_RELATION_AMBIGUOUS',
  'EVAL_ABORTED',
  'EVAL_CONTROL_FAILED',
  'EVAL_OBSERVATION_UNSUPPORTED',
  'EVAL_DURABLE_EFFECT_UNSUPPORTED',
  'EVAL_INTERNAL',
  'SSE_CONNECT_FAILED',
  'SSE_NO_BODY',
  'CHAT_CLIENT_MISSING',
  'CHAT_NOT_CONNECTED',
  'CHAT_SESSION_RESUME_FAILED',
  'CHAT_LISTENER_FAILED',
  'CHAT_INTEGRATION_MISSING',
  'CHAT_CHANNEL_UNBOUND',
  'CHAT_PAYLOAD_INVALID',
] as const

export type EvalErrorCode = (typeof EVAL_ERROR_CODES)[number]

export const EVAL_CONTROL_ERROR_KINDS = ['configuration', 'auth', 'timeout', 'upstream'] as const
export type EvalControlErrorKind = (typeof EVAL_CONTROL_ERROR_KINDS)[number]

export function isEvalControlErrorKind(value: unknown): value is EvalControlErrorKind {
  return typeof value === 'string' && (EVAL_CONTROL_ERROR_KINDS as readonly string[]).includes(value)
}

export function evalControlErrorKind(error: unknown): EvalControlErrorKind {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) return 'timeout'
  if (error !== null && typeof error === 'object') {
    const kind = (error as { kind?: unknown }).kind
    if (isEvalControlErrorKind(kind)) return kind
  }
  return 'upstream'
}

/**
 * Typed error for the eval engine. Named EvalRunnerError (not EvalError) to
 * avoid shadowing the JS built-in `EvalError`.
 */
export class EvalRunnerError extends AdkError<EvalErrorCode> {}

export class DurableEvalEffectRetryError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'DurableEvalEffectRetryError'
  }
}
