export type RepeatedEvalAttempt = {
  id: string
  passed: boolean
  duration: number
  failedAssertions: string[]
}

export async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  maxConcurrency: number
): Promise<T[]> {
  const results = new Array<T>(tasks.length)
  let next = 0
  async function worker(): Promise<void> {
    while (true) {
      const index = next++
      const task = tasks[index]
      if (!task) return
      results[index] = await task()
    }
  }
  await Promise.all(Array.from({ length: Math.min(maxConcurrency, tasks.length) }, () => worker()))
  return results
}

function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]!
}

export function aggregateRepeatedEvals(attempts: RepeatedEvalAttempt[]) {
  const passedRuns = attempts.filter((attempt) => attempt.passed).length
  const failureHistogram: Record<string, number> = {}
  for (const assertion of attempts.flatMap((attempt) => attempt.failedAssertions)) {
    failureHistogram[assertion] = (failureHistogram[assertion] ?? 0) + 1
  }
  const passRate = attempts.length === 0 ? 0 : passedRuns / attempts.length
  return {
    repeat: attempts.length,
    passedRuns,
    failedRuns: attempts.length - passedRuns,
    passRate,
    classification: passRate === 1 ? ('stable-pass' as const) : passRate === 0 ? ('stable-fail' as const) : ('flaky' as const),
    p50DurationMs: percentile(attempts.map((attempt) => attempt.duration), 0.5),
    p95DurationMs: percentile(attempts.map((attempt) => attempt.duration), 0.95),
    failureHistogram,
    runIds: attempts.map((attempt) => attempt.id),
  }
}
