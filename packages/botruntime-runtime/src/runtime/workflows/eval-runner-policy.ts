import { createStepSignal } from '../../primitives/workflow-signal'

export const MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS = 75_000

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
