import { ulid } from 'ulid'
import type { Client, Workflow } from '@holocronlab/botruntime-client'
import assert from 'assert'
import { AsyncLocalStorage } from 'async_hooks'
import { transforms, type ZodType } from '@holocronlab/botruntime-zui'
import { z } from '@holocronlab/botruntime-sdk'
import { context, WorkflowContinueEvent, WorkflowDataRequestEvent, WorkflowNotifyEvent } from '../runtime/index'
import { span, type TypedSpan } from '../telemetry/tracing'
import type { BaseWorkflow } from './workflow'
import { adk } from '../runtime/adk'
import type { ZuiType } from '../types'
import { getSingleton } from '../runtime/singletons'
import { updateWorkflow } from './workflow-utils'
import { serializeDates, deserializeDates } from './date-serialization'
import { Errors } from '../errors'
import {
  captureWorkflowStepErrorDiagnostics,
  createStepSignal,
  createWorkflowExecutionState,
  isStepSignal,
  restoreWorkflowStepError,
  type WorkflowStepContext,
} from './workflow-shared'

const DEFAULT_MAX_ATTEMPTS = 5

type WorkflowStepOptions = {
  maxAttempts?: number
}

type MapOptions = {
  maxAttempts?: number
  concurrency?: number
}

/**
 * Workflow step execution API. Steps are the building blocks of workflows with automatic retry logic and state persistence.
 */
export interface WorkflowStep {
  /**
   * Execute a workflow step with automatic retry logic and state persistence.
   * Steps are idempotent and resumable - if a step has already been executed, its cached result is returned immediately.
   * @param name - Unique identifier for this step within the workflow
   * @param run - Function to execute, receives the current attempt number
   * @param options - Configuration options
   * @param options.maxAttempts - Maximum number of retry attempts (default: 5)
   * @returns The result of the step execution
   * @example
   * const data = await step("fetch-user", async () => {
   *   return await fetchUser(userId);
   * });
   */
  <T>(
    name: string,
    run: ({ attempt }: { attempt: number }) => T | Promise<T>,
    options?: WorkflowStepOptions
  ): Promise<T>

  /**
   * Put the workflow into listening mode, waiting for external events to resume.
   * The workflow will pause at this step and can be resumed by triggering it with an event.
   * @param name - The name of the step
   * @example
   * await step.listen("wait-for-approval");
   * // Workflow pauses here until an event triggers it to continue
   */
  listen(name: string): Promise<void>

  /**
   * Mark the workflow as failed with a specific reason and stop execution.
   * This immediately terminates the workflow and sets its status to "failed".
   * @param reason - Description of why the workflow failed
   * @example
   * if (!user.isVerified) {
   *   await step.fail("User verification required");
   * }
   */
  fail(reason: string): Promise<void>

  /**
   * Record a progress checkpoint in the workflow without performing any action.
   * Useful for tracking workflow execution stages and creating audit trails.
   * @param name - The name of the progress checkpoint
   * @example
   * await step.progress("Started processing");
   * // ... do work ...
   * await step.progress("Finished processing");
   */
  progress(name: string): Promise<void>

  /**
   * Send a typed progress/notification event to the conversation without pausing the workflow.
   * The notification is idempotent per step name, so repeated executions reuse the saved step state.
   * @param notification - The notification name defined on the workflow
   * @param payload - The payload to send with the notification
   * @param stepName - Optional custom step name when emitting the same notification multiple times
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notify(notification: string, payload: any, stepName?: string): Promise<void>

  /**
   * Immediately abort the workflow execution without marking it as failed.
   * The workflow status remains unchanged and can potentially be resumed later.
   * This is different from step.fail() which marks the workflow as failed.
   * @example
   * if (shouldPause) {
   *   step.abort(); // Stop execution but keep workflow in current state
   * }
   */
  abort(): void

  /**
   * Pause workflow execution for the specified duration in milliseconds.
   * For delays >= 10 seconds, the workflow enters listening mode to save resources.
   * For shorter delays, uses an in-memory timeout.
   * @param name - The name of the step
   * @param ms - Duration to sleep in milliseconds
   * @example
   * await step.sleep("wait-5-min", 5 * 60 * 1000);
   * await step.sleep("short-delay", 1000);
   */
  sleep(name: string, ms: number): Promise<void>

