import { Workflow, type Client } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import { BotClient } from '@holocronlab/botruntime-sdk/dist/bot'
import assert from 'assert'
import ms from 'ms'
import { WorkflowDefinitions, WorkflowOutputs } from '../_types/workflows'
import { Errors } from '../errors'
import { adk } from '../library'
import { Autonomous } from '../runtime/autonomous'
import {
  context,
  TrackedState,
  TrackedTags,
  WorkflowContinueEvent,
  BUILT_IN_STATES,
  type WorkflowControlContext,
} from '../runtime/index'
import { StateReference } from '../runtime/state-reference-symbol'
import { ZuiType } from '../types'
import { updateWorkflow } from './workflow-utils'
import { startWorkflowCancellationMonitor } from './workflow-cancellation-monitor'
import {
  createStepSignal,
  createWorkflowExecutionState,
  isStepSignal,
  type WorkflowExecutionContext,
  type WorkflowStepContext,
} from './workflow-shared'
import type { WorkflowStep } from './workflow-step'
export type { WorkflowStepContext }
export { isStepSignal, createStepSignal, createWorkflowExecutionState }

function isPendingWorkflowStep(step: WorkflowStepContext | undefined): step is WorkflowStepContext {
  return Boolean(step && !step.finishedAt)
}

export function resolveWorkflowProvideStepName(
  steps: Record<string, WorkflowStepContext>,
  request: string,
  explicitStepName?: string
): string {
  if (explicitStepName) {
    const explicitStep = steps[explicitStepName]

    if (!explicitStep) {
      throw new Error(`Cannot provide request "${request}" to step "${explicitStepName}": step was not found.`)
    }

    if (!isPendingWorkflowStep(explicitStep)) {
      throw new Error(`Cannot provide request "${request}" to step "${explicitStepName}": step is already finished.`)
    }

    if (explicitStep.requestName && explicitStep.requestName !== request) {
      throw new Error(
        `Cannot provide request "${request}" to step "${explicitStepName}": it is waiting for request "${explicitStep.requestName}".`
      )
    }

    return explicitStepName
  }

  const matchingPendingSteps = Object.entries(steps).filter(
    ([, step]) => isPendingWorkflowStep(step) && step.requestName === request
  )

  if (matchingPendingSteps.length === 1) {
    return matchingPendingSteps[0]![0]
  }

  if (matchingPendingSteps.length > 1) {
    const stepNames = matchingPendingSteps.map(([stepName]) => `"${stepName}"`).join(', ')
    throw new Error(
      `Cannot provide request "${request}": multiple pending steps match (${stepNames}). Pass the step name explicitly, for example workflow.provide("${request}", data, request.step).`
    )
  }

  if (isPendingWorkflowStep(steps[request])) {
    return request
  }

  throw new Error(
    `Cannot provide request "${request}": no pending step matches it. Pass the exact step name as the third argument, for example workflow.provide("${request}", data, request.step).`
  )
}

export function writeWorkflowProvideState(
  state: WorkflowExecutionContext,
  stepName: string,
  data: unknown,
  { allowCreate = false }: { allowCreate?: boolean } = {}
) {
  const now = new Date().toISOString()
  const existingStep = state.steps[stepName]

  if (!existingStep) {
    if (!allowCreate) {
      throw new Error(`Cannot provide data to workflow step "${stepName}": step was not found.`)
    }

    state.steps[stepName] = {
      output: data,
      attempts: 0,
      startedAt: now,
      finishedAt: now,
    }
  } else {
    existingStep.output = data
    existingStep.finishedAt = now
  }

  state.revision++
}

export async function provideWorkflowRequestData(props: {
  client: BotClient<any>
  workflowId: string
  request: string
  data: unknown
  stepName?: string
}): Promise<void> {
  const state = createWorkflowExecutionState(props.client._inner as unknown as Client, props.workflowId)
  await state.load()

  if (!state.value) {
    throw new Error(`Workflow execution state not found for workflow ${props.workflowId}`)
  }

  const resolvedStepName = resolveWorkflowProvideStepName(state.value.steps, props.request, props.stepName)

  writeWorkflowProvideState(state.value, resolvedStepName, props.data)

  await state.save()

  await props.client.createEvent({
    type: WorkflowContinueEvent.name,
    workflowId: props.workflowId,
    payload: {},
  })
}

