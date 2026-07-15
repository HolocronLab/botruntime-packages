import { describe, expect, it, vi } from 'vitest'
import { aggregateRepeatedEvals, runWithConcurrency } from './eval-repeat'

describe('repeated hosted evals', () => {
  it('enforces the concurrency bound while preserving attempt order', async () => {
    let active = 0
    let peak = 0
    const release: Array<() => void> = []
    const tasks = Array.from({ length: 4 }, (_, index) => async () => {
      active++
      peak = Math.max(peak, active)
      await new Promise<void>((resolve) => release.push(resolve))
      active--
      return index
    })

    const pending = runWithConcurrency(tasks, 2)
    await vi.waitFor(() => expect(active).toBe(2))
    release.shift()!()
    await vi.waitFor(() => expect(release).toHaveLength(2))
    release.shift()!()
    await vi.waitFor(() => expect(release).toHaveLength(2))
    while (release.length) release.shift()!()

    await expect(pending).resolves.toEqual([0, 1, 2, 3])
    expect(peak).toBe(2)
  })

  it('computes pass rate, flaky classification, latency percentiles, and safe failure histogram', () => {
    expect(
      aggregateRepeatedEvals([
        { id: '1', passed: true, duration: 100, failedAssertions: [] },
        { id: '2', passed: false, duration: 200, failedAssertions: ['response_contains', 'tool_called'] },
        { id: '3', passed: true, duration: 300, failedAssertions: [] },
      ])
    ).toEqual({
      repeat: 3,
      passedRuns: 2,
      failedRuns: 1,
      passRate: 2 / 3,
      classification: 'flaky',
      p50DurationMs: 200,
      p95DurationMs: 300,
      failureHistogram: { response_contains: 1, tool_called: 1 },
      runIds: ['1', '2', '3'],
    })
  })
})
