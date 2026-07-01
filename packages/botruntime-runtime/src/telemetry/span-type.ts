/**
 * Custom Span type — the clean, explicitly-mapped structure
 * that replaces raw OTEL span records for storage and API responses.
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

/**
 * Context field names — the set of well-known attributes
 * that get promoted to top-level `context` columns in SQLite.
 */
export const CONTEXT_FIELDS = [
  'botId',
  'conversationId',
  'userId',
  'messageId',
  'workflowId',
  'eventId',
  'integration',
  'channel',
] as const

export type ContextFieldName = (typeof CONTEXT_FIELDS)[number]
