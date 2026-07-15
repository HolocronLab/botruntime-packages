export const MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS = 75_000

export function resolveHostedEvalIdleTimeout(configured?: number): number {
  if (!Number.isFinite(configured) || configured === undefined || configured <= 0) {
    return MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS
  }
  return Math.min(configured, MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS)
}
