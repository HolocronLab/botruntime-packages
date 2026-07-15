import { describe, expect, it } from 'vitest'

import { isStepSignal } from '../../primitives/workflow-signal'
import {
  assertHostedEvalExecutionActive,
  MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS,
  resolveHostedEvalIdleTimeout,
} from './eval-runner-policy'

describe('resolveHostedEvalIdleTimeout', () => {
  it('keeps a single hosted eval below one workflow invocation budget', () => {
    expect(resolveHostedEvalIdleTimeout(300_000)).toBe(MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS)
    expect(resolveHostedEvalIdleTimeout()).toBe(MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS)
    expect(resolveHostedEvalIdleTimeout(30_000)).toBe(30_000)
  })
})

describe('assertHostedEvalExecutionActive', () => {
  it('turns the workflow execution budget abort into a resumable step signal', () => {
    const controller = new AbortController()
    controller.abort()

    let caught: unknown
    try {
      assertHostedEvalExecutionActive(controller.signal)
    } catch (error) {
      caught = error
    }

    expect(isStepSignal(caught)).toBe(true)
  })

  it('does not interrupt an active hosted eval execution', () => {
    expect(() => assertHostedEvalExecutionActive(new AbortController().signal)).not.toThrow()
  })
})
