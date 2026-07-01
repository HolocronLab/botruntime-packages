import type { Client } from '@holocronlab/botruntime-client'
import type { WorkflowControlContext } from '../runtime/context/context'
import { withSilentTracing } from '../telemetry/tracing'

/**
 * Polls the Botpress API to detect if a workflow has been cancelled, failed, or timed out.
 * When detected, updates the workflow control context which will cause the workflow to abort
 * on the next step execution (before/after step checks).
 *
 * @param props Configuration for the cancellation monitor
 * @param props.client Botpress client instance
 * @param props.workflowId ID of the workflow to monitor
 * @param props.workflowControlContext Workflow control context to update
 * @param props.abortSignal Abort signal to check if monitoring should stop
 * @param props.pollIntervalMs Polling interval in milliseconds (default: 1000)
 * @returns Cleanup function to stop monitoring
 *
 * @example
 * const cleanup = startWorkflowCancellationMonitor({
 *   client,
 *   workflowId: workflow.id,
 *   workflowControlContext,
 *   abortSignal,
 * })
 *
 * try {
 *   await instance.handle(abortSignal)
 * } finally {
 *   cleanup()
 * }
 */
export function startWorkflowCancellationMonitor(props: {
  client: Client
  workflowId: string
  workflowControlContext: WorkflowControlContext
  abortSignal: AbortSignal
  pollIntervalMs?: number
}): () => void {
  const { client, workflowId, workflowControlContext, abortSignal, pollIntervalMs = 1000 } = props

  // Don't start polling if already aborted
  if (abortSignal.aborted) {
    return () => {}
  }

  const interval = setInterval(async () => {
    // Stop polling if the signal was aborted
    if (abortSignal.aborted) {
      clearInterval(interval)
      return
    }

    try {
      // Fetch the latest workflow status from the API (silent — no trace spans)
      const { workflow } = await withSilentTracing(() => client.getWorkflow({ id: workflowId }))

      // Check if workflow has been terminated
      const isTerminated =
        workflow.status === 'cancelled' || workflow.status === 'failed' || workflow.status === 'timedout'

      if (isTerminated) {
        // Update the workflow control context to prevent recovery attempts
        // This will cause the workflow to abort on the next step check
        workflowControlContext.aborted = true

        // If it's a failure or timeout, also mark as failed
        if (workflow.status === 'failed' || workflow.status === 'timedout') {
          workflowControlContext.failed = true
          workflowControlContext.failedReason =
            workflow.status === 'timedout'
              ? 'Workflow timed out'
              : // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type missing failureReason field
                (workflow as any).failureReason ||
                workflow.output?.error ||
                'Workflow was externally marked as failed (no reason provided)'
        }

        // Stop polling
        clearInterval(interval)
      }
    } catch (error) {
      // If we can't fetch the workflow status, log but continue polling
      // This could be a transient network error
      console.warn(`Failed to check workflow status for ${workflowId}:`, error)
    }
  }, pollIntervalMs)

  // Return cleanup function
  return () => {
    clearInterval(interval)
  }
}
