/**
 * Public trace shape consumed by the eval runner.
 *
 * This mirrors the brt dev server's local trace stream contract without requiring
 * evals to import `@holocronlab/botruntime-runtime/internal`.
 */
export interface SpanId {
  trace: string
  span: string
  parent: string | null
}

export type SpanStatus = 'ok' | 'error' | 'running'

export interface SpanTiming {
  startedAt: number
  endedAt?: number
  duration?: number
}

export interface SpanContext {
  botId?: string
  conversationId?: string
  userId?: string
  messageId?: string
  workflowId?: string
  eventId?: string
  integration?: string
  channel?: string
}

export interface SpanResource {
  environment: 'development' | 'production'
  platform?: string
  arch?: string
  nodeVersion?: string
  uptime?: number
  versions: {
    adk?: string
    runtime?: string
    sdk?: string
    llmz?: string
    zai?: string
    cognitive?: string
  }
}

export type SpanTier = 'concise' | 'standard' | 'verbose'

/**
 * Privacy-safe metadata returned by the Vortex trace reader.
 *
 * The cloud contract is intentionally closed: adding an arbitrary record here
 * would let prompts, messages, tool I/O, or raw errors cross the trace storage
 * boundary. Property names are camelCase on the wire; VortexSpanSource maps
 * them to the dotted names used by the in-process span consumers.
 */
export interface TraceMetadata {
  endpoint?: '/v2/cognitive/generate-text' | '/v1/chat/actions'
  actionType?: 'generateText' | 'generateContent'
  aiRequestedModel?: string
  aiModel?: string
  aiProvider?: string
  aiStopReason?: 'stop' | 'max_tokens' | 'tool_calls' | 'content_filter' | 'other'
  aiMessagesCount?: number
  aiInputLength?: number
  aiInputTokens?: number
  aiOutputTokens?: number
  aiCost?: number
  aiLatencyMs?: number
  integration?: string
  channel?: string
  aiPromptSource?: string
  aiPromptCategory?: string
  autonomousIteration?: number
  autonomousStatus?:
    | 'pending'
    | 'generation_error'
    | 'execution_error'
    | 'invalid_code_error'
    | 'thinking_requested'
    | 'callback_requested'
    | 'exit_success'
    | 'exit_error'
    | 'aborted'
  autonomousToolName?: string
  autonomousToolObject?: string
  autonomousToolStatus?: 'think' | 'success' | 'error'
  workflowName?: string
  httpStatusCode?: number
  payloadsOmittedCount?: number
  errorKind?: 'disabled' | 'payment_required' | 'rate_limited' | 'timeout' | 'upstream' | 'internal'
}

export interface Span {
  id: SpanId
  name: string
  label: string
  status: SpanStatus
  error?: string
  timing: SpanTiming
  context: SpanContext
  tier: SpanTier
  data: unknown
  resource: SpanResource
}
