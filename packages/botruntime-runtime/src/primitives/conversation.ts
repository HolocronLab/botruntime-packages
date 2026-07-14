import { type Event as CEvent, type Message as CMessage } from '@holocronlab/botruntime-client'
import { z } from '@holocronlab/botruntime-sdk'
import { BotClient } from '@holocronlab/botruntime-sdk/dist/bot'
import ms from 'ms'
import { setTimeout } from 'node:timers/promises'
import type { ChannelSpec, Channels } from '../_types/channels'
import type { ConversationDefinitions, ConversationRoutableEvents } from '../_types/conversations'
import type { EventName, EventPayload as CustomEventPayload } from '../_types/events'
import type { Integrations } from '../_types/integrations'
import { WorkflowDefinitions } from '../_types/workflows'
import { adk } from '../library'
import { Autonomous } from '../runtime/autonomous'
import { BotContext, context } from '../runtime/context/context'
import {
  WorkflowCallbackEventType,
  WorkflowDataRequestEventType,
  WorkflowNotifyEventType,
  LifecycleNudgeEventType,
  LifecycleExpireEventType,
} from '../runtime/events'
import { span } from '../telemetry/tracing'
import { ZuiType } from '../types'
import { isEvent, isEventMessage } from '../utilities/events'
import { BaseConversationInstance } from './conversation-instance'
import { BaseCustomComponent, buildExampleJsx } from './custom-component'
import { Definitions } from './definition'
import { LifecycleEngine, type LifecycleEngineContext } from './lifecycle-engine'
import { BaseWorkflowInstance } from './workflow-instance'
import { Chat } from '../runtime/chat/chat'

type WorkflowRequest = {
  [WfName in keyof WorkflowDefinitions & string]: keyof WorkflowDefinitions[WfName]['requests'] extends never
    ? never
    : {
        [ReqName in keyof WorkflowDefinitions[WfName]['requests'] & string]: {
          type: `${WfName}:${ReqName}`
          workflow: BaseWorkflowInstance<WfName>
          step: string
        }
      }[keyof WorkflowDefinitions[WfName]['requests'] & string]
}[keyof WorkflowDefinitions & string]

type WorkflowCallback = {
  [WfName in keyof WorkflowDefinitions & string]: {
    type: WfName
    workflow: BaseWorkflowInstance<WfName>
    status: 'completed' | 'failed' | 'canceled' | 'timed_out'
    output?: z.infer<WorkflowDefinitions[WfName]['output']>
    error?: string
  }
}[keyof WorkflowDefinitions & string]

type WorkflowNotification = {
  [WfName in keyof WorkflowDefinitions & string]: keyof WorkflowDefinitions[WfName]['notifications'] extends never
    ? never
    : {
        [NotificationName in keyof WorkflowDefinitions[WfName]['notifications'] & string]: {
          type: `${WfName}:${NotificationName}`
          workflow: BaseWorkflowInstance<WfName>
          step: string
          payload: WorkflowDefinitions[WfName]['notifications'][NotificationName]
        }
      }[keyof WorkflowDefinitions[WfName]['notifications'] & string]
}[keyof WorkflowDefinitions & string]

/** @internal */
export const ConversationHandler = Symbol.for('conversation.handler')

export namespace Typings {
  // These are NOT used by the definition - only by ConversationInstance at runtime
  // The definition uses IntegrationChannels, the instance uses ConversationDefinitions
  // export type Message<TChannel extends string> = ConversationDefinitions[TChannel]['messages']
  export type Message<
    TChannel extends keyof ConversationDefinitions = keyof ConversationDefinitions,
    TType extends keyof ConversationDefinitions[TChannel]['messages'] =
      keyof ConversationDefinitions[TChannel]['messages'],
  > = TChannel extends keyof ConversationDefinitions
    ? TType extends keyof ConversationDefinitions[TChannel]['messages']
      ? Omit<CMessage, 'type' | 'tags' | 'payload'> & {
          type: TType
          payload: ConversationDefinitions[TChannel]['messages'][TType]
          tags: ConversationDefinitions[TChannel]['messageTags']
        }
      : never
    : never

  export type Event<TChannel extends keyof ConversationDefinitions = keyof ConversationDefinitions> =
    TChannel extends keyof ConversationDefinitions
      ?
          | {
              [EType in keyof ConversationDefinitions[TChannel]['events']]: {
                type: EType
                payload: ConversationDefinitions[TChannel]['events'][EType]
              }
            }[keyof ConversationDefinitions[TChannel]['events'] & (string | number)]
          | WorkflowCallbackEventType
      : never

