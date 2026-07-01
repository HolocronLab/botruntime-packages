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
  'EVAL_NO_CONVERSATION_ID',
  'EVAL_TURN_CONFIG_INVALID',
  'SSE_CONNECT_FAILED',
  'SSE_NO_BODY',
  'CHAT_CLIENT_MISSING',
  'CHAT_NOT_CONNECTED',
  'CHAT_INTEGRATION_MISSING',
  'CHAT_CHANNEL_UNBOUND',
] as const

export type EvalErrorCode = (typeof EVAL_ERROR_CODES)[number]

/**
 * Typed error for the eval engine. Named EvalRunnerError (not EvalError) to
 * avoid shadowing the JS built-in `EvalError`.
 */
export class EvalRunnerError extends AdkError<EvalErrorCode> {}