  /**
   * Sleep until the specified date, minus a buffer to ensure the step can complete before the workflow times out.
   * If the date is in the past, the step will return immediately.
   * @param name - The name of the step
   * @param date - The date to sleep until
   * @example
   * await step.sleepUntil("wait-until-noon", new Date("2025-01-15T12:00:00Z"));
   */
  sleepUntil(name: string, date: Date | string): Promise<void>

  /**
   * Wait for another workflow to complete before continuing.
   * The current workflow will pause and poll until the target workflow finishes.
   * @param name - The name of the step
   * @param workflowId - ID of the workflow to wait for
   * @returns The completed workflow object
   * @throws Error if attempting to wait for the same workflow (would cause deadlock)
   * @example
   * const childWorkflow = await childWorkflowInstance.start({});
   * const result = await step.waitForWorkflow("wait-for-child", childWorkflow.id);
   */
  waitForWorkflow(name: string, workflowId: string): Promise<Workflow>

  /**
   * Start another workflow and wait for it to complete, returning its output.
   * This is a convenience method that combines workflow.start() and step.waitForWorkflow().
   * @param name - The name of the step
   * @param workflow - The workflow instance to execute
   * @returns The output of the completed workflow
   * @example
   * const processedData = await step.executeWorkflow(
   *   "process-data",
   *   dataProcessingWorkflow
   * );
   */
  executeWorkflow<TName extends string, TInput extends ZuiType, TOutput extends ZodType>(
    name: string,
    workflow: BaseWorkflow<TName, TInput, TOutput>,
    input?: z.infer<TInput>
  ): Promise<z.infer<TOutput>>

  /**
   * Process an array of items in parallel with controlled concurrency, collecting results.
   * Each item is processed in its own step with automatic retry logic.
   * @param name - The name of the map operation
   * @param items - Array of items to process
   * @param run - Function to process each item, receives the item and its index
   * @param opts - Configuration options
   * @param opts.maxAttempts - Maximum retry attempts per item (default: 5)
   * @param opts.concurrency - Maximum number of concurrent operations (default: 1)
   * @returns Array of results in the same order as input items
   * @example
   * const results = await step.map(
   *   "process-users",
   *   users,
   *   async (user, { i }) => processUser(user),
   *   { concurrency: 5 }
   * );
   */
  map<T, U>(
    name: string,
    items: T[],
    run: (input: T, opts: { i: number }) => Promise<U>,
    opts?: MapOptions
  ): Promise<U[]>

  /**
   * Process an array of items in parallel without collecting results.
   * Similar to step.map but doesn't return an array of results (for side effects only).
   * @param name - The name of the forEach operation
   * @param items - Array of items to process
   * @param run - Function to process each item, receives the item and its index
   * @param opts - Configuration options
   * @param opts.maxAttempts - Maximum retry attempts per item (default: 5)
   * @param opts.concurrency - Maximum number of concurrent operations (default: 1)
   * @example
   * await step.forEach(
   *   "notify-users",
   *   users,
   *   async (user) => sendNotification(user),
   *   { concurrency: 10 }
   * );
   */
  forEach<T>(
    name: string,
    items: T[],
    run: (input: T, opts: { i: number }) => Promise<void>,
    opts?: MapOptions
  ): Promise<void>

  /**
   * Process an array of items in sequential batches.
   * Items are grouped into batches and each batch is processed as a single step.
   * Useful for bulk operations with external APIs that accept multiple items.
   * @param name - The name of the batch operation
   * @param items - Array of items to process
   * @param run - Function to process each batch, receives the batch array and starting index
   * @param opts - Configuration options
   * @param opts.batchSize - Number of items per batch (default: 20)
   * @param opts.maxAttempts - Maximum retry attempts per batch (default: 5)
   * @example
   * await step.batch(
   *   "bulk-insert",
   *   records,
   *   async (batch) => database.bulkInsert(batch),
   *   { batchSize: 100 }
   * );
   */
  batch<T>(
    name: string,
    items: T[],
    run: (input: T[], opts: { i: number }) => Promise<void>,
    opts?: { batchSize?: number; maxAttempts?: number }
  ): Promise<void>