  // Extract channel from ChannelSpec (single channel, union of array, or all channels if glob)
  export type ExtractChannel<T extends ChannelSpec> = T extends readonly string[]
    ? T[number]
    : T extends '*'
      ? Channels
      : T

  /**
   * Extract event name from "integration:eventName" format.
   * e.g., "webchat:conversationStarted" -> "conversationStarted"
   */
  type ExtractEventName<T extends string> = T extends `${string}:${infer EventName}` ? EventName : T

  /**
   * Check if an event name is a custom event (no colon separator).
   * Custom events are defined in agent.config.ts.
   */
  type IsCustomEvent<T extends string> = T extends `${string}:${string}` ? false : true

  /**
   * Extract integration alias from "alias:eventName" format.
   * e.g., "webchat:conversationStarted" -> "webchat"
   */
  type ExtractIntegrationAlias<T extends string> = T extends `${infer Alias}:${string}` ? Alias : never

  /**
   * Get event payload from an event type string.
   * Supports both integration events and custom events.
   *
   * For integration events (format "alias:eventName"), this looks up the event
   * directly from the Integrations type using the alias and event name.
   * For custom events (no colon), this uses the EventPayload type.
   */
  type GetEventPayload<T extends string> =
    IsCustomEvent<T> extends true
      ? T extends EventName
        ? CustomEventPayload<T>
        : unknown
      : ExtractIntegrationAlias<T> extends infer Alias
        ? Alias extends keyof Integrations
          ? ExtractEventName<T> extends keyof Integrations[Alias]['events']
            ? Integrations[Alias]['events'][ExtractEventName<T>]
            : unknown
          : unknown
        : unknown

  /**
   * Create a discriminated union of event handler props for each event type.
   * The conversation instance is always typed based on the conversation's channel,
   * not the event's source integration.
   */
  type EventHandlerProps<
    TEvents extends readonly string[],
    State extends ZuiType,
    TChannel extends keyof ConversationDefinitions = keyof ConversationDefinitions,
  > = TEvents extends readonly []
    ? never
    : {
        [K in TEvents[number]]: {
          type: 'event'
          channel: TChannel
          conversation: BaseConversationInstance<TChannel>
          event: { type: K; payload: GetEventPayload<K> } | WorkflowCallbackEventType
          message?: never
          workflow?: never
          request?: never
          completion?: never
          notification?: never
          state: z.infer<State>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          client: BotClient<any>
          execute: Autonomous.ConvoExecuteFn
          chat: Chat
        }
      }[TEvents[number]]

  /**
   * Fallback handler props for wildcard channel (`"*"`).
   * Used when `ConversationDefinitions` has no entry for the incoming channel —
   * i.e. the handler was registered with `channel: "*"` and no specific handler
   * populated that channel in the generated types.
   *
   * `execute` is always correctly typed and callable.
   * Channel-specific properties (`message`, `event`, `conversation`) are `unknown`
   * because the concrete channel is only known at runtime.
   */
  type WildcardHandlerProps<State extends ZuiType> = {
    type: 'message' | 'event' | 'workflow_request' | 'workflow_callback' | 'workflow_notify' | 'nudge' | 'expire'
    channel: Channels
    conversation: {
      readonly channel: Channels
      readonly id: string
      tags: Record<string, string | undefined>
      send: (message: { type: string; payload?: unknown }) => Promise<void>
      startTyping: () => Promise<void>
      stopTyping: () => Promise<void>
    }
    message?: unknown
    event?: unknown
    request?: unknown
    completion?: unknown
    notification?: unknown
    state: z.infer<State>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    client: BotClient<any>
    execute: Autonomous.ConvoExecuteFn
    chat: Chat
  }

