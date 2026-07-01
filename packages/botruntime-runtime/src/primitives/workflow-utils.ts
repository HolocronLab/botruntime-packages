import { Client, Workflow } from '@holocronlab/botruntime-client'
import { context, z } from '../library'
import { WorkflowDataRequestEvent } from '../runtime'
import { isEvent } from '../utilities/events'

type UpdateWorkflowInput = Client['updateWorkflow']
export const updateWorkflow: UpdateWorkflowInput = async (props) => {
  const client = context.get('client')
  const workflowId = props.id
  const workflowsToUpdate: Workflow[] = []

  const ctxWorkflow = context.get('workflow', { optional: true })
  const ctxWorkflowControl = context.get('workflowControlContext', {
    optional: true,
  })

  if (ctxWorkflow?.id === workflowId) {
    workflowsToUpdate.push(ctxWorkflow)
  }

  if (ctxWorkflowControl?.workflow?.id === workflowId) {
    workflowsToUpdate.push(ctxWorkflowControl.workflow)
  }

  const workflowAlreadyDone = workflowsToUpdate.find(
    (wf) => wf.status === 'cancelled' || wf.status === 'completed' || wf.status === 'failed' || wf.status === 'timedout'
  )

  const remainingTimeMs = context.get('runtime', { optional: true })?.getRemainingExecutionTimeInMs()

  if (workflowAlreadyDone) {
    if (props.status) {
      console.info(
        `[workflow] skipping update of ${workflowId} to "${props.status}": already "${workflowAlreadyDone.status}" locally (remaining sandbox time: ${remainingTimeMs}ms)`
      )
    }
    return { workflow: workflowAlreadyDone }
  }

  if (props.status) {
    console.info(
      `[workflow] updating ${workflowId} status to "${props.status}" (remaining sandbox time: ${remainingTimeMs}ms)`
    )
  }

  let response: Awaited<ReturnType<Client['updateWorkflow']>>
  try {
    response = await client.updateWorkflow(props)
  } catch (err) {
    const serverStatus: string = await client
      .getWorkflow({ id: workflowId })
      .then((res) => res.workflow.status)
      .catch(() => 'unknown (fetch failed)')
    console.warn(
      `[workflow] failed to update ${workflowId} to status "${props.status}": server-side status is "${serverStatus}" (remaining sandbox time: ${remainingTimeMs}ms)`,
      err
    )
    throw err
  }

  for (const wf of workflowsToUpdate) {
    Object.assign(wf, response.workflow)
  }

  return response
}

/**
 * @deprecated Use the type === "workflow_request" guard in the conversation handler instead. This sets the type of the event property while also providing additional context.
 * @example
 * if (type === "workflow_request") {
 *   await request.workflow.provide('foo', { foo: "bar" }, request.step)
 * }
 *
 * @description
 * Type guard to check if an event is a workflow data request.
 * Use this in conversation handlers to detect when a workflow needs data.
 * @param event - The event to check
 * @returns True if the event is a WorkflowDataRequest
 * @example
 * if (isWorkflowDataRequest(event)) {
 *   await MyWorkflow.provide(event, { orderId: "12345" });
 * }
 */
export function isWorkflowDataRequest(event: unknown): event is {
  type: typeof WorkflowDataRequestEvent.name
  payload: z.infer<typeof WorkflowDataRequestEvent.schema>
} {
  return isEvent(event) && event.type === WorkflowDataRequestEvent.name
}

/**
 * Type guard to narrow workflow instance by name.
 * Use this in conversation handlers to get properly typed workflow instances.
 * @param workflow - The workflow instance to check
 * @param name - The workflow name to check against
 * @returns True if the workflow matches the given name
 * @example
 * if (type === 'workflow_request' && isWorkflow(request.workflow, 'test3')) {
 *   // workflow is now typed as BaseWorkflowInstance<'test3'>
 *   await request.workflow.provide('topic', { topic: "Hello" }, request.step)
 * }
 */
export function isWorkflow<TName extends string>(
  workflow: { name: string } | undefined,
  name: TName
): workflow is import('./workflow-instance').BaseWorkflowInstance<
  TName extends keyof import('../_types/workflows').WorkflowDefinitions ? TName : never
> {
  return workflow?.name === name
}
