import { OPERATION_SUBTYPE_HEADER } from '../../consts'

import type { BotImplementation } from '@holocronlab/botruntime-sdk/dist/bot/implementation'
import {
  context,
  registerRequestHook,
  SubworkflowFinished,
  TrackedState,
  TrackedTags,
  TrackedUserProfile,
  WorkflowCallbackEvent,
  WorkflowContinueEvent,
} from '..'

import { WorkflowHandlers } from '@holocronlab/botruntime-sdk/dist/bot'
import { BaseWorkflowInstance } from '../../primitives'
import { step } from '../../primitives/workflow-step'
import { z } from '@holocronlab/botruntime-sdk'
import { span } from '../../telemetry/tracing'
import { SpanStatusCode } from '@opentelemetry/api'
import { adk } from '../adk'
import { updateWorkflow } from '../../primitives/workflow-utils'
import { Errors } from '../../errors'
import ms from 'ms'

export const setup = (bot: BotImplementation) => {
  // Register workflow execution handler

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic workflow handler type
  const handler: WorkflowHandlers<any>[string] = async function ({ workflow, event, client, ctx, conversation }) {
    await span(
      'handler.workflow',
      {
        botId: ctx.botId,
        workflowId: workflow.id,
        eventId: event.id,
        'event.type': event.type,
        integration: conversation?.integration,
        channel: conversation?.channel,
        conversationId: workflow.conversationId,
        userId: event.userId,
        'workflow.name': workflow.name,
        'workflow.status.initial': workflow.status,
      },
      async (s) => {
        const workflowDefinition = adk.project.workflows.find((w) => w.name === workflow.name)

        if (!workflowDefinition?._handler) {
          const reason = `No ADK Workflow handler found for "${workflow.name}"`
          console.warn(reason)
          s.setAttribute('handler', false)
          s.setAttribute('workflow.status.final', 'failed')
          s.setStatus({
            code: SpanStatusCode.ERROR,
            message: reason,
          })

          await updateWorkflow({
            id: workflow.id,
            status: 'failed',
            failureReason: reason,
          })

          return
        }

        // Check if workflow is using default timeout and update if needed
        const DEFAULT_TIMEOUT_MS = ms('5m')
        const configuredTimeout = workflowDefinition.timeout

        if (workflow.timeoutAt && configuredTimeout !== DEFAULT_TIMEOUT_MS) {
          const workflowStartedAt = new Date(workflow.createdAt).getTime()
          const currentTimeoutAt = new Date(workflow.timeoutAt).getTime()
          const currentTimeoutDuration = currentTimeoutAt - workflowStartedAt

          // Check if the current timeout is approximately the default (within 10 seconds margin)
          const isDefaultTimeout = Math.abs(currentTimeoutDuration - DEFAULT_TIMEOUT_MS) < 10_000

          if (isDefaultTimeout) {
            // Update to use the configured timeout
            const newTimeoutAt = new Date(workflowStartedAt + configuredTimeout).toISOString()
            await updateWorkflow({
              id: workflow.id,
              timeoutAt: newTimeoutAt,
            })
            s.setAttribute('workflow.timeout.updated', true)
            s.setAttribute('workflow.timeout.from', currentTimeoutDuration)
            s.setAttribute('workflow.timeout.to', configuredTimeout)
          }
        }

        const runtime = context.get('runtime')
        console.debug(
          `[workflow:${workflow.name}] processing ${workflow.id} (status: ${workflow.status}, event: ${event.id}, remaining sandbox time: ${runtime.getRemainingExecutionTimeInMs()}ms)`
        )

        const [instance] = await Promise.all([
          BaseWorkflowInstance.load({
            id: workflow.id,
            workflow,
          }),
          TrackedState.loadAll(),
          TrackedTags.loadAll(),
          TrackedUserProfile.loadAll(),
        ])

        void workflow.acknowledgeStartOfProcessing()

        try {
          const interval = setInterval(async () => {
            await Promise.all([
              TrackedState.saveAllDirty(),
              TrackedTags.saveAllDirty(),
              TrackedUserProfile.saveAllDirty(),
            ])
          }, 20_000)

          void updateWorkflow({
            id: workflow.id,
            status: 'in_progress',
            eventId: event.id,
          }).catch(() => {
            // Ignore errors - setting in_progress on a workflow that's already
            // in progress (or finished) is a no-op, not a failure
          })

          type Result = Awaited<ReturnType<typeof instance.handle>>

          const result = await new Promise<Result>((resolve, reject) => {
            const remainingTime = runtime.getRemainingExecutionTimeInMs()
            const abortController = new AbortController()
            let timeout = setTimeout(
              () => {
                console.warn(
                  `[workflow:${workflow.name}] sandbox time exhausted, yielding ${workflow.id} to continue in a later execution (remaining sandbox time: ${runtime.getRemainingExecutionTimeInMs()}ms)`
                )
                abortController.abort()
                clearInterval(interval)
                resolve({ status: 'continue' })
              },
              Math.max(remainingTime - 15_000, 100)
            )

            instance
              .handle(abortController.signal, step)
              .then((res) => {
                clearInterval(interval)
                clearTimeout(timeout)
                resolve(res)
              })
              .catch((err) => {
                clearInterval(interval)
                clearTimeout(timeout)
                reject(err)
              })
          })

          if (result.status === 'continue') {
            s.setAttribute('workflow.status.final', 'continue')
            await Promise.all([
              TrackedState.saveAllDirty({ throwOnError: true }),
              TrackedTags.saveAllDirty(),
              TrackedUserProfile.saveAllDirty(),
            ])
          } else if (result.status === 'done') {
            s.setAttribute('workflow.status.final', 'completed')
            await updateWorkflow({
              id: workflow.id,
              status: 'completed',
              output: result.result,
            })

            /**
             * Only send callback event if this workflow is linked to a conversation
             * and is not a subworkflow (no parentWorkflowId)
             */
            if (workflow.conversationId && !workflow.parentWorkflowId) {
              await client.createEvent({
                type: WorkflowCallbackEvent.name,
                conversationId: workflow.conversationId,
                payload: {
                  status: 'completed',
                  target: { conversationId: workflow.conversationId },
                  workflow: workflow.name,
                  workflowId: workflow.id,
                  output: result.result,
                } satisfies z.infer<typeof WorkflowCallbackEvent.schema>,
              })
            }
          } else if (result.status === 'error') {
            const failureReason = result.error || `Workflow "${workflow.name}" failed with no error details`
            s.setAttribute('workflow.status.final', 'failed')
            s.setStatus({ code: SpanStatusCode.ERROR, message: failureReason })
            // Always surface WHY a workflow failed. Without this the row goes to
            // `failed` with the reason only on the workflow record — invisible in logs.
            console.error(`[workflow:${workflow.name}] failed (${workflow.id}): ${failureReason}`)
            await updateWorkflow({
              id: workflow.id,
              status: 'failed',
              failureReason,
            })

            /**
             * Only send callback event if this workflow is linked to a conversation
             * and is not a subworkflow (no parentWorkflowId)
             */
            if (workflow.conversationId && !workflow.parentWorkflowId) {
              await client.createEvent({
                type: WorkflowCallbackEvent.name,
                conversationId: workflow.conversationId,
                payload: {
                  status: 'failed',
                  target: { conversationId: workflow.conversationId },
                  workflow: workflow.name,
                  workflowId: workflow.id,
                  error: failureReason,
                } satisfies z.infer<typeof WorkflowCallbackEvent.schema>,
              })
            }
          }
        } catch (error) {
          const failureReason =
            Errors.toErrorString(error, true) || `Workflow "${workflow.name}" threw an unexpected error`
          s.setAttribute('workflow.status.final', 'failed')
          s.setStatus({ code: SpanStatusCode.ERROR, message: failureReason })
          // Always surface WHY a workflow failed. Without this the row goes to
          // `failed` with the reason only on the workflow record — invisible in logs.
          console.error(`[workflow:${workflow.name}] threw (${workflow.id}): ${failureReason}`, error)
          // Mark workflow as failed with error details in output
          // Don't re-throw - we've already marked it as failed
          await updateWorkflow({
            id: workflow.id,
            status: 'failed',
            failureReason,
          })

          if (workflow.conversationId) {
            await client.createEvent({
              type: WorkflowCallbackEvent.name,
              conversationId: workflow.conversationId,
              payload: {
                status: 'failed',
                target: { conversationId: workflow.conversationId },
                workflow: workflow.name,
                workflowId: workflow.id,
                error: failureReason,
              } satisfies z.infer<typeof WorkflowCallbackEvent.schema>,
            })
          }
        }
      }
    )
  }

  for (const wf of adk.project.workflows) {
    bot.on.workflowStart(wf.name, handler)
    bot.on.workflowContinue(wf.name, handler)
    bot.on.workflowTimeout(wf.name, handler)
  }

  //////////////////////////////////
  // BEGIN: Hack to support subworkflow_finished event
  //////////////////////////////////

  registerRequestHook(async (req, parsed) => {
    if (
      parsed.operation === 'event_received' &&
      parsed.type === 'workflow_update' &&
      parsed.body.event &&
      parsed.body.event?.type === 'workflow_update' &&
      parsed.body.event.payload &&
      parsed.body.event.payload?.type === 'child_workflow_finished'
    ) {
      const mutated = {
        ...parsed.body,
        event: {
          ...parsed.body.event,
          type: SubworkflowFinished.name,
        },
      }

      req.body = JSON.stringify(mutated)
      req.headers![OPERATION_SUBTYPE_HEADER] = SubworkflowFinished.name
    }
  })

  bot.on.event(SubworkflowFinished.name, async () => {
    // TODO: do something with this event, most likely resume the workflow waiting for this subworkflow
  })

  /////////////////////////////////////////////
  // END: Hack to support subworkflow_finished event
  /////////////////////////////////////////////

  bot.on.event(WorkflowContinueEvent.name, async () => {
    return // This will send a workflow_continue event to the bot
    // TODO: Handle this case instead of returning and creating a new event for no reason
    // if (!event.workflowId) {
    //   logger.warn(`Skipping ${WorkflowContinueEvent.name} event, workflowId not found in payload`);
    //   return;
    // }

    // const { workflow } = await client.getWorkflow({ id: event.workflowId })

    // await handler({
    //   client,
    //   ctx,
    //   logger,
    //   event,
    //   workflow,
    // })
  })
}
