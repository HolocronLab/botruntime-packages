import { Workflow } from '../../primitives'
import { KnowledgeIndexingWorkflow } from './knowledge-indexing'
import { EvalRunnerWorkflow } from './eval-runner'

/**
 * Registry of built-in workflows that are automatically included in every agent
 * These workflows are defined in the runtime and don't need to be created by users
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic workflow registry
export const BuiltInWorkflows: Record<string, Workflow<any>> = {
  KnowledgeIndexingWorkflow,
  EvalRunnerWorkflow,
}