/**
 * Base class for all workflow instances
 */
export class BaseWorkflowInstance<TName extends keyof WorkflowDefinitions> {
  public readonly id: string
  public readonly name: TName
  public readonly key?: string | undefined
  public readonly input: WorkflowDefinitions[TName]['input']
  public readonly createdAt: Date
  public readonly updatedAt: Date
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public readonly client: BotClient<any> // Can be Client or BotClient
  public readonly workflow: Workflow

  // @internal
  public readonly TrackedState: TrackedState

  // @internal
  private readonly TrackedTags: TrackedTags

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(workflow: Workflow, client: BotClient<any>) {
    const definition = adk.project.workflows.find((w) => w.name === workflow.name)

    this.TrackedState = TrackedState.create({
      type: 'workflow',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client._inner as any,
      id: workflow.id,
      schema: definition?.stateSchema as ZuiType,
      name: BUILT_IN_STATES.workflowState,
    })

    this.TrackedTags = TrackedTags.create({
      type: 'workflow',
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client: client._inner as any,
      id: workflow.id,
      initialTags: workflow.tags as Record<string, string | undefined>,
    })

    this.id = workflow.id
    this.name = workflow.name as TName
    this.key = workflow.tags.key
    this.input = workflow.input
    this.createdAt = new Date(workflow.createdAt)
    this.updatedAt = new Date(workflow.updatedAt)
    this.client = client
    this.workflow = workflow
  }

  public get tags(): Record<string, string | undefined> {
    return this.TrackedTags.tags
  }

  public set tags(value: Record<string, string | undefined>) {
    this.TrackedTags.tags = value
  }

  /**
   * Symbol method for automatic serialization to reference in state
   * @internal
   */
  [StateReference]() {
    return {
      __ref__: 'workflow' as const,
      id: this.id,
    }
  }

  static readonly Primitive = 'workflow_instance' as const

  /**
   * Load a workflow by explicit ID.
   * Cleaner alternative to `load()` — the constructor handles TrackedState and TrackedTags creation,
   * we just need to load the state value after.
   *
   * @param id - The workflow ID to load
   * @returns A BaseWorkflowInstance
   * @throws If no agent workflow definition is found for the workflow name
   * @throws If called outside an execution context
   */
  static async get<TName extends keyof WorkflowDefinitions>(id: string): Promise<BaseWorkflowInstance<TName>> {
    const client = context.get('client')

    const { workflow } = await client.getWorkflow({ id })

    if (!adk.project.workflows.find((w) => w.name === workflow.name)) {
      throw new Error(`No agent workflow definition found for "${workflow.name}"`)
    }

    const instance = new BaseWorkflowInstance<TName>(workflow, client)
    await instance.TrackedState.load()
    return instance
  }

  static async load<TName extends keyof WorkflowDefinitions>(props: {
    id: string
    workflow?: Workflow
  }): Promise<BaseWorkflowInstance<TName>> {
    const client = context.get('client')

    const workflow = props.workflow
      ? props.workflow
      : await client.getWorkflow({ id: props.id }).then((x) => x.workflow)

    if (!adk.project.workflows.find((w) => w.name === workflow.name)) {
      throw new Error(`No agent workflow definition found for "${workflow.name}"`)
    }

    TrackedTags.create({
      type: 'workflow',
      client: client._inner as unknown as Client,
      id: workflow.id,
      initialTags: workflow.tags as Record<string, string | undefined>,
    })

    await TrackedTags.loadAll()

    return new BaseWorkflowInstance(workflow, client)
  }

  /**
   * Executes the workflow with the provided autonomous engine configuration.
   * Workflows always run in "worker" mode (no chat capabilities).
   */
  async execute(props: Autonomous.Props) {
    const executeFunc = Autonomous.createExecute({
      mode: 'worker',
      defaultModel: adk.project.config.defaultModels.autonomous,
    })
    return executeFunc(props)
  }

  /**
   * Cancel the workflow execution.
   * Note: This should be called from within a proper bot handler context.
   * If calling from a conversation handler, ensure TrackedTags.loadAll() has been called.
   */
  async cancel(): Promise<void> {
    await TrackedTags.loadAll()

    const { workflow } = await updateWorkflow({
      id: this.id,
      status: 'cancelled',
    })
    Object.assign(this.workflow, workflow)
  }

