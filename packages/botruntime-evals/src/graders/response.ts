/**
 * Response assertion graders.
 * Checks bot response text against expected assertions.
 */

import type { ResponseAssertion, GraderResult } from '../types'
import { gradeLLMJudge } from './llm'

export async function gradeResponse(
  botResponse: string,
  assertions: ResponseAssertion[],
  context: { userMessage: string; judgePassThreshold?: number }
): Promise<GraderResult[]> {
  const results: GraderResult[] = []

  for (const assertion of assertions) {
    if ('contains' in assertion) {
      const pass = botResponse.toLowerCase().includes(assertion.contains.toLowerCase())
      results.push({
        assertion: `contains "${assertion.contains}"`,
        pass,
        expected: `Response contains "${assertion.contains}"`,
        actual: pass ? `Found in response` : `Not found in response`,
      })
      continue
    }

    if ('not_contains' in assertion) {
      const pass = !botResponse.toLowerCase().includes(assertion.not_contains.toLowerCase())
      results.push({
        assertion: `not_contains "${assertion.not_contains}"`,
        pass,
        expected: `Response does not contain "${assertion.not_contains}"`,
        actual: pass ? `Not found in response` : `Found in response`,
      })
      continue
    }

    if ('matches' in assertion) {
      const regex = new RegExp(assertion.matches, 'i')
      const pass = regex.test(botResponse)
      results.push({
        assertion: `matches ${assertion.matches}`,
        pass,
        expected: `Response matches /${assertion.matches}/`,
        actual: pass ? `Matched` : `No match`,
      })
      continue
    }

    if ('llm_judge' in assertion) {
      const result = await gradeLLMJudge(botResponse, assertion.llm_judge, {
        userMessage: context.userMessage,
        ...(context.judgePassThreshold !== undefined ? { passThreshold: context.judgePassThreshold } : {}),
      })
      results.push(result)
      continue
    }

    // TODO: uncomment this once we support it
    // if ('similar_to' in assertion) {
    //   results.push({
    //     assertion: `similar_to: "${assertion.similar_to}"`,
    //     pass: true,
    //     expected: assertion.similar_to,
    //     actual: 'SKIPPED — similar_to not yet implemented',
    //   })
    //   continue
    // }

    results.push({
      assertion: 'unknown',
      pass: false,
      expected: 'known assertion type',
      actual: `Unknown assertion: ${JSON.stringify(assertion)}`,
    })
  }

  return results
}
