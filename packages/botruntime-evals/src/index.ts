/**
 * Eval authoring API used by brt and runtime workflows.
 *
 * Runtime-heavy execution pieces are available from subpaths such as
 * `@holocronlab/botruntime-evals/runner`, `@holocronlab/botruntime-evals/loader`, and
 * `@holocronlab/botruntime-evals/graders`.
 */
export { Eval } from './definition'
export type {
  BotConnection,
  ConversationTurn,
  ChatClient,
  EvalDefinition,
  EvalControl,
  DurableEvalEffects,
  EvalFilter,
  EvalLogger,
  EvalProgressEvent,
  EvalReport,
  EvalRunReport,
  EvalRunnerConfig,
  EvalSetup,
  EvalFixtureSource,
  ConversationRelationSelector,
  GraderResult,
  MatchOperator,
  NumericOperator,
  OutcomeAssertions,
  EvalTableSeed,
  TableAssertion,
  ResponseAssertion,
  Span,
  SpanStatus,
  TraceMetadata,
  StateAssertion,
  StateMutation,
  TimingAssertion,
  ToolAssertion,
  ToolCall,
  TurnAssertions,
  TurnData,
  TurnReport,
  SpanSource,
  WaitOptions,
  WorkflowAssertion,
  WorkflowSpan,
  WorkflowWaitOptions,
} from './types'
export { EVAL_MANIFEST_TAGS, EVAL_MANIFEST_SCHEMA_VERSION } from './manifest'
export { DurableEvalEffectRetryError } from './errors'
export type { EvalFixtureManifestEntry, EvalManifest } from './manifest'
export { buildAttachmentPayload, fixtureReportLabel } from './attachments'
export type { EvalAttachment, ResolvedEvalFixture } from './attachments'
export { createNativeEvalChatClient } from './native-chat-client'
