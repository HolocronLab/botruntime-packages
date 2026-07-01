/**
 * Timing assertion graders.
 * Checks bot response duration against expected thresholds.
 */

import type { TimingAssertion, GraderResult } from '../types'
import { matchValue, operatorToString } from './match'

export function gradeTiming(botDuration: number, assertions: TimingAssertion[]): GraderResult[] {
  const results: GraderResult[] = []

  for (const assertion of assertions) {
    const pass = matchValue(assertion.response_time, botDuration)
    const expected = operatorToString(assertion.response_time)

    results.push({
      assertion: `response_time ${expected}`,
      pass,
      expected: `Response time ${expected}`,
      actual: `${botDuration}ms`,
    })
  }

  return results
}
