/**
 * Workflow assertion graders.
 * Checks workflow execution via transformer-produced WorkflowSpan data.
 */

import type { WorkflowAssertion, WorkflowSpan, GraderResult } from '../types'

export function gradeWorkflows(workflows: WorkflowSpan[], assertions: WorkflowAssertion[]): GraderResult[] {
  const results: GraderResult[] = []

  for (const assertion of assertions) {
    const matching = workflows.filter((wf) => wf.name === assertion.name)

    // entered — was the workflow triggered at all?
    if (assertion.entered !== undefined) {
      const wasEntered = matching.length > 0
      const pass = assertion.entered ? wasEntered : !wasEntered

      results.push({
        assertion: `workflow: ${assertion.name} ${assertion.entered ? 'entered' : 'not entered'}`,
        pass,
        expected: assertion.entered
          ? `Workflow "${assertion.name}" was entered`
          : `Workflow "${assertion.name}" was not entered`,
        actual: wasEntered ? `Found ${matching.length} workflow span(s)` : `No workflow spans found`,
      })
    }

    // completed — did the workflow complete?
    if (assertion.completed !== undefined) {
      const didComplete = matching.some(
        (wf) => wf.statusFinal === 'completed' || wf.status === 'ok' || wf.status === 'error'
      )
      const pass = assertion.completed ? didComplete : !didComplete

      results.push({
        assertion: `workflow: ${assertion.name} ${assertion.completed ? 'completed' : 'not completed'}`,
        pass,
        expected: assertion.completed
          ? `Workflow "${assertion.name}" completed`
          : `Workflow "${assertion.name}" did not complete`,
        actual: didComplete ? `Completed` : `Not completed`,
      })
    }
  }

  return results
}
