/**
 * Bot definition exports - minimal, side-effect free exports for bot.definition.ts files
 *
 * This module provides only the schemas and types needed for bot definitions,
 * without importing any heavy dependencies or causing side effects.
 */

export { TranscriptSchema } from './runtime/chat/transcript'
export { TrackedStateSchema } from './runtime/tracked-state-schema'
export { BUILT_IN_STATES } from './runtime/tracked-state'
export { BUILT_IN_TAGS } from './runtime/tracked-tags'
export {
  WorkflowCallbackEvent,
  WorkflowScheduleEvent,
  WorkflowContinueEvent,
  SubworkflowFinished,
  WorkflowDataRequestEvent,
  WorkflowNotifyEvent,
  LifecycleNudgeEvent,
  LifecycleExpireEvent,
} from './runtime/events'
export { validateSecretName } from './utilities/validate-secret-name'
