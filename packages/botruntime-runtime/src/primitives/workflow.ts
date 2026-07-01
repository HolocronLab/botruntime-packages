import type { ZodType } from '@holocronlab/botruntime-zui'
import { z } from '@holocronlab/botruntime-sdk'
import { ZuiType } from '../types'
import { WorkflowDefinitions } from '../_types/workflows'
import { BaseWorkflowInstance, createWorkflowExecutionState, writeWorkflowProvideState } from './workflow-instance'
import { context } from '../runtime/context/context'
import { Definitions } from './definition'
import type { WorkflowStep } from './workflow-step'
import ms from 'ms'
import type { BaseBot, BotClient } from '@holocronlab/botruntime-sdk/dist/bot'
import { Client, Workflow } from '@holocronlab/botruntime-client'
import { Autonomous } from '../runtime/autonomous'
import { WorkflowContinueEvent, WorkflowDataRequestEvent } from '../runtime'

/** @internal */
export const WorkflowHandler = Symbol.for('workflow.handler')

export namespace Typings {
  // Create the call signatures separately
  type StepCallSignature = <T>(
    name: string,
    run: ({ attempt }: { attempt: number }) => T | Promise<T>,
    options?: { maxAttempts?: number }
  ) => Promise<T>

  // All the methods except request
  type StepMethods = Pick<
    WorkflowStep,
    | 'listen'
    | 'fail'
    | 'progress'
    | 'abort'
    | 'sleep'
    | 'sleepUntil'
    | 'waitForWorkflow'
    | 'executeWorkflow'
    | 'map'
    | 'forEach'
    | 'batch'
    | 'notify'
  >

  export type TypedWorkflowStep<
    Requests extends Record<string, ZuiType>,
    Notifications extends Record<string, ZuiType>,
  > = StepCallSignature &
    StepMethods & {
      /**
       * Request data from the conversation and wait for a response.
       * The workflow will pause and send a data request event to the conversation.
       * Use WorkflowInstance.provide() in the conversation handler to respond.
       * If the same request type is used more than once, pass a unique stepName and later
       * resume the exact pending step with request.step from the workflow_request handler.
       * @param request - The name of the request (must be defined in workflow requests)
       * @param message - Message to display to the user describing what data is needed
       * @param stepName - Optional custom name for the step (defaults to request)
       * @returns The provided data validated against the request schema
       * @throws Error if workflow has no conversationId or request not found
       */
      request<TRequest extends keyof Requests & string>(
        request: TRequest,
        message: string,
        stepName?: string
      ): Promise<z.infer<Requests[TRequest]>>

      /**
       * Send a typed notification event back to the conversation without pausing the workflow.
       * Use unique step names when emitting the same notification multiple times from one handler.
       * @param notification - The name of the notification (must be defined in workflow notifications)
       * @param payload - The notification payload validated against the notification schema
       * @param stepName - Optional custom name for the step (defaults to notification)
       * @throws Error if workflow has no conversationId or notification not found
       */
      notify<TNotification extends keyof Notifications & string>(
        notification: TNotification,
        payload: z.infer<Notifications[TNotification]>,
        stepName?: string
      ): Promise<void>
    }

  export type HandlerProps<
    TName extends string = string,
    Input extends ZuiType = ZuiType,
    _Output extends ZuiType = ZuiType,
    State extends ZuiType = ZuiType,
    Requests extends Record<string, ZuiType> = Record<string, ZuiType>,
    Notifications extends Record<string, ZuiType> = Record<string, ZuiType>,
    TBot extends BaseBot = BaseBot,
  > = {
    input: z.infer<Input>
    state: z.infer<State>
    step: TypedWorkflowStep<Requests, Notifications>
    client: BotClient<TBot>
    execute: Autonomous.WorkerExecuteFn
    signal: AbortSignal
    workflow: BaseWorkflowInstance<TName>
  }

  export type Handler<
    TName extends string = string,
    Input extends ZuiType = ZuiType,
    Output extends ZuiType = ZuiType,
    State extends ZuiType = ZuiType,
    Requests extends Record<string, ZuiType> = Record<string, ZuiType>,
    Notifications extends Record<string, ZuiType> = Record<string, ZuiType>,
  > = (
    props: HandlerProps<TName, Input, Output, State, Requests, Notifications>
  ) => Promise<z.infer<Output>> | z.infer<Output>