  /**
   * Request data from the conversation and wait for a response.
   * This method is typed based on the workflow's requests field when used in a handler.
   * @internal Use the typed version provided in the handler
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  request(request: string, message: string, stepName?: string): Promise<any>
}

const MIN_STEP_REMAINING_TIME_MS = 10_000

const storage = getSingleton('__ADK_GLOBAL_CTX_WORKFLOW_STEP', () => new AsyncLocalStorage<WorkflowStepContext>())

async function _step<T>(
  name: string,
  run: ({ attempt }: { attempt: number }) => T | Promise<T>,
  { maxAttempts = DEFAULT_MAX_ATTEMPTS }: WorkflowStepOptions = {},
  {
    spanFunc,
    stepType,
    stepMeta,
  }: {
    spanFunc?: (span: TypedSpan<'handler.workflow.step'>) => void
    stepType?: string
    stepMeta?: Record<string, unknown>
  } = {}
): Promise<T> {
  if (typeof name !== 'string') {
    throw new TypeError(
      `step() expects a string as the first argument (step name), got ${typeof name}. Usage: step("my-step", async () => { ... })`
    )
  }
  if (typeof run !== 'function') {
    console.error(`[_step] "${name}" called with run=${typeof run} (expected function). Args:`, { name, run, stepType })
    throw new TypeError(`step("${name}") expects a function as the second argument, got ${typeof run}`)
  }
  const workflowControlContext = context.get('workflowControlContext')

  workflowControlContext.signal.throwIfAborted()

  const state = createWorkflowExecutionState(
    context.get('client')._inner as unknown as Client,
    workflowControlContext.workflow.id
  )

  if (!state.value) {
    throw createStepSignal()
  }

  if (workflowControlContext.aborted) {
    throw createStepSignal()
  }

  const remainingTime = context.get('runtime').getRemainingExecutionTimeInMs()
  if (remainingTime <= MIN_STEP_REMAINING_TIME_MS) {
    // Not enough time to complete the step, go to sleep so that we don't get another invocation
    // This is not ideal, but it prevents multiple invocations from happening in a row
    await new Promise((resolve) => setTimeout(resolve, MIN_STEP_REMAINING_TIME_MS))
    workflowControlContext.signal.throwIfAborted()
    throw createStepSignal()
  }

  const stepContext = storage.getStore()

  const steps = stepContext?.steps ?? state.value.steps

  steps[name] ??= {
    attempts: 0,
    maxAttempts,
    steps: {},
    startedAt: new Date().toISOString(),
  }

  // Merge step metadata on every invocation (not just first creation)
  if (stepMeta) {
    Object.assign(steps[name], stepMeta)
  }

  if (steps[name].finishedAt) {
    // Capture once so the async callback below keeps the narrowed type — the
    // surrounding `if` doesn't propagate through the async closure.
    const cachedStep = steps[name]!
    // Emit a span for the cache-hit short-circuit so trace consumers
    // (Dev Console, OTEL collectors) can distinguish "step served from cache"
    // from "step ran fresh." See ADK-626 for the originating debugging scenario.
    return await span(
      'handler.workflow.step',
      {
        workflowId: workflowControlContext.workflow.id,
        'workflow.step': name,
        'workflow.step.type': stepType ?? 'default',
        'workflow.step.attempt': cachedStep.attempts,
        'workflow.step.cached': true,
      },
      async (stepSpan) => {
        spanFunc?.(stepSpan)

        // If step finished with an error, re-throw it with as much context as possible
        if (cachedStep.error) {
          const stepError = cachedStep.error

          // Defensively extract message — persisted state could be malformed
          let message: string
          if (typeof stepError?.message === 'string' && stepError.message.length > 0) {
            message = stepError.message
          } else if (typeof stepError === 'string') {
            // Shouldn't happen per schema, but handle gracefully
            message = stepError
          } else {
            message = '(error details could not be recovered from persisted state)'
          }

          // Include step context: which step, when it failed, how many attempts
          const errContext = [
            `step="${name}"`,
            stepError?.maxAttemptsReached ? `maxAttemptsReached=true` : null,
            typeof stepError?.failedAt === 'string' ? `failedAt=${stepError.failedAt}` : null,
          ]
            .filter(Boolean)
            .join(', ')

          const err = restoreWorkflowStepError(`${message} [${errContext}]`, stepError)

          // Restore original stack trace if it's a valid, non-empty string
          const stack = stepError?.stack
          if (typeof stack === 'string' && stack.length > 0) {
            err.stack = stack
          }

          stepSpan.setAttribute('workflow.step.error', message)
          stepSpan.setStatus({ code: 2, message })
          throw err
        }
        // Deserialize dates when retrieving cached step output
        return deserializeDates(cachedStep.output) as T
      }
    )
  }

  while (true) {
    let shouldRetry = false

    let errSignal = undefined

    const result = await span(
      'handler.workflow.step',
      {
        workflowId: workflowControlContext.workflow.id,
        'workflow.step': name,
        'workflow.step.type': stepType ?? 'default',
        'workflow.step.attempt': steps[name].attempts,
      },
      async (stepSpan) => {
        spanFunc?.(stepSpan)

        try {
          let output

          await storage.run(steps[name]!, async function () {
            output = await run({ attempt: steps[name]!.attempts })
            workflowControlContext.signal.throwIfAborted()
          })

          stepSpan.setAttribute('workflow.step.output', output)
          return output
        } catch (e) {
          if (isStepSignal(e)) {
            errSignal = e
            return
          }

          if (workflowControlContext.signal.aborted) {
            errSignal = createStepSignal()
            return
          }

          if (steps[name]!.attempts >= maxAttempts - 1) {
            // Store the safe message/stack plus allowlisted structured
            // diagnostics so a fresh generation can classify the same failure.
            // Use Errors.toErrorString for the message (handles Axios, AggregateError, non-Error throwables, etc.)
            // Extract stack from any object that has one, not just Error instances
            const errorMessage = Errors.toErrorString(e)
            const rawStack =
              typeof (e as Record<string, unknown>)?.stack === 'string'
                ? ((e as Record<string, unknown>).stack as string)
                : undefined
            steps[name]!.error = {
              ...captureWorkflowStepErrorDiagnostics(e),
              message: errorMessage,
              ...(rawStack !== undefined && { stack: rawStack }),
              failedAt: new Date().toISOString(),
              maxAttemptsReached: true,
            }
            steps[name]!.finishedAt = new Date().toISOString()

            stepSpan.setAttributes({
              'workflow.step.error': errorMessage,
              'workflow.step.max_attempts': maxAttempts,
            })
            stepSpan.setStatus({
              code: 2,
              message: `Step "${name}" failed after max attempts (${maxAttempts}): ${errorMessage}`,
            })

            // Mark step as finished with error and persist state
            state.value!.revision++
            await workflowControlContext.ack()

            // Throw the error so it can be caught by user's try/catch
            // If uncaught, it will fail the parent step or workflow
            throw e
          } else {
            steps[name]!.attempts++
            stepSpan.setAttributes({
              'workflow.step.error': e instanceof Error ? e.message : String(e),
            })
            stepSpan.setStatus({
              code: 2,
              message: e instanceof Error ? e.message : String(e),
            })
            shouldRetry = true
            return
          }
        }
      }
    )

    if (errSignal) {
      throw errSignal
    }

    if (shouldRetry) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(100 * Math.exp(state.value?.steps?.[name]?.attempts ?? 1), 5000))
      )

      continue
    }

    if (workflowControlContext.failed) {
      throw createStepSignal()
    }

    if (workflowControlContext.restarted) {
      throw createStepSignal()
    }

    steps[name].finishedAt = new Date().toISOString()
    // Serialize dates when storing step output for persistence
    steps[name].output = serializeDates(result)
    steps[name].steps = {}
    state.value!.revision++

    await workflowControlContext.ack()

    if (workflowControlContext.aborted) {
      throw createStepSignal()
    }

    return result!
  }
}

export const step = (async <T>(
  name: string,
  run: ({ attempt }: { attempt: number }) => T | Promise<T>,
  options: WorkflowStepOptions = {}
): Promise<T> => {
  return _step(name, run, options)
}) as WorkflowStep

step.listen = async (name: string) => {
  await _step(
    name,
    async () => {
      const workflowControlContext = context.get('workflowControlContext')
      await updateWorkflow({
        id: workflowControlContext.workflow.id,
        status: 'listening',
      })
      workflowControlContext.abort()
    },
    {},
    {
      stepType: 'listen',
    }
  )
}

step.fail = async (reason: string) => {
  const workflowControlContext = context.get('workflowControlContext')
  workflowControlContext.fail(reason)

  await _step(
    reason,
    async () => {},
    { maxAttempts: 1 },
    {
      stepType: 'fail',
      spanFunc: (span) => {
        span.setStatus({ code: 2, message: reason })
      },
    }
  )
}

step.progress = async (name: string) => {
  await _step(
    name,
    async () => {},
    { maxAttempts: 1 },
    {
      stepType: 'progress',
    }
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
step.notify = async (notification: string, payload: any, stepName?: string): Promise<void> => {
  const actualStepName = stepName || notification

  await _step(
    actualStepName,
    async () => {
      const workflowControlContext = context.get('workflowControlContext')
      const client = context.get('client')

      const workflowDef = adk.project.workflows.find((w) => w.name === workflowControlContext.workflow.name)

      if (!workflowDef) {
        throw new Error(`Workflow definition not found for "${workflowControlContext.workflow.name}"`)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const notificationSchema = (workflowDef as any)._notificationsSchemas?.[notification]

      if (!notificationSchema) {
        throw new Error(
          `Notification "${notification}" not found in workflow "${workflowDef.name}". ` +
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `Available notifications: ${Object.keys((workflowDef as any)._notificationsSchemas || {}).join(', ') || 'none'}`
        )
      }

      const validatedPayload = notificationSchema.parse(payload)

      if (!workflowControlContext.workflow.conversationId) {
        console.warn(
          `[step.notify] Skipping "${notification}" notification for workflow "${workflowControlContext.workflow.id}" because it has no conversationId (non-fatal).`
        )
        return
      }

      try {
        await client.createEvent({
          type: WorkflowNotifyEvent.name,
          conversationId: workflowControlContext.workflow.conversationId,
          payload: {
            workflowId: workflowControlContext.workflow.id,
            workflowName: workflowControlContext.workflow.name,
            stepName: actualStepName,
            notification,
            payload: validatedPayload,
          },
        })
      } catch (error) {
        console.warn(
          `[step.notify] Failed to deliver "${notification}" notification for workflow "${workflowControlContext.workflow.id}" (non-fatal):`,
          error
        )
      }
    },
    { maxAttempts: 1 },
    {
      stepType: 'notify',
      stepMeta: {
        notificationName: notification,
      },
    }
  )
}

step.abort = () => {
  const workflowControlContext = context.get('workflowControlContext')
  workflowControlContext.abort()
  throw createStepSignal()
}

step.sleep = async (name: string, ms: number) => {
  await _step(
    name,
    async () => {
      const remainingTime = context.get('runtime').getRemainingExecutionTimeInMs()

      if (remainingTime - MIN_STEP_REMAINING_TIME_MS <= ms || ms >= 10_000) {
        const client = context.get('client')
        const workflowControlContext = context.get('workflowControlContext')
        await client.createEvent({
          type: WorkflowContinueEvent.name,
          payload: {},
          workflowId: workflowControlContext.workflow.id,
          schedule: {
            delay: ms,
          },
        })
        await updateWorkflow({
          id: workflowControlContext.workflow.id,
          status: 'listening',
        })
        workflowControlContext.abort()
      } else {
        await new Promise((resolve) => void setTimeout(resolve, ms))
        context.get('workflowControlContext').signal.throwIfAborted()
      }
    },
    {},
    {
      stepType: 'sleep',
    }
  )
}

step.sleepUntil = async (name: string, date: Date | string) => {
  const ms = Math.max(0, new Date(date).getTime() - Date.now() - MIN_STEP_REMAINING_TIME_MS)
  await step.sleep(name, ms)
}

step.waitForWorkflow = async (name: string, workflowId: string) => {
  const workflowControlContext = context.get('workflowControlContext')

  if (workflowControlContext.workflow.id === workflowId) {
    throw new Error('Cannot wait for the same workflow')
  }

  return await _step(
    name,
    async () => {
      const client = context.get('client')

      const state = createWorkflowExecutionState(
        context.get('client')._inner as unknown as Client,
        workflowControlContext.workflow.id
      )
      assert(state.value, 'State is not loaded')

      const { workflow } = await client.getWorkflow({ id: workflowId })

      if (isWorkflowFinished(workflow.status)) {
        return workflow
      }

      workflowControlContext.restart() // Restart will restart the step
      await updateWorkflow({
        id: workflowControlContext.workflow.id,
        status: 'listening',
      })
      return workflow
    },
    {},
    {
      stepType: 'sleep',
    }
  )
}

step.executeWorkflow = async <TName extends string, TInput extends ZuiType, TOutput extends ZodType>(
  name: string,
  workflow: BaseWorkflow<TName, TInput, TOutput>,
  input?: z.infer<TInput>
): Promise<z.infer<TOutput>> =>
  _step(
    name,
    async () => {
      // Create a unique key for the workflow to ensure idempotency
      // This allows the workflow to be restarted without creating duplicates
      const key = await _step(`${name}-key`, () => ulid())

      const wfId = await _step(
        `${name}-start`,
        async () =>
          (
            await workflow.getOrCreate({
              input: input ?? ({} as z.infer<TInput>),
              key, // Ensures idempotency
            })
          ).id
      )
      return _step(`${name}-wait`, async () => step.waitForWorkflow(`${name}-wait`, wfId)).then((finishedWorkflow) => {
        if (finishedWorkflow.status !== 'completed') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- SDK type missing failureReason field
          const reason = (finishedWorkflow as any).failureReason ?? finishedWorkflow.output?.error
          throw new ChildWorkflowFailedError({
            parentStepName: name,
            childWorkflowName: workflow.name,
            childWorkflowId: finishedWorkflow.id,
            childStatus: finishedWorkflow.status,
            reason,
          })
        }
        return finishedWorkflow.output as z.infer<TOutput>
      })
    },
    {}
  )

function isWorkflowFinished(status: Workflow['status']) {
  return status === 'completed' || status === 'failed' || status === 'cancelled' || status === 'timedout'
}

async function processWithConcurrency<T, R>(
  items: T[],
  processor: (item: T, index: number) => Promise<R>,
  maxConcurrency: number = 5
): Promise<R[]> {
  if (items.length === 0) return []

  const results: R[] = Array.from({ length: items.length })
  const executing: Set<Promise<void>> = new Set()

  for (let i = 0; i < items.length; i++) {
    // Wait for a slot to open up BEFORE starting the promise
    while (executing.size >= maxConcurrency) {
      await Promise.race(executing)
    }

    const remainingTime = context.get('runtime').getRemainingExecutionTimeInMs()
    if (remainingTime <= MIN_STEP_REMAINING_TIME_MS) {
      // Not enough time to complete the step, go to sleep so that we don't get another invocation
      // This is not ideal, but it prevents multiple invocations from happening in a row
      await new Promise((resolve) => setTimeout(resolve, MIN_STEP_REMAINING_TIME_MS))
      throw createStepSignal()
    }

    // Now start the promise and track it
    const promise = processor(items[i]!, i)
      .then((result) => {
        results[i] = result
      })
      .finally(() => {
        executing.delete(promise)
      })

    executing.add(promise)
  }

  // Wait for all remaining promises to complete
  await Promise.all(executing)

  return results
}

step.map = async <T, U>(
  name: string,
  items: T[],
  run: (input: T, opts: { i: number }) => Promise<U>,
  opts: MapOptions = {}
) => {
  const concurrency = opts.concurrency ?? 1
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS

  return _step(
    name,
    async () => {
      return processWithConcurrency(
        items,
        async (item, i) => {
          return await _step(
            `${name}-i${i}`,
            async () => {
              return await run(item, { i })
            },
            opts,
            {
              stepType: 'map-item',
              spanFunc: (span) => {
                span.setAttribute('workflow.map.item_index', i)
                span.setAttribute('workflow.map.total', items.length)
              },
            }
          )
        },
        concurrency
      )
    },
    opts,
    {
      stepType: 'map',
      stepMeta: { mapTotal: items.length, mapConcurrency: concurrency },
      spanFunc: (span) => {
        span.setAttribute('workflow.map.total', items.length)
        span.setAttribute('workflow.map.concurrency', concurrency)
        span.setAttribute('workflow.step.max_attempts', maxAttempts)
      },
    }
  )
}

step.forEach = async <T>(
  name: string,
  items: T[],
  run: (input: T, opts: { i: number }) => Promise<void>,
  opts: MapOptions = {}
) => {
  await step.map(name, items, run, opts)
}

step.batch = async <T>(
  name: string,
  items: T[],
  run: (input: T[], opts: { i: number }) => Promise<void>,
  opts: { batchSize?: number; maxAttempts?: number } = {}
) => {
  const batchSize = opts.batchSize ?? 20

  await _step(
    name,
    async () => {
      for (let i = 0; i < items.length; i += batchSize) {
        const batchId = i / batchSize + 1

        await _step(
          `${name}-b${batchId}`,
          async () => {
            const batch = items.slice(i, i + batchSize)
            await run(batch, { i })
          },
          opts
        )
      }
    },
    opts
  )
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
step.request = async (request: string, message: string, stepName?: string): Promise<any> => {
  const actualStepName = stepName || request

  return await _step(
    actualStepName,
    async () => {
      const workflowControlContext = context.get('workflowControlContext')
      const client = context.get('client')

      // Check if workflow has conversationId
      if (!workflowControlContext.workflow.conversationId) {
        throw new Error(`Cannot request data: workflow ${workflowControlContext.workflow.id} has no conversationId`)
      }

      // Get workflow definition to look up request schema
      const workflowDef = adk.project.workflows.find((w) => w.name === workflowControlContext.workflow.name)

      if (!workflowDef) {
        throw new Error(`Workflow definition not found for "${workflowControlContext.workflow.name}"`)
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const requestSchema = (workflowDef as any)._requestsSchemas?.[request]

      if (!requestSchema) {
        throw new Error(
          `Request "${request}" not found in workflow "${workflowDef.name}". ` +
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            `Available requests: ${Object.keys((workflowDef as any)._requestsSchemas || {}).join(', ') || 'none'}`
        )
      }

      // Check if data has been provided
      const state = createWorkflowExecutionState(client._inner as unknown as Client, workflowControlContext.workflow.id)

      if (!state.value) {
        throw new Error('Workflow execution state not loaded')
      }

      // If step already has output (data was provided), return it
      if (state.value.steps?.[actualStepName]?.output !== undefined) {
        return requestSchema.parse(state.value.steps[actualStepName].output)
      }

      // Create event to request data from conversation
      await client.createEvent({
        type: WorkflowDataRequestEvent.name,
        conversationId: workflowControlContext.workflow.conversationId,
        payload: {
          workflowId: workflowControlContext.workflow.id,
          workflowName: workflowControlContext.workflow.name,
          stepName: actualStepName,
          request,
          message,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          schema: transforms.toJSONSchema(requestSchema as any),
        },
      })

      // Put workflow in listening mode and wait for data
      await updateWorkflow({
        id: workflowControlContext.workflow.id,
        status: 'listening',
      })

      workflowControlContext.abort()
      throw createStepSignal()
    },
    {},
    {
      stepType: 'request',
      stepMeta: {
        requestName: request,
      },
    }
  )
}

export class ChildWorkflowFailedError extends Error {
  public readonly parentStepName: string
  public readonly childWorkflowName: string
  public readonly childWorkflowId: string
  public readonly childStatus: Workflow['status']
  public readonly reason: string | undefined

  constructor(props: {
    parentStepName: string
    childWorkflowName: string
    childWorkflowId: string
    childStatus: Workflow['status']
    reason?: string
  }) {
    const reasonSuffix = props.reason ? `: ${props.reason}` : ''
    super(
      `Child workflow "${props.childWorkflowName}" (id ${props.childWorkflowId}) ended with status "${props.childStatus}"${reasonSuffix}`
    )
    this.name = 'ChildWorkflowFailedError'
    this.parentStepName = props.parentStepName
    this.childWorkflowName = props.childWorkflowName
    this.childWorkflowId = props.childWorkflowId
    this.childStatus = props.childStatus
    this.reason = props.reason
  }
}
