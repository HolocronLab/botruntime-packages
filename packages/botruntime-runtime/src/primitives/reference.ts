import { z } from '@holocronlab/botruntime-sdk'
import { WorkflowDefinitions } from '../_types/workflows'
import { StateReference } from '../runtime/state-reference-symbol'
import { BaseWorkflowInstance } from './workflow-instance'

/**
 * Serialized reference to a workflow
 */
export type WorkflowRef = {
  __ref__: 'workflow'
  id: string
}

/**
 * Reference namespace for creating Zui types that serialize as references
 * but are loaded as instances at runtime
 */
export namespace Reference {
  /**
   * Create a Zui schema for a workflow reference.
   *
   * Workflows are automatically serialized to references when saved to state,
   * and automatically loaded back to instances when read from state.
   * This is completely transparent - you always work with `BaseWorkflowInstance<TName>`.
   *
   * @example
   * // Untyped workflow reference
   * const schema = z.object({
   *   workflow: Reference.Workflow()
   * })
   *
   * @example
   * // Typed workflow reference
   * const schema = z.object({
   *   onboarding: Reference.Workflow('onboarding')
   * })
   *
   * @example
   * // In handler - always a WorkflowInstance
   * handler: async ({ state }) => {
   *   // state.onboarding is BaseWorkflowInstance<'onboarding'>
   *   if (state.onboarding.status === 'completed') {
   *     console.log(state.onboarding.output)
   *   }
   * }
   */
  export function Workflow<TName extends keyof WorkflowDefinitions>(
    name: TName
  ): z.ZodType<BaseWorkflowInstance<TName>, z.ZodTypeDef, WorkflowRef | BaseWorkflowInstance<TName>>

  export function Workflow(): z.ZodType<
    BaseWorkflowInstance<keyof WorkflowDefinitions>,
    z.ZodTypeDef,
    WorkflowRef | BaseWorkflowInstance<keyof WorkflowDefinitions>
  >

  export function Workflow<TName extends keyof WorkflowDefinitions>(
    name?: TName
  ): z.ZodType<BaseWorkflowInstance<TName>, z.ZodTypeDef, WorkflowRef | BaseWorkflowInstance<TName>> {
    // Create a custom Zui type that accepts WorkflowRef format (input)
    // but is typed as BaseWorkflowInstance (output) for TypeScript
    const schema = z.custom<BaseWorkflowInstance<TName>>(
      (val): val is BaseWorkflowInstance<TName> => {
        // Accept both WorkflowRef (serialized) and WorkflowInstance (loaded)
        if (val && typeof val === 'object') {
          // Check if it's a serialized reference
          if ('__ref__' in val && val.__ref__ === 'workflow' && 'id' in val) {
            return true
          }
          // Check if it implements StateReference (any state-referenceable object)
          if (StateReference in val && typeof val[StateReference] === 'function') {
            return true
          }
        }
        return false
      },
      {
        message: name ? `Expected workflow reference for "${name as string}"` : 'Expected workflow reference',
      }
    ) as z.ZodType<BaseWorkflowInstance<TName>, z.ZodTypeDef, WorkflowRef | BaseWorkflowInstance<TName>>

    // Add metadata for runtime detection
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing Zui internal _def
    ;(schema as any)._def.workflowRef = true
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing Zui internal _def
    ;(schema as any)._def.workflowName = name

    return schema
  }
}
