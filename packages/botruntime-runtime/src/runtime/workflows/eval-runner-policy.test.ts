import { describe, expect, it } from 'vitest'

import { isStepSignal } from '../../primitives/workflow-signal'
import {
  assertHostedEvalExecutionActive,
  assertHostedEvalInvocationBudget,
  assertHostedEvalPersistenceBudget,
  assertHostedEvalStartBudget,
  MAX_HOSTED_EVAL_IDLE_TIMEOUT_MS,
  MIN_HOSTED_EVAL_START_BUDGET_MS,
  MIN_HOSTED_EVAL_PERSISTENCE_BUDGET_MS,
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

describe('assertHostedEvalStartBudget', () => {
  it('yields before starting eval side effects when the sandbox cannot finish one checkpoint', () => {
    let caught: unknown
    try {
      assertHostedEvalStartBudget(MIN_HOSTED_EVAL_START_BUDGET_MS - 1)
    } catch (error) {
      caught = error
    }

    expect(isStepSignal(caught)).toBe(true)
  })

  it('allows an eval to start only at or above the safe checkpoint budget', () => {
    expect(() => assertHostedEvalStartBudget(MIN_HOSTED_EVAL_START_BUDGET_MS)).not.toThrow()
    expect(() => assertHostedEvalStartBudget(MIN_HOSTED_EVAL_START_BUDGET_MS + 1)).not.toThrow()
  })

  it('fails closed for an invalid remaining-time reading', () => {
    expect(() => assertHostedEvalStartBudget(Number.NaN)).toThrow()
    expect(() => assertHostedEvalStartBudget(Number.POSITIVE_INFINITY)).toThrow()
  })
})

describe('assertHostedEvalPersistenceBudget', () => {
  it('allows cached result persistence later in the same invocation', () => {
    expect(() => assertHostedEvalPersistenceBudget(MIN_HOSTED_EVAL_PERSISTENCE_BUDGET_MS)).not.toThrow()
  })

  it('yields before a result write when there is no persistence reserve', () => {
    let caught: unknown
    try {
      assertHostedEvalPersistenceBudget(MIN_HOSTED_EVAL_PERSISTENCE_BUDGET_MS - 1)
    } catch (error) {
      caught = error
    }
    expect(isStepSignal(caught)).toBe(true)
  })
})

describe('assertHostedEvalInvocationBudget', () => {
  it('fails loud when the host request ceiling can never fit a hosted eval checkpoint', () => {
    expect(() => assertHostedEvalInvocationBudget(MIN_HOSTED_EVAL_START_BUDGET_MS - 1)).toThrow(
      'hosted eval requires at least',
    )
  })

  it('accepts a host invocation with the required initial budget', () => {
    expect(() => assertHostedEvalInvocationBudget(MIN_HOSTED_EVAL_START_BUDGET_MS)).not.toThrow()
  })
})
