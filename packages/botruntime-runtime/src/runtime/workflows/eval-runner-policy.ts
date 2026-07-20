import { createStepSignal } from '../../primitives/workflow-signal'

export const MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS = 75_000
const HOSTED_EVAL_PERSISTENCE_MARGIN_MS = 20_000
const WORKFLOW_SANDBOX_YIELD_RESERVE_MS = 15_000
export const MIN_HOSTED_EVAL_PERSISTENCE_BUDGET_MS =
  HOSTED_EVAL_PERSISTENCE_MARGIN_MS + WORKFLOW_SANDBOX_YIELD_RESERVE_MS
export const MIN_HOSTED_EVAL_START_BUDGET_MS =
  MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS + MIN_HOSTED_EVAL_PERSISTENCE_BUDGET_MS

export function resolveHostedEvalIdleTimeout(configured?: number): number {
  if (!Number.isFinite(configured) || configured === undefined || configured <= 0) {
    return MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS
  }
  return Math.min(configured, MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS)
}

/**
 * The workflow handler aborts its signal before the per-request sandbox budget expires.
 * That signal means "persist and continue in the next workflow invocation", not a user Stop.
 * Convert it to the runtime's resumable step signal before the eval lifecycle can mark the
 * durable run terminal-aborted.
 */
export function assertHostedEvalExecutionActive(signal: AbortSignal): void {
  if (signal.aborted) {
    throw createStepSignal()
  }
}

/**
 * An eval step creates conversations and sends messages before its result can be
 * checkpointed. Do not start that side-effecting work near the sandbox yield
 * boundary: replay would otherwise execute the same eval again.
 */
export function assertHostedEvalStartBudget(remainingTimeMs: number): void {
  if (!Number.isFinite(remainingTimeMs) || remainingTimeMs < MIN_HOSTED_EVAL_START_BUDGET_MS) {
    throw createStepSignal()
  }
}

export function assertHostedEvalPersistenceBudget(remainingTimeMs: number): void {
  if (!Number.isFinite(remainingTimeMs) || remainingTimeMs < MIN_HOSTED_EVAL_PERSISTENCE_BUDGET_MS) {
    throw createStepSignal()
  }
}

export function assertHostedEvalInvocationBudget(remainingTimeMs: number): void {
  if (!Number.isFinite(remainingTimeMs) || remainingTimeMs < MIN_HOSTED_EVAL_START_BUDGET_MS) {
    throw new Error(
      `hosted eval requires at least ${MIN_HOSTED_EVAL_START_BUDGET_MS}ms of workflow request budget`,
    )
  }
}