  /**
   * Extend the workflow timeout by setting a new timeout.
   * This is useful for long-running workflows that need more time to complete.
   *
   * @param options - Either `{ in: string }` for relative duration or `{ at: string }` for absolute ISO timestamp
   * @returns A promise that resolves when the timeout is updated (can be awaited or not)
   * @example
   * // Relative timeout (duration from now):
   * workflow.setTimeout({ in: '30m' })  // Timeout in 30 minutes
   * workflow.setTimeout({ in: '6 hours' })  // Timeout in 6 hours
   *
   * // Absolute timeout (ISO timestamp):
   * workflow.setTimeout({ at: '2024-12-25T00:00:00Z' })
   *
   * // Optionally await if you need to ensure the update completes:
   * await workflow.setTimeout({ in: '1h' })
   */
  setTimeout(options: { in: string } | { at: string }): Promise<void> {
    let newTimeoutAt: string

    if ('in' in options) {
      const durationMs = ms(options.in as ms.StringValue)
      if (!durationMs) {
        throw new Error(`Invalid duration format: "${options.in}". Use formats like "30m", "1h", "6 hours".`)
      }
      newTimeoutAt = new Date(Date.now() + durationMs).toISOString()
    } else {
      // Validate it's a valid date
      const date = new Date(options.at)
      if (isNaN(date.getTime())) {
        throw new Error(`Invalid ISO date format: "${options.at}".`)
      }
      newTimeoutAt = date.toISOString()
    }

    return updateWorkflow({
      id: this.id,
      timeoutAt: newTimeoutAt,
    }).then(({ workflow }) => {
      Object.assign(this.workflow, workflow)
    })
  }

  /**
   * Fail the workflow with an error reason.
   * This immediately interrupts the workflow handler and marks the workflow as failed.
   * Can only be called from within a workflow handler.
   *
   * @param reason - The error reason for the failure
   * @throws Never returns - always throws to interrupt the handler
   * @example
   * workflow.fail('Invalid input data')
   */
  fail(reason: string): never {
    const controlContext = context.get('workflowControlContext', { optional: true })
    if (!controlContext || controlContext.workflow.id !== this.id) {
      throw new Error('workflow.fail() can only be called from within the workflow handler')
    }

    controlContext.fail(reason)
    throw createStepSignal()
  }

  /**
   * Complete the workflow early with the given output.
   * This immediately interrupts the workflow handler and marks the workflow as completed.
   * Can only be called from within a workflow handler.
   *
   * @param output - The workflow output (typed according to workflow definition)
   * @throws Never returns - always throws to interrupt the handler
   * @example
   * workflow.complete({ result: 'success', data: processedData })
   */
  complete(output: WorkflowOutputs[TName]): never {
    const controlContext = context.get('workflowControlContext', { optional: true })
    if (!controlContext || controlContext.workflow.id !== this.id) {
      throw new Error('workflow.complete() can only be called from within the workflow handler')
    }

    controlContext.complete(output)
    throw createStepSignal()
  }

  /**
   * Provide data in response to a workflow data request (instance method).
   * Call this method from a conversation handler when you receive a WorkflowDataRequestEvent.
   * @param request - The name of the request being responded to
   * @param data - The data to provide to the workflow
   * @param stepName - Optional explicit step name when multiple pending steps use the same request type
   * @example
   * if (type === 'workflow_request') {
   *   await request.workflow.provide('topic', { topic: "Hello" }, request.step)
   * }
   */
  async provide<TRequest extends keyof WorkflowDefinitions[TName]['requests'] & string>(
    request: TRequest,
    data: WorkflowDefinitions[TName]['requests'][TRequest],
    stepName?: string
  ): Promise<void> {
    const client = context.get('client')

    await provideWorkflowRequestData({
      client,
      workflowId: this.id,
      request,
      data,
      ...(stepName ? { stepName } : {}),
    })
  }

