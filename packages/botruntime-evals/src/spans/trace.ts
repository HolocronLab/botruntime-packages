/**
 * Public trace shape consumed by the eval runner.
 *
 * This mirrors the ADK dev server's trace stream contract without requiring
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
