import { z } from '@holocronlab/botruntime-sdk'

type EventDefinition<T extends string = string> = {
  name: T
  description?: string
  schema: z.ZodSchema
}

export const WorkflowCallbackEvent = {
  name: 'workflowCallback' as const,
  schema: z.object({
    workflow: z.string(),
    workflowId: z.string(),
    target: z.union([
      z.object({
        conversationId: z.string(),
      }),
      z.object({
        workflowId: z.string(),
      }),
    ]),
    status: z.enum(['completed', 'failed', 'canceled', 'timed_out']),
    output: z.any().optional(),
    error: z.string().optional(),
  }),
} satisfies EventDefinition

export const WorkflowScheduleEvent = {
  name: 'workflowSchedule' as const,
  schema: z.object({
    workflow: z.string(),
  }),
} satisfies EventDefinition

export const WorkflowContinueEvent = {
  name: 'workflowContinue' as const,
  schema: z.object({}),
}

export const SubworkflowFinished = {
  name: 'subworkflowFinished' as const,
  schema: z.object({}),
}

export const WorkflowDataRequestEvent = {
  name: 'workflowDataRequest' as const,
  schema: z.object({
    workflowId: z.string(),
    workflowName: z.string(),
    stepName: z.string(),
    request: z.string(),
    message: z.string(),
    schema: z.any(), // JSON Schema
  }),
} satisfies EventDefinition

export const WorkflowNotifyEvent = {
  name: 'workflowNotify' as const,
  schema: z.object({
    workflowId: z.string(),
    workflowName: z.string(),
    stepName: z.string(),
    notification: z.string(),
    payload: z.any(),
  }),
} satisfies EventDefinition

// Lifecycle state schema - stored in __lifecycle namespace, survives user state resets

export const LifecycleStateSchema = z.object({
  sessionId: z.string(),
  sessionNumber: z.number(),
  status: z.enum(['active', 'expired']),
  startedAt: z.string(),
  lastActivityAt: z.string(),
  nudgeCount: z.number(),
  scheduledNudgeEventId: z.string().optional(),
  scheduledExpireEventId: z.string().optional(),
})

export type LifecycleState = z.infer<typeof LifecycleStateSchema>

// Lifecycle events - nudge and expiration for conversation lifecycle management

export const LifecycleNudgeEvent = {
  name: 'lifecycleNudge' as const,
  schema: z.object({
    conversationId: z.string(),
    sessionId: z.string(),
    scheduledAt: z.string(),
  }),
} satisfies EventDefinition

export const LifecycleExpireEvent = {
  name: 'lifecycleExpire' as const,
  schema: z.object({
    conversationId: z.string(),
    sessionId: z.string(),
    scheduledAt: z.string(),
  }),
} satisfies EventDefinition

// Type utilities for lifecycle events
export type LifecycleNudgePayload = z.infer<typeof LifecycleNudgeEvent.schema>
export type LifecycleExpirePayload = z.infer<typeof LifecycleExpireEvent.schema>

/**
 * Typed lifecycleNudge event that fires when a user has been silent
 * for the configured nudge delay.
 */
export type LifecycleNudgeEventType = {
  id: string
  type: 'lifecycleNudge'
  payload: LifecycleNudgePayload
  createdAt: string
  conversationId?: string
  status?: 'pending' | 'processed'
}

/**
 * Typed lifecycleExpire event that fires when a conversation has been
 * idle for the configured expiration timeout.
 */
export type LifecycleExpireEventType = {
  id: string
  type: 'lifecycleExpire'
  payload: LifecycleExpirePayload
  createdAt: string
  conversationId?: string
  status?: 'pending' | 'processed'
}

// Type utilities for workflowCallback
export type WorkflowCallbackPayload = z.infer<typeof WorkflowCallbackEvent.schema>

/**
 * Typed workflowCallback event that can be received in conversation handlers
 */
export type WorkflowCallbackEventType = {
  id: string
  type: 'workflowCallback'
  payload: WorkflowCallbackPayload
  createdAt: string
  conversationId?: string
  status?: 'pending' | 'processed'
}

// Type utilities for workflowDataRequest
export type WorkflowDataRequestPayload = z.infer<typeof WorkflowDataRequestEvent.schema>

/**
 * Typed workflowDataRequest event that can be received in conversation handlers
 * when the handler type is 'workflow_request'
 */
export type WorkflowDataRequestEventType = {
  id: string
  type: 'workflowDataRequest'
  payload: WorkflowDataRequestPayload
  createdAt: string
  conversationId?: string
  status?: 'pending' | 'processed'
}

// Type utilities for workflowNotify
export type WorkflowNotifyPayload = z.infer<typeof WorkflowNotifyEvent.schema>

/**
 * Typed workflowNotify event that can be received in conversation handlers
 * when the handler type is 'workflow_notify'
 */
export type WorkflowNotifyEventType = {
  id: string
  type: 'workflowNotify'
  payload: WorkflowNotifyPayload
  createdAt: string
  conversationId?: string
  status?: 'pending' | 'processed'
}