  // @internal
  async handle(
    abortSignal: AbortSignal,
    step: WorkflowStep
  ): Promise<
    | {
        status: 'done'
        result: WorkflowOutputs[TName]
      }
    | {
        status: 'continue'
      }
    | {
        status: 'error'
        error: string
      }
  > {
    abortSignal.throwIfAborted()
    const handler = adk.project.workflows.find((w) => w.name === this.name)!._handler

    if (!handler) {
      throw new Error(`No agent workflow handler found for "${this.name as string}"`)
    }

    await TrackedState.loadAll()
    abortSignal.throwIfAborted()

    const workflowControlContext: WorkflowControlContext = {
      workflow: this.workflow,
      aborted: false,
      failed: false,
      completed: false,
      acked: false,
      restarted: false,
      signal: abortSignal,
      restart: () => {
        workflowControlContext.restarted = true
      },
      abort: () => {
        workflowControlContext.aborted = true
        workflowControlContext.acked = true // Prevent ack on abort
      },
      fail: (reason: string) => {
        workflowControlContext.failed = true
        workflowControlContext.failedReason = reason
      },
      complete: (result: unknown) => {
        workflowControlContext.completed = true
        workflowControlContext.completedResult = result
      },
      ack: async () => {
        if (workflowControlContext.acked) {
          return
        }

        const eventId = context.get('event')?.id

        if (!eventId) {
          throw new Error(`Event ID not found in context. Cannot ack workflow ${this.id}`)
        }

        workflowControlContext.acked = true

        await updateWorkflow({
          id: this.id,
          status: 'in_progress',
          eventId,
        })

        this.workflow.status = 'in_progress'
      },
    }

    try {
      const client = context.get('client')
      const workflowExecutionState = createWorkflowExecutionState(client._inner as unknown as Client, this.id)
      await workflowExecutionState.load()
      await this.TrackedState.load()
      abortSignal.throwIfAborted()

      assert(workflowExecutionState.value, 'Workflow execution state is not loaded')
      workflowExecutionState.value.executionCount++

      // Ensure state is always defined (default to empty object)
      if (!this.TrackedState.value) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.TrackedState.value = {} as any
      }

      // Create a proxy that marks state as dirty when mutated
      const trackedState = this.TrackedState
      const stateProxy = new Proxy(this.TrackedState.value, {
        set(target, prop, value) {
          // Only mark dirty if the value actually changed
          const oldValue = target[prop as keyof typeof target]
          if (oldValue !== value) {
            const result = Reflect.set(target, prop, value)
            trackedState.markDirty()
            return result
          }
          return true
        },
      })

      if (this.workflow.status === 'pending') {
        await workflowControlContext.ack()
      }

      context.set('workflowControlContext', workflowControlContext)

      // Start monitoring for external workflow cancellation/failure/timeout
      // This polls the API every 1s and updates workflowControlContext when detected
      const stopCancellationMonitor = startWorkflowCancellationMonitor({
        client: client._inner as unknown as Client,
        workflowId: this.id,
        workflowControlContext,
        abortSignal,
      })

      try {
        const result = await handler({
          input: this.input,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: stateProxy as any,
          step,
          client: this.client,
          execute: this.execute.bind(this),
          signal: abortSignal,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          workflow: this as BaseWorkflowInstance<any>,
        })

        return {
          status: 'done',
          result,
        }
      } finally {
        stopCancellationMonitor()
      }
    } catch (err) {
      if (isStepSignal(err)) {
        if (workflowControlContext.completed) {
          return {
            status: 'done',
            result: workflowControlContext.completedResult as WorkflowOutputs[TName],
          }
        }

        if (workflowControlContext.failed) {
          return {
            status: 'error',
            error: workflowControlContext.failedReason || 'Workflow failed (no reason provided)',
          }
        }

        return {
          status: 'continue',
        }
      } else {
        const str = Errors.toErrorString(err, true)

        return {
          status: 'error',
          error: str || 'Workflow failed with an unknown error',
        }
      }
    } finally {
      await TrackedState.saveAllDirty({ throwOnError: true })
      context.set('workflowControlContext', undefined)
    }
  }

  /**
   * Returns a string representation for console.log
   */
  toString(): string {
    const keyPart = this.key ? ` [${this.key}]` : ''
    return `WorkflowInstance<${String(this.name)}>${keyPart} { id: "${this.id}", status: "${this.workflow.status}" }`
  }

  /**
   * Returns a JSON representation for serialization
   */
  toJSON(): Record<string, unknown> {
    return {
      id: this.id,
      name: this.name,
      key: this.key,
      status: this.workflow.status,
      input: this.input,
      createdAt: this.createdAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
    }
  }

  /**
   * Custom inspect for Node.js console.log
   */
  [Symbol.for('nodejs.util.inspect.custom')](): string {
    return this.toString()
  }
}