  // Handler receives ConversationInstance at runtime (uses generated ConversationDefinitions)
  export type HandlerProps<
    TChannelSpec extends ChannelSpec = ChannelSpec,
    State extends ZuiType = ZuiType,
    TEvents extends readonly string[] = readonly [],
    Channel extends string = ExtractChannel<TChannelSpec>,
  > = TChannelSpec extends '*'
    ? WildcardHandlerProps<State>
    : Channel extends keyof ConversationDefinitions
      ? TEvents extends readonly []
        ? // No events specified - message, workflow_request, workflow_callback, and event handlers
            | {
                type: 'message'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                message: Message<Channel>
                event?: never
                workflow?: never
                request?: never
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'workflow_request'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: WorkflowDataRequestEventType
                message?: never
                workflow?: never
                request: WorkflowRequest
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'workflow_notify'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: WorkflowNotifyEventType
                message?: never
                workflow?: never
                request?: never
                completion?: never
                notification: WorkflowNotification
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'workflow_callback'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: WorkflowCallbackEventType
                message?: never
                workflow?: never
                request?: never
                completion: WorkflowCallback
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'nudge'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: LifecycleNudgeEventType
                message?: never
                workflow?: never
                request?: never
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'expire'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: LifecycleExpireEventType
                message?: never
                workflow?: never
                request?: never
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
        : // Events specified - include event handler with discriminated channel based on event type
            | {
                type: 'message'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                message: Message<Channel>
                event?: never
                workflow?: never
                request?: never
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | EventHandlerProps<TEvents, State, Channel>
            | {
                type: 'workflow_request'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: WorkflowDataRequestEventType
                message?: never
                workflow?: never
                request: WorkflowRequest
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'workflow_notify'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: WorkflowNotifyEventType
                message?: never
                workflow?: never
                request?: never
                completion?: never
                notification: WorkflowNotification
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'workflow_callback'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: WorkflowCallbackEventType
                message?: never
                workflow?: never
                request?: never
                completion: WorkflowCallback
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'nudge'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: LifecycleNudgeEventType
                message?: never
                workflow?: never
                request?: never
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
            | {
                type: 'expire'
                channel: Channel
                conversation: BaseConversationInstance<Channel>
                event: LifecycleExpireEventType
                message?: never
                workflow?: never
                request?: never
                completion?: never
                notification?: never
                state: z.infer<State>
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                client: BotClient<any>
                execute: Autonomous.ConvoExecuteFn
                chat: Chat
              }
      : never

  export type Handler<
    TChannelSpec extends ChannelSpec = ChannelSpec,
    State extends ZuiType = ZuiType,
    TEvents extends readonly string[] = readonly [],
  > = (props: HandlerProps<TChannelSpec, State, TEvents>) => Promise<void> | void

  /**
   * Get available routable event names for a given channel.
   * These are events that have a conversationId property and can be routed to conversations.
   */
  export type RoutableEventNames<TChannel extends keyof ConversationDefinitions> =
    TChannel extends keyof ConversationRoutableEvents ? ConversationRoutableEvents[TChannel][number] : never

  /**
   * Event specification type for conversations.
   * Includes both:
   * - Integration events that are routable for the channel(s) (have conversationId)
   * - Custom events defined in agent.config.ts
   */
  export type EventSpec<TChannelSpec extends ChannelSpec> =
    ExtractChannel<TChannelSpec> extends keyof ConversationRoutableEvents
      ? readonly (ConversationRoutableEvents[ExtractChannel<TChannelSpec>][number] | EventName)[]
      : readonly (string | EventName)[]

  /**
   * Input passed to the {@link Props.shouldInterrupt} predicate for each event
   * that arrives while the handler is running.
   *
   * The candidate is surfaced in its raw form (`message_created` events carry a
   * `message`; everything else carries an `event`) rather than the resolved
   * handler discriminated union — resolving workflow/notification objects would
   * require loading workflow instances inside the polling loop, which is too
   * expensive for a per-event hot path.
   *
   * - `kind: 'message'` — a user message arrived. `message` is set.
   * - `kind: 'event'` — any other event arrived. `event` is set; branch on
   *   `event.type` (e.g. custom event names, `"slack:reactionAdded"`).
   *
   * Internal `workflowNotify` / `lifecycleNudge` / `lifecycleExpire` events
   * never reach this predicate — they are guaranteed never to interrupt.
   */
  export type ShouldInterruptProps =
    | {
        kind: 'message'
        /** The incoming message. */
        message: CMessage
        event?: never
        /** The event currently being processed (the one the handler was invoked for). */
        current: CEvent | undefined
      }
    | {
        kind: 'event'
        message?: never
        /** The incoming raw event. Branch on `event.type`. */
        event: CEvent
        /** The event currently being processed (the one the handler was invoked for). */
        current: CEvent | undefined
      }

  // Props type for conversation definition
  // TChannelSpec will be constrained by generated ChannelSpec type
  export type Props<
    TChannelSpec extends ChannelSpec = ChannelSpec,
    State extends ZuiType = ZuiType,
    TEvents extends EventSpec<TChannelSpec> = readonly [],
  > = {
    channel: TChannelSpec
    handler: Handler<TChannelSpec, State, TEvents>
    state?: State
    /**
     * Narrow which incoming events interrupt (abort) the in-flight handler.
     *
     * Internal `workflowNotify` / `lifecycleNudge` / `lifecycleExpire` events
     * never interrupt — that is a fixed invariant. By default every *other*
     * newer event interrupts. This predicate lets you opt specific events out:
     * it is called only for events that are already interruption candidates
     * (newer than the event being processed, not that event itself, and not an
     * internal event), and can only narrow further — it cannot make an internal
     * event interrupt.
     *
     * Return `true` to abort current processing, `false` to let the handler
     * finish — the ignored event stays pending and is picked up by the next
     * handler invocation (it is processed, just not mid-flight). A predicate
     * that always returns `false` puts the conversation in "let me finish my
     * turn" mode, queueing messages and processing them one run at a time.
     *
     * Must be synchronous — it runs inside a 50ms polling loop.
     */
    shouldInterrupt?: (props: ShouldInterruptProps) => boolean
    /**
     * Array of event names this conversation should listen to.
     * Supports both:
     * - Integration events with conversationId (e.g., "webchat:conversationStarted")
     * - Custom events defined in agent.config.ts (e.g., "orderPlaced")
     * By default, conversations only receive messages, not events.
     */
    events?: TEvents
    chat?: (props: { context: BotContext; channel: ExtractChannel<TChannelSpec> }) => Chat
    /**
     * Optional lifecycle management for nudge-on-silence and idle expiration.
     * Durations use `ms`-compatible strings (e.g., "5m", "1h", "30s").
     *
     * - `nudge.after`: time of silence before the first nudge fires
     * - `nudge.interval`: time between subsequent nudges (defaults to `nudge.after`)
     * - `nudge.max`: maximum number of nudges before stopping (unlimited if omitted)
     * - `expire.after`: time of silence before the conversation session expires
     */
    lifecycle?: {
      nudge?: { after: string; interval?: string; max?: number }
      expire?: { after: string }
    }
    /**
     * Custom components the LLM can yield during autonomous execution.
     * Each component must have been created with component metadata:
     * `new CustomComponent(component, { description, props, exampleValues })`
     */
    // oxlint-disable-next-line no-explicit-any -- CustomComponent generic requires any for broad FC compatibility
    components?: BaseCustomComponent<any>[]
  }

  export const Primitive = 'conversation' as const
}

/**
 * Parsed lifecycle configuration with durations converted to milliseconds.
 * Stored on BaseConversation after construction-time validation.
 */
export type LifecycleConfig = {
  nudge?: { afterMs: number; intervalMs: number; max?: number }
  expire?: { afterMs: number }
}

/**
 * Parse a duration string via the `ms` library and validate it is positive.
 * Throws if the string is invalid or the resulting value is non-positive.
 */
function parseDuration(value: string, label: string): number {
  const result = ms(value as ms.StringValue)
  if (result === undefined || typeof result !== 'number' || isNaN(result)) {
    throw new Error(
      `Invalid lifecycle duration for "${label}": "${value}" is not a valid ms-compatible duration string.`
    )
  }
  if (result <= 0) {
    throw new Error(
      `Invalid lifecycle duration for "${label}": duration must be positive, got "${value}" (${result}ms).`
    )
  }
  return result
}

/**
 * Base Conversation definition class.
 * This defines a conversation handler for one or more channels.
 * At runtime, it will be instantiated as a BaseConversationInstance.
 *
 * The generated Conversation class in runtime.d.ts provides proper typing.
 */
export class BaseConversation<
  TChannelSpec extends ChannelSpec = ChannelSpec,
  State extends ZuiType = ZuiType,
  TEvents extends Typings.EventSpec<TChannelSpec> = readonly [],
>
  implements Definitions.Primitive
{
  public readonly channel: ChannelSpec

  /**
   * Array of event names this conversation listens to.
   * Only events with conversationId property are allowed.
   * Empty array means no events (only messages).
   */
  public readonly events: readonly string[]

  /** @internal */
  public readonly schema: State

  /** @internal */
  public readonly chatFactory: (props: { context: BotContext; channel: TChannelSpec }) => Chat

  /**
   * Custom components the LLM can yield during autonomous execution.
   * Auto-registered on chat before the handler runs.
   * @internal
   */
  // oxlint-disable-next-line no-explicit-any -- CustomComponent generic requires any for broad FC compatibility
  public readonly components: BaseCustomComponent<any>[]

  /**
   * Parsed lifecycle configuration with durations in milliseconds.
   * Undefined when no lifecycle prop is configured.
   * @internal
   */
  public readonly lifecycleConfig?: LifecycleConfig

  #handler: Typings.Handler<TChannelSpec, State, TEvents>
  #shouldInterrupt?: (props: Typings.ShouldInterruptProps) => boolean

  constructor(props: Typings.Props<TChannelSpec, State, TEvents>) {
    this.channel = props.channel as ChannelSpec
    this.events = (props.events ?? []) as readonly string[]
    this.schema = props.state ?? (z.object({}).passthrough() as unknown as State)
    this.#handler = props.handler
    if (props.shouldInterrupt) {
      this.#shouldInterrupt = props.shouldInterrupt
    }
    // `props.chat` is typed against the narrower `ExtractChannel<TChannelSpec>` (the single
    // resolved channel a conversation instance actually runs with), while `chatFactory` is
    // stored against the raw, possibly-wider `TChannelSpec` generic parameter itself. Callers
    // always invoke `chatFactory` with an already-extracted channel value, so this is a sound
    // narrowing in practice, not just at the type level.
    this.chatFactory = (props.chat ?? (({ context }) => new Chat(context))) as (props: {
      context: BotContext
      channel: TChannelSpec
    }) => Chat

    // Validate and store custom components
    this.components = props.components ?? []
    for (const comp of this.components) {
      if (!comp.hasMetadata) {
        throw new Error(
          `Component "${comp.name}" is listed in Conversation.components but has no component metadata. ` +
            `Pass metadata as the second argument: new CustomComponent(component, { description, props, exampleValues })`
        )
      }
    }

    // Parse and validate lifecycle configuration
    if (props.lifecycle) {
      const config: LifecycleConfig = {}

      if (props.lifecycle.nudge) {
        const afterMs = parseDuration(props.lifecycle.nudge.after, 'nudge.after')
        const intervalMs = props.lifecycle.nudge.interval
          ? parseDuration(props.lifecycle.nudge.interval, 'nudge.interval')
          : afterMs
        config.nudge = { afterMs, intervalMs }
        if (props.lifecycle.nudge.max !== undefined) {
          if (!Number.isInteger(props.lifecycle.nudge.max) || props.lifecycle.nudge.max < 1) {
            throw new Error(
              `Invalid lifecycle configuration for "nudge.max": must be a positive integer, got ${props.lifecycle.nudge.max}.`
            )
          }
          config.nudge.max = props.lifecycle.nudge.max
        }
      }

      if (props.lifecycle.expire) {
        const afterMs = parseDuration(props.lifecycle.expire.after, 'expire.after')
        config.expire = { afterMs }
      }

      this.lifecycleConfig = config
    }
  }

  /**
   * Load a conversation by explicit ID.
   * Delegates to BaseConversationInstance.get().
   *
   * @param id - The conversation ID to load
   * @returns A BaseConversationInstance (unparameterized channel)
   */
  static async get(id: string): Promise<BaseConversationInstance> {
    return BaseConversationInstance.get(id)
  }

  /** @internal */
  public getDefinition(): Definitions.ConversationDefinition {
    const base: Definitions.ConversationDefinition = {
      type: 'conversation' as const,
      channel:
        this.channel === '*'
          ? '*'
          : Array.isArray(this.channel)
            ? (this.channel as string[])
            : (this.channel as string),
    }

    // Only include events property if there are events (exactOptionalPropertyTypes compatibility)
    if (this.events.length > 0) {
      base.events = [...this.events]
    }

    // Include hasLifecycle flag so the generator can detect lifecycle usage
    if (this.lifecycleConfig) {
      base.hasLifecycle = true
    }

    return base
  }

  /** @internal */
  async [ConversationHandler]() {
    const message = context.get('message', { optional: true })
    const event = context.get('event', { optional: true })
    const chat = context.get('chat')
    const client = context.get('client')
    const botpressConversation = context.get('conversation')

    // Create the conversation instance
    const conversationInstance = new BaseConversationInstance(botpressConversation, client)

    // Skip typing indicator for lifecycle events — nudge/expire should be silent
    const isLifecycleEvent = event?.type === 'lifecycleNudge' || event?.type === 'lifecycleExpire'

    let startTypingPromise: Promise<void> | undefined
    let typingInterval: ReturnType<typeof setInterval> | undefined

    if (!isLifecycleEvent) {
      startTypingPromise = conversationInstance.startTyping().catch(() => {})

      // Keep typing indicator alive by refreshing every 4s (matches DM behavior)
      typingInterval = setInterval(() => {
        void conversationInstance.startTyping().catch(() => {})
      }, 4_000)
    }

    // Check if this is a workflow data request or workflow completion
    let type: 'message' | 'event' | 'workflow_request' | 'workflow_callback' | 'workflow_notify' | 'nudge' | 'expire'
    let requestObject: WorkflowRequest | undefined = undefined
    let completionObject: WorkflowCallback | undefined = undefined
    let notificationObject: WorkflowNotification | undefined = undefined

    if (message) {
      type = 'message'
    } else if (event && event.type === 'workflowDataRequest') {
      type = 'workflow_request'
      try {
        const workflowInstance = await BaseWorkflowInstance.load({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          id: (event.payload as any).workflowId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = event.payload as any
        requestObject = {
          type: `${payload.workflowName}:${payload.request}`,
          workflow: workflowInstance,
          step: payload.stepName,
        } as WorkflowRequest
      } catch (err) {
        console.error('Failed to load workflow instance for data request', err)
        type = 'event'
      }
    } else if (event && event.type === 'workflowCallback') {
      type = 'workflow_callback'
      try {
        const workflowInstance = await BaseWorkflowInstance.load({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          id: (event.payload as any).workflowId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = event.payload as any
        completionObject = {
          type: payload.workflow,
          workflow: workflowInstance,
          status: payload.status,
          output: payload.output,
          error: payload.error,
        } as WorkflowCallback
      } catch (err) {
        console.error('Failed to load workflow instance for completion', err)
        type = 'event'
      }
    } else if (event && event.type === 'workflowNotify') {
      type = 'workflow_notify'
      try {
        const workflowInstance = await BaseWorkflowInstance.load({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          id: (event.payload as any).workflowId,
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = event.payload as any
        notificationObject = {
          type: `${payload.workflowName}:${payload.notification}`,
          workflow: workflowInstance,
          step: payload.stepName,
          payload: payload.payload,
        } as WorkflowNotification
      } catch (err) {
        console.error('Failed to load workflow instance for notification', err)
        type = 'event'
      }
    } else if (event && event.type === 'lifecycleNudge') {
      type = 'nudge'
    } else if (event && event.type === 'lifecycleExpire') {
      type = 'expire'
    } else {
      type = 'event'
    }

    const controller = new AbortController()

    // Capture before entering the span closure — `checkNewUserMessage` is a
    // function declaration, so `this` is not lexically bound inside it.
    const shouldInterrupt = this.#shouldInterrupt

    // Interruption detection
    void span(
      'interruption.check',
      {
        conversationId: conversationInstance.id,
      },
      async (s) => {
        async function checkNewUserMessage() {
          if (controller.signal.aborted) {
            return
          }

          const { events } = await client.listEvents({
            conversationId: conversationInstance.id,
            status: 'pending',
          })

          // Internal workflow/lifecycle events must NEVER interrupt the
          // handler — this is a correctness invariant, not policy, so it
          // always applies and is not overridable by `shouldInterrupt`. A
          // consumer predicate can only narrow interruption further (interrupt
          // on fewer things), never broaden it into these internal events.
          const isInternalEvent = (e: (typeof events)[number]) =>
            e.type === 'workflowNotify' || e.type === 'lifecycleNudge' || e.type === 'lifecycleExpire'

          // Consumer-provided predicate, if any, decides policy for the events
          // that survive the invariant guard. Without one, every surviving
          // event interrupts (the default behavior). The createdAt/id checks
          // below are non-negotiable correctness guards applied regardless.
          const interruptDecider = (e: (typeof events)[number]) => {
            if (isInternalEvent(e)) {
              return false
            }
            if (!shouldInterrupt) {
              return true
            }
            return shouldInterrupt(
              isEventMessage(e)
                ? {
                    kind: 'message',
                    message: e.payload.message,
                    current: event,
                  }
                : { kind: 'event', event: e, current: event }
            )
          }

          const newEvents = events.filter(
            (e) => e.createdAt > event?.createdAt && e.id !== event?.id && interruptDecider(e)
          )

          if (newEvents.length) {
            s.setAttributes({
              'interruption.detected': true,
              'interruption.events_count': newEvents.length,
              'interruption.event_ids': newEvents.map((e) => e.id),
            })

            await chat.addEvent({
              id: Date.now().toString(),
              type: 'interruption',
              createdAt: new Date().toISOString(),
              payload: {
                text: `New messages were detected during the processing of the message. The processing has been aborted mid-way, so the results may be incomplete.`,
              },
            })
          }

          if (newEvents.length > 1) {
            for (const event of newEvents.slice(1, -1)) {
              if (isEvent(event)) {
                if (isEventMessage(event)) {
                  await chat.addMessage(event.payload.message)
                } else {
                  await chat.addEvent(event)
                }
              }
            }
          }

          if (newEvents.length) {
            controller.abort(`More messages were received during processing, aborting current processing.`)
          } else {
            s.setAttribute('interruption.detected', false)
          }

          let remaining = 750 // ms
          const wait = 50 // ms
          while (remaining > wait) {
            if (controller.signal.aborted) {
              return
            }
            await setTimeout(wait)
            remaining -= wait
          }

          return checkNewUserMessage()
        }

        await checkNewUserMessage()
      }
    )

    // Create execute function with chat mode and interruption signal
    const execute = Autonomous.createExecute({
      mode: 'chat',
      defaultModel: adk.project.config.defaultModels.autonomous,
      interruption: controller.signal,
    })

    // Ensure state is always defined (default to empty object)
    if (!conversationInstance.TrackedState.value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      conversationInstance.TrackedState.value = {} as any
    }

    // Create a proxy that marks state as dirty when mutated
    const stateProxy = new Proxy(conversationInstance.TrackedState.value, {
      set(target, prop, value) {
        // Only mark dirty if the value actually changed
        const oldValue = target[prop as keyof typeof target]
        if (oldValue !== value) {
          const result = Reflect.set(target, prop, value)
          conversationInstance.TrackedState.markDirty()
          return result
        }
        return true
      },
    })

    // Build lifecycle engine context if lifecycle is configured
    let lifecycleCtx: LifecycleEngineContext | undefined
    if (this.lifecycleConfig && conversationInstance.LifecycleTrackedState) {
      lifecycleCtx = {
        client,
        conversationId: conversationInstance.id,
        lifecycleConfig: this.lifecycleConfig,
        lifecycleState: conversationInstance.LifecycleTrackedState,
        event: event as LifecycleEngineContext['event'],
      }
    }

    // --- Lifecycle: fire-and-forget async work for messages ---
    // Timer scheduling and message tagging run in the background (same pattern as typing indicator).
    // Only the synchronous state update (session renewal, lastActivityAt) blocks the handler.
    let lifecycleTimerPromise: Promise<void> | undefined
    if (type === 'message' && lifecycleCtx) {
      const { renewed } = LifecycleEngine.onActivity(lifecycleCtx)

      // Clear expired tag synchronously (tag mutation is in-memory, saved by saveAllDirty)
      if (renewed) {
        try {
          conversationInstance.tags.sessionExpired = ''
        } catch {
          // non-fatal
        }
      }

      // Timer scheduling — fire-and-forget, completes before saveAllDirty
      lifecycleTimerPromise = LifecycleEngine.scheduleTimers(lifecycleCtx).catch(() => {})

      // Message tagging — fire-and-forget
      if (message && conversationInstance.session) {
        const session = conversationInstance.session
        client
          .updateMessage({
            id: message.id,
            tags: {
              sessionId: session.id,
              sessionNumber: String(session.number),
            },
          })
          .catch(() => {})
      }
    }

    try {
      // --- Lifecycle: onNudge guard ---
      if (type === 'nudge' && lifecycleCtx) {
        const result = await LifecycleEngine.onNudge(lifecycleCtx)
        if (result.skipped) {
          return // Skip handler entirely — stale nudge or workflow active
        }
      }

      // --- Lifecycle: onExpire guard ---
      if (type === 'expire' && lifecycleCtx) {
        const result = await LifecycleEngine.onExpire(lifecycleCtx)
        if (result.skipped) {
          return // Skip handler entirely — stale expire
        }
      }

      // --- Lifecycle: patch createMessage to tag outgoing bot messages with session info ---
      // Monkey-patch the client's createMessage so that Chat (and any other caller)
      // automatically gets session tags injected into every outgoing message.
      // The client is scoped to this handler invocation, so this is safe.
      if (conversationInstance.session) {
        const session = conversationInstance.session
        const originalCreateMessage = client.createMessage.bind(client)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client.createMessage = async (input: any) => {
          try {
            input.tags = {
              ...input.tags,
              sessionId: session.id,
              sessionNumber: String(session.number),
            }
          } catch {
            // Tag injection failed (e.g., frozen input) — proceed without session tags
          }
          return originalCreateMessage(input)
        }
      }

      // Auto-register custom components on chat so the LLM can yield them (webchat only)
      if (botpressConversation.integration === 'webchat') {
        for (const comp of this.components) {
          const meta = comp.metadata
          if (!meta) continue

          chat.registerComponent({
            component: new Autonomous.Component({
              type: 'leaf',
              name: comp.name,
              description: meta.description,
              examples: meta.exampleValues.map((values, i) => ({
                name: `Example ${i + 1}`,
                description: `Render a ${comp.name} component`,
                code: `yield <Message>\n  ${buildExampleJsx(comp.name, values)}\n</Message>`,
              })),
              leaf: {
                // oxlint-disable-next-line no-explicit-any -- Zui schema requires any for SDK Component type compatibility
                props: meta.props as any,
              },
            }),
            handler: async (rendered) => {
              await conversationInstance.send({
                type: 'customComponent' as never,
                payload: { component: comp, props: rendered.props } as never,
              })
            },
          })
        }
      }

      // Run the developer's handler. For expire events, catch errors so
      // the expiration cleanup always runs — a thrown handler must not
      // prevent session teardown.
      let handlerError: unknown
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await this.#handler({
          type,
          message,
          channel: conversationInstance.channel,
          event,
          request: requestObject,
          completion: completionObject,
          notification: notificationObject,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          conversation: conversationInstance as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          state: stateProxy as any,
          client,
          execute,
          chat,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any)
      } catch (err) {
        if (type === 'expire') {
          // Capture but don't rethrow yet — expiration cleanup must run first
          handlerError = err
        } else {
          throw err
        }
      }

      // --- Lifecycle: afterNudgeHandler — schedule next nudge ---
      if (type === 'nudge' && lifecycleCtx) {
        await LifecycleEngine.afterNudgeHandler(lifecycleCtx)
      }

      // --- Lifecycle: executeExpiration ---
      // Full expiration sequence (strict ordering per institutional learning):
      //   Step 1: Cancel all active workflows (handled by engine)
      //   Step 2: Tag conversation as expired
      //   Step 3: Reset user state to defaults
      //   Step 4: Clear transcript
      //   Step 5: Update lifecycle state (handled by engine)
      //
      // Runs unconditionally once the race guard passes, regardless of
      // whether the handler succeeded. A thrown expire handler must not
      // prevent session teardown.
      if (type === 'expire' && lifecycleCtx) {
        // Steps 1 & 5: workflow cancellation + lifecycle state update
        await LifecycleEngine.executeExpiration(lifecycleCtx)

        // Step 2: Tag conversation as expired
        try {
          conversationInstance.tags.sessionExpired = 'true'
        } catch (err) {
          console.warn(
            `[lifecycle] Failed to set sessionExpired tag for conversation ${conversationInstance.id}:`,
            err instanceof Error ? err.message : String(err)
          )
        }

        // Step 3: Reset user state to defaults (empty object triggers schema defaults on next load)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        conversationInstance.TrackedState.value = {} as any
        conversationInstance.TrackedState.markDirty()

        // Step 4: Clear transcript
        await chat.clearTranscript()
        await chat.saveTranscript()
      }

      // Re-throw the handler error after cleanup is complete
      if (handlerError) {
        throw handlerError
      }
    } finally {
      // Wait for lifecycle timer scheduling to complete before saveAllDirty runs
      if (lifecycleTimerPromise) {
        await lifecycleTimerPromise
      }
      controller.abort()
      if (typingInterval) {
        clearInterval(typingInterval)
      }
      if (startTypingPromise) {
        void startTypingPromise.then(() => conversationInstance.stopTyping().catch(() => {}))
      }
    }
  }
}
