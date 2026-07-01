import { Event, Message } from '@holocronlab/botruntime-client'
import { WorkflowCallbackEventType, WorkflowNotifyEventType } from '../runtime/events'
import type { EventName, EventPayload } from '../_types/events'

type EventType = 'message_created' | 'workflow_update' | (string & {})

/**
 * Type for a typed event with a specific event name and corresponding payload.
 * This is used as the return type for isEventOfType type guard.
 */
export type TypedEvent<T extends EventName> = Event & {
  type: T
  payload: EventPayload<T>
}

export function isEvent(event: unknown): event is Event {
  return event !== null && typeof event === 'object' && 'type' in event && 'payload' in event && 'id' in event
}

export function isEventMessage(
  event: Event
): event is Event & { type: 'message_created'; payload: { message: Message } } {
  const type = (event as { type?: EventType })?.type || null

  if (type === 'message_created' && event.payload && typeof event.payload.message === 'object') {
    return true
  }

  return false
}

/**
 * @deprecated Use the `type === "workflow_callback"` guard in the conversation handler instead. This sets the type of the event property while also adding additional context.
 * @example
 * if (type === "workflow_callback") {
 *  console.log(completion.workflow.status)
 * }
 *
 * @description
 * Type guard to check if an event is a workflow completion.
 * Use this in conversation handlers to detect when a workflow has completed execution.
 * @param event - The event to check
 * @returns True if the event is a WorkflowCallback
 * @example
 * if (isWorkflowCallback(event)) {
 *   console.log(MyWorkflow.status === "completed");
 * }
 */
export function isWorkflowCallback(event: unknown): event is WorkflowCallbackEventType {
  return (
    event !== null &&
    typeof event === 'object' &&
    'type' in event &&
    event.type === 'workflowCallback' &&
    'payload' in event &&
    event.payload !== null &&
    typeof event.payload === 'object'
  )
}

/**
 * Type guard to check if an event is a workflow notification.
 * Use this for consumers that need to inspect workflow progress events
 * outside the conversation handler discriminated union.
 */
export function isWorkflowNotify(event: unknown): event is WorkflowNotifyEventType {
  return (
    event !== null &&
    typeof event === 'object' &&
    'type' in event &&
    event.type === 'workflowNotify' &&
    'payload' in event &&
    event.payload !== null &&
    typeof event.payload === 'object'
  )
}

export function isMessage(message: unknown): message is Message {
  return message !== null && typeof message === 'object' && 'id' in message && 'type' in message && 'payload' in message
}

/**
 * Type guard to check if an event matches a specific event type.
 * Works with both custom events and integration events.
 *
 * @example
 * // Custom event
 * if (isEventOfType(event, 'orderPlaced')) {
 *   // event.payload is typed as the orderPlaced schema
 *   console.log(event.payload.orderId)
 * }
 *
 * @example
 * // Integration event
 * if (isEventOfType(event, 'slack:reactionAdded')) {
 *   // event.payload is typed as the slack reactionAdded event payload
 *   console.log(event.payload.reaction)
 * }
 */
export function isEventOfType<T extends EventName>(event: unknown, eventName: T): event is TypedEvent<T> {
  return isEvent(event) && event.type === eventName
}