  export type Props<
    TName extends string = string,
    Input extends ZuiType = ZuiType,
    Output extends ZuiType = ZuiType,
    State extends ZuiType = ZuiType,
    Requests extends Record<string, ZuiType> = Record<string, ZuiType>,
    Notifications extends Record<string, ZuiType> = Record<string, ZuiType>,
  > = {
    name: TName
    description?: string
    input?: Input
    output?: Output
    state?: State
    requests?: Requests
    notifications?: Notifications
    handler: Handler<TName, Input, Output, State, Requests, Notifications>
    schedule?: string
    timeout?: `${number}s` | `${number}m` | `${number}h`
  }

  export const Primitive = 'workflow' as const
}

export class BaseWorkflow<
  TName extends string = string,
  Input extends ZuiType = WorkflowDefinitions[TName] extends never
    ? ZuiType
    : WorkflowDefinitions[TName]['input'] extends ZodType
      ? WorkflowDefinitions[TName]['input']
      : ZuiType,
  Output extends ZuiType = WorkflowDefinitions[TName] extends never
    ? ZuiType
    : WorkflowDefinitions[TName]['output'] extends ZodType
      ? WorkflowDefinitions[TName]['output']
      : ZuiType,
  State extends ZuiType = WorkflowDefinitions[TName] extends never
    ? ZuiType
    : WorkflowDefinitions[TName]['state'] extends ZodType
      ? WorkflowDefinitions[TName]['state']
      : ZuiType,
  Requests extends Record<string, ZuiType> = Record<string, ZuiType>,
  Notifications extends Record<string, ZuiType> = Record<string, ZuiType>,
