/**
 * Outcome assertion orchestrator.
 * Runs state and workflow graders after all conversation turns complete.
 */

import type { EvalDefinition, GraderResult, StateMutation, WorkflowSpan } from '../types'
import { gradeState } from './state'
import { gradeWorkflows } from './workflow'

/**
 * Grade all outcome assertions after the conversation completes.
 * Takes transformer output (StateMutation[], WorkflowSpan[]) — no raw spans, no API calls.
 */
export function gradeOutcome(
  mutations: StateMutation[],
  evalDef: EvalDefinition,
  workflowSpans: WorkflowSpan[]
): GraderResult[] {
  const outcome = evalDef.outcome
  if (!outcome) return []

  const results: GraderResult[] = []

  if (outcome.state && outcome.state.length > 0) {
    const stateResults = gradeState(mutations, outcome.state)
    results.push(...stateResults)
  }

  if (outcome.workflow && outcome.workflow.length > 0) {
    const workflowResults = gradeWorkflows(workflowSpans, outcome.workflow)
    results.push(...workflowResults)
  }

  return results
}
