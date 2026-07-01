import { Autonomous } from './runtime/autonomous'
import { step as _workflowStep, type WorkflowStep } from './primitives/workflow-step'
import { context } from './runtime/index'
import pLimit from 'p-limit'

export { ChildWorkflowFailedError } from './primitives/workflow-step'

export { z } from '@holocronlab/botruntime-sdk'
export { Cognitive } from '@holocronlab/botruntime-cognitive'
export { Zai } from '@holocronlab/botruntime-zai'

export { context } from './runtime/index'
export { client } from './runtime/client'
export { analytics, trackAnalytics } from './runtime/analytics'
export type { TrackAnalyticsInput, TrackAnalyticsResponse } from './runtime/analytics'

// Export well-known constants for data sources and knowledge bases
export { WellKnownTags, WellKnownMetadata } from './constants'

export {
  Action,
  Knowledge,
  Conversation,
  CustomComponent,
  Trigger,
  Table,
  Workflow,
  Primitives,
  DataSource,
  BaseConversationInstance,
  UserInstance as User,
  Reference,
} from './primitives'
export type { Asset, AssetsGlobal } from './primitives'

export { Chat } from './runtime/chat'

export { isWorkflowDataRequest } from './primitives/workflow-utils'
export { isWorkflowCallback, isWorkflowNotify, isEventOfType } from './utilities/events'
export type { TypedEvent } from './utilities/events'
export type {
  WorkflowCallbackEventType,
  WorkflowCallbackPayload,
  WorkflowNotifyEventType,
  WorkflowNotifyPayload,
} from './runtime/events'

export { Autonomous } from './runtime/autonomous'

// Export Model type for use in agent.config.ts
export type Model = Autonomous.Model

export * from './types'
export * from './errors'
export { extractMissingRequiredFields } from './utilities/missing-fields'

export { actions } from './runtime/actions'
export { plugins } from './runtime/plugins'
export { bot, user } from './runtime/state'
export { configuration } from './runtime/configuration'
export { secrets } from './runtime/secrets'

export { defineConfig } from './define-config'
export type { AgentConfig, EventDefinition } from './define-config'

export { adk } from './runtime/adk'
export type { ADK, Project, Integration } from './runtime/adk'

// Export generated type definitions
export type { ConversationDefinitions } from './_types/conversations'
export type { WorkflowDefinitions } from './_types/workflows'
export type { Triggers } from './_types/triggers'
export type { Events, EventName, EventPayload } from './_types/events'
export type { Channels, ChannelSpec } from './_types/channels'
export type { Integrations } from './_types/integrations'
export type { Plugins } from './_types/plugins'
export type { Dependencies } from './_types/dependencies'

/**
 * Workflow step function that works both inside and outside workflows.
 *
 * **Inside a workflow**: Provides automatic retry logic, state persistence, and resumability.
 * Steps are idempotent — if already executed, the cached result is returned immediately.
 *
 * **Outside a workflow**: Simply executes the function directly (no caching or retry).
 *
 * @example
 * ```typescript
 * import { step } from '@holocronlab/botruntime-runtime'
 *
 * // Works in both workflow and non-workflow contexts
 * const data = await step("fetch-user", async () => {
 *   return await fetchUser(userId)
 * })
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pass-through wrapper with runtime type checks
export const step: WorkflowStep = ((name: string, run: any, options?: any) => {
  if (typeof name !== 'string') {
    throw new TypeError(
      `step() expects a string as the first argument (step name), got ${typeof name}. Usage: step("my-step", async () => { ... })`
    )
  }
  if (typeof run !== 'function') {
    console.error(`[step] "${name}" called with run=${typeof run} (expected function). Args:`, { name, run, options })
    throw new TypeError(`step("${name}") expects a function as the second argument, got ${typeof run}`)
  }
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) {
    return run({ attempt: 1 })
  }
  return _workflowStep(name, run, options)
}) as WorkflowStep

// Outside a workflow, sub-methods are noops
step.listen = async (name: string) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) return
  return _workflowStep.listen(name)
}

step.fail = async (reason: string) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) return
  return _workflowStep.fail(reason)
}

step.progress = async (name: string) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) return
  return _workflowStep.progress(name)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pass-through wrapper
step.notify = async (notification: string, payload: any, stepName?: string) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) return
  return _workflowStep.notify(notification, payload, stepName)
}

step.abort = () => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) return
  return _workflowStep.abort()
}

step.sleep = async (name: string, ms: number) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) {
    await new Promise((resolve) => setTimeout(resolve, ms))
    return
  }
  return _workflowStep.sleep(name, ms)
}

step.sleepUntil = async (name: string, date: Date | string) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) {
    const ms = Math.max(0, new Date(date).getTime() - Date.now())
    await new Promise((resolve) => setTimeout(resolve, ms))
    return
  }
  return _workflowStep.sleepUntil(name, date)
}

step.waitForWorkflow = async (name: string, workflowId: string) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) {
    throw new Error('step.waitForWorkflow is only available inside a workflow')
  }
  return _workflowStep.waitForWorkflow(name, workflowId)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pass-through wrapper
step.executeWorkflow = async (name: string, workflow: any, input?: any) => {
  const wf = context.get('workflow', { optional: true })
  if (!wf) {
    throw new Error('step.executeWorkflow is only available inside a workflow')
  }
  return _workflowStep.executeWorkflow(name, workflow, input)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- pass-through wrapper with runtime type checks
step.map = async (name: string, items: any[], fn: any, options?: any) => {
  const workflow = context.get('workflow', { optional: true })
  if (!workflow) {
    const concurrency = options?.concurrency ?? Infinity
    const limit = pLimit(concurrency)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- pass-through wrapper
    return Promise.all(items.map((item: any, i: number) => limit(() => fn(item, i))))
  }
  return _workflowStep.map(name, items, fn, options)
}
