/**
 * Tool assertion graders.
 * Checks tool calls from traces against expected assertions.
 */

import type { ToolAssertion, ToolCall, GraderResult } from '../types'
import { matchValue, operatorToString } from './match'

export function gradeTools(toolCalls: ToolCall[], assertions: ToolAssertion[]): GraderResult[] {
  return assertions.map((assertion) => {
    // --- called ---
    if ('called' in assertion && !('not_called' in assertion) && !('call_order' in assertion)) {
      const matches = toolCalls.filter((tc) => tc.name === assertion.called)
      const wasCalled = matches.length > 0

      if (!wasCalled) {
        return {
          assertion: `tool called: ${assertion.called}`,
          pass: false,
          expected: `${assertion.called} was called`,
          actual: `Not called. Tools called: [${toolCalls.map((tc) => tc.name).join(', ') || 'none'}]`,
        }
      }

      // Check params if specified
      if (assertion.params) {
        const paramResults: { key: string; pass: boolean; detail: string }[] = []

        for (const [key, operator] of Object.entries(assertion.params)) {
          // Check across all matching calls — pass if any call matches
          const anyMatch = matches.some((tc) => matchValue(operator, tc.input[key]))
          paramResults.push({
            key,
            pass: anyMatch,
            detail: anyMatch
              ? `matched`
              : `expected ${key} ${operatorToString(operator)}, got ${JSON.stringify(matches.map((tc) => tc.input[key]))}`,
          })
        }

        const allParamsPass = paramResults.every((p) => p.pass)
        const failedParams = paramResults.filter((p) => !p.pass)

        return {
          assertion: `tool called: ${assertion.called} with params`,
          pass: allParamsPass,
          expected: `${assertion.called} called with ${Object.entries(assertion.params)
            .map(([k, v]) => `${k} ${operatorToString(v)}`)
            .join(', ')}`,
          actual: allParamsPass ? `Matched` : failedParams.map((p) => p.detail).join('; '),
        }
      }

      return {
        assertion: `tool called: ${assertion.called}`,
        pass: true,
        expected: `${assertion.called} was called`,
        actual: `Called ${matches.length} time(s)`,
      }
    }

    // --- not_called ---
    if ('not_called' in assertion) {
      const wasCalled = toolCalls.some((tc) => tc.name === assertion.not_called)
      return {
        assertion: `tool not_called: ${assertion.not_called}`,
        pass: !wasCalled,
        expected: `${assertion.not_called} was NOT called`,
        actual: wasCalled ? `Was called` : `Not called`,
      }
    }

    // --- call_order ---
    if ('call_order' in assertion) {
      const calledNames = toolCalls.map((tc) => tc.name)
      const expectedOrder = assertion.call_order as string[]

      // Check that the expected sequence appears in order (not necessarily contiguous)
      let cursor = 0
      for (const name of calledNames) {
        if (cursor < expectedOrder.length && name === expectedOrder[cursor]) {
          cursor++
        }
      }
      const inOrder = cursor === expectedOrder.length

      return {
        assertion: `call_order: [${expectedOrder.join(' → ')}]`,
        pass: inOrder,
        expected: `Tools called in order: [${expectedOrder.join(' → ')}]`,
        actual: `Actual order: [${calledNames.join(' → ') || 'none'}]`,
      }
    }

    return {
      assertion: 'unknown tool assertion',
      pass: false,
      expected: 'known assertion type',
      actual: `Unknown: ${JSON.stringify(assertion)}`,
    }
  })
}
