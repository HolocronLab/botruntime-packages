import { describe, expect, it, vi } from 'vitest'

import { executeWorkflowWithYieldGrace } from './workflow-execution'

type TestResult = { status: 'done'; result: string } | { status: 'continue' }

describe('executeWorkflowWithYieldGrace', () => {
  it('returns the handler result when abort cleanup settles within the grace period', async () => {
    vi.useFakeTimers()
    try {
      const execution = executeWorkflowWithYieldGrace<TestResult>(
        async (signal) =>
          new Promise<TestResult>((resolve) => {
            signal.addEventListener('abort', () => {
              setTimeout(() => resolve({ status: 'done', result: 'terminalized' }), 25)
            })
          }),
        { abortAfterMs: 100, cleanupGraceMs: 50, continuation: { status: 'continue' } }
      )

      await vi.advanceTimersByTimeAsync(125)

      await expect(execution).resolves.toEqual({ status: 'done', result: 'terminalized' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('falls back to continuation when the handler ignores abort past the grace period', async () => {
    vi.useFakeTimers()
    try {
      const execution = executeWorkflowWithYieldGrace<TestResult>(
        async () => new Promise<TestResult>(() => undefined),
        { abortAfterMs: 100, cleanupGraceMs: 50, continuation: { status: 'continue' } }
      )

      await vi.advanceTimersByTimeAsync(150)

      await expect(execution).resolves.toEqual({ status: 'continue' })
    } finally {
      vi.useRealTimers()
    }
  })

  it('propagates a cleanup failure that arrives during the grace period', async () => {
    vi.useFakeTimers()
    try {
      const failure = new Error('cleanup failed')
      const execution = executeWorkflowWithYieldGrace<TestResult>(
        async (signal) =>
          new Promise<TestResult>((_resolve, reject) => {
            signal.addEventListener('abort', () => {
              setTimeout(() => reject(failure), 25)
            })
          }),
        { abortAfterMs: 100, cleanupGraceMs: 50, continuation: { status: 'continue' } }
      )
      const assertion = expect(execution).rejects.toBe(failure)

      await vi.advanceTimersByTimeAsync(125)

      await assertion
    } finally {
      vi.useRealTimers()
    }
  })
})