> {
  public readonly name: TName
  readonly description?: string
  /** @internal */
  readonly _inputSchema: Input
  /** @internal */
  readonly _outputSchema: Output
  /** @internal */
  readonly _stateSchema: State
  /** @internal */
  readonly _requestsSchemas: Requests
  /** @internal */
  readonly _notificationsSchemas: Notifications
  /** @internal */
  readonly _handler: Typings.Handler<TName, Input, Output, State, Requests, Notifications>

  /** @internal */
  readonly schedule?: string

  readonly timeout: number = ms('5m')

  constructor(props: Typings.Props<TName, Input, Output, State, Requests, Notifications>) {
    this.name = props.name
    if (props.description !== undefined) {
      this.description = props.description
    }
    this._inputSchema = (props.input || z.object({})) as Input
    this._outputSchema = (props.output || z.object({})) as Output
    this._stateSchema = (props.state || z.object({})) as State
    this._requestsSchemas = (props.requests || {}) as Requests
    this._notificationsSchemas = (props.notifications || {}) as Notifications
    this._handler = props.handler
    this.schedule = props.schedule!
    if (props.timeout) {
      this.timeout = ms(props.timeout)
    }
  }

  // @internal
  public get inputSchema() {
    const schema = (this._inputSchema as unknown as ZodType) ?? z.object({}).passthrough()

    return this.schedule ? schema.optional() : schema
  }

  // @internal
  public get outputSchema() {
    return (this._outputSchema as unknown as ZodType) ?? z.object({}).passthrough()
  }
  // @internal
  public get stateSchema() {
    return (this._stateSchema as unknown as ZodType) ?? z.object({}).passthrough()
  }

  /**
   * Load a workflow by explicit ID.
   * Delegates to BaseWorkflowInstance.get().
   *
   * @param id - The workflow ID to load
   * @returns A BaseWorkflowInstance
   */
  static async get<TName extends keyof WorkflowDefinitions>(id: string): Promise<BaseWorkflowInstance<TName>> {
    return BaseWorkflowInstance.get<TName>(id)
  }

  /**
   * Get the workflow definition for code generation
   * @internal
   */
  getDefinition(): Definitions.WorkflowDefinition {
    // Return the full definition including schemas for code generation
    return {
      name: this.name,
      type: Typings.Primitive,
      description: this.description!,
      input: this.inputSchema.toJSONSchema(),
      output: this.outputSchema.toJSONSchema(),
      state: this.stateSchema.toJSONSchema(),
      schedule: this.schedule!,
      timeout: this.timeout,
    }
  }

  /**
   * Get or create a workflow instance with the given key and input
   *
   * @param props.key - Optional unique key for workflow deduplication
   * @param props.start - Whether to start the workflow immediately (default: true)
   * @param props.input - The input data for the workflow
   * @returns The workflow instance
   */
  async getOrCreate(props: {
    key?: string
    statuses?: Workflow['status'][]
    input: WorkflowDefinitions[TName] extends never ? z.infer<Input> : WorkflowDefinitions[TName]['input']
  }): Promise<BaseWorkflowInstance<TName>> {
    const client = context.get('client')
    const statuses = props.statuses || ['pending', 'in_progress', 'listening', 'paused']

    // Validate input
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validatedInput = (this._inputSchema as any).parse(props.input)

    // Build tags for the workflow
    const tags: Record<string, string> = {}

    if (props.key) {
      tags['key'] = props.key
    }

    // Use Botpress getOrCreateWorkflow with discriminator for race-condition-free deduplication
    const discriminator = props.key ? ['key'] : undefined

    const createArgs = {
      status: 'pending',
      name: this.name as string,
      input: validatedInput,
      tags,
      conversationId: context.get('conversation', { optional: true })?.id,
      parentWorkflowId: context.get('workflow', { optional: true })?.id,
      timeoutAt: new Date(Date.now() + (this.timeout ?? ms('5m'))).toISOString(),
      ...(discriminator && { discriminateBy: { tags: discriminator } }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } satisfies Parameters<BotClient<any>['_inner']['createWorkflow']>[0]

    let { workflow } = await client._inner.getOrCreateWorkflow(createArgs)

    if (props.key && !statuses.includes(workflow.status)) {
      // If the workflow status is not in the desired statuses, create a new one
      // TODO: this is NOT ideal at all see issue below. Fix this when the API supports it
      // https://linear.app/botpress/issue/ENG-3382/workflows-add-status-as-discriminator-on-getorcreate
      await client._inner.deleteWorkflow({ id: workflow.id })
      ;({ workflow } = await client._inner.getOrCreateWorkflow(createArgs))
    }

    // Use the factory function to create the appropriate instance type
    return await BaseWorkflowInstance.load({
      id: workflow.id,
      workflow,
    })
  }

  /**
   * Provide data in response to a workflow data request.
   * Call this method from a conversation handler when you receive a WorkflowDataRequestEvent.
   * @param event - The event object from the conversation handler
   * @param data - The data to provide to the workflow
   * @example
   * if (isWorkflowDataRequest(event)) {
   *   await SomeWorkflow.provide(event, { orderId: "12345" });
   * }
   *
   * // In a workflow_request handler, request.step is already the exact target step.
   * if (type === 'workflow_request') {
   *   await SomeWorkflow.provide(event, reply.payload.text)
   * }
   */
  async provide(
    event: {
      type: string
      payload: z.infer<typeof WorkflowDataRequestEvent.schema>
    },
    data: unknown
  ): Promise<void> {
    const client = context.get('client')
    const { workflowId, stepName } = event.payload

    // Load workflow execution state
    const state = createWorkflowExecutionState(client._inner as unknown as Client, workflowId)
    await state.load()

    if (!state.value) {
      throw new Error(`Workflow execution state not found for workflow ${workflowId}`)
    }

    writeWorkflowProvideState(state.value, stepName, data, { allowCreate: true })

    // Save the state
    await state.save()

    // Trigger workflow to continue
    await client.createEvent({
      type: WorkflowContinueEvent.name,
      workflowId,
      payload: {},
    })
  }

  async start(input: z.infer<Input>): Promise<BaseWorkflowInstance<TName>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const validatedInput = (this._inputSchema as any).parse(input)

    const client = context.get('client')
    const event = context.get('event', { optional: true })
    const workflow = context.get('workflow', { optional: true })

    const res = await client._inner.createWorkflow({
      name: this.name,
      status: event ? 'in_progress' : 'pending',
      eventId: event?.id,
      input: validatedInput,
      parentWorkflowId: workflow?.id,
      conversationId: context.get('conversation', { optional: true })?.id,
      timeoutAt: new Date(Date.now() + (this.timeout ?? ms('5m'))).toISOString(),
    })

    return await BaseWorkflowInstance.load({
      id: res.workflow.id,
      workflow: res.workflow,
    })
  }

  /**
   * Convert this workflow into an Autonomous.Tool that can be used with execute().
   * Starts the workflow and returns basic information about the workflow instance.
   *
   * @param options.description - Optional description override for the tool
   * @returns An Autonomous.Tool instance
   *
   * @example
   * const tool = MyWorkflow.asTool()
   *
   * await execute({
   *   tools: [tool],
   *   instructions: 'Use the workflow when needed'
   * })
   */
  asTool(options?: { description?: string }) {
    const description = options?.description || this.description || `Starts the ${this.name} workflow`

    return new Autonomous.Tool({
      name: this.name,
      description,
      input: this._inputSchema,
      output: z.object({
        workflowId: z.string().describe('The ID of the started workflow'),
        status: z.string().describe('The initial status of the workflow'),
      }),
      handler: async (input) => {
        const instance = await this.start(input)
        return {
          workflowId: instance.id,
          status: instance.workflow.status,
        }
      },
    })
  }
}
