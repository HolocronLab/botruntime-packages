import { describe, expect, it } from 'vitest'

import { MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS, resolveHostedEvalIdleTimeout } from './eval-runner-policy'

describe('resolveHostedEvalIdleTimeout', () => {
  it('keeps a single hosted eval below one workflow invocation budget', () => {
    expect(resolveHostedEvalIdleTimeout(300_000)).toBe(MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS)
    expect(resolveHostedEvalIdleTimeout()).toBe(MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS)
    expect(resolveHostedEvalIdleTimeout(30_000)).toBe(30_000)
  })
})
