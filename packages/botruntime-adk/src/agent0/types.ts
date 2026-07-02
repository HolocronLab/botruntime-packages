export const AGENT0_CONFIG_SCHEMA_VERSION = 1 as const

export type Agent0ConfigSchemaVersion = typeof AGENT0_CONFIG_SCHEMA_VERSION
export type Agent0ProviderId = string
export type Agent0ModelId = string
export type Agent0ProviderCatalogStatus = 'available' | 'planned'

export interface Agent0ProviderApiKeyAuth {
  type: 'api_key'
  apiKey: string
  baseURL?: string
}

export type Agent0ProviderAuth = Agent0ProviderApiKeyAuth

export interface Agent0ProviderConnection {
  providerId: Agent0ProviderId
  enabled: boolean
  auth?: Agent0ProviderAuth
  createdAt: string
  updatedAt: string
}

export interface Agent0ConfigPreferences {
  defaultModel?: Agent0ModelId
  showThinking: boolean
  showUsage: boolean
}

export interface Agent0Config {
  schemaVersion: Agent0ConfigSchemaVersion
  enabled: boolean
  providers: Record<Agent0ProviderId, Agent0ProviderConnection>
  preferences: Agent0ConfigPreferences
  createdAt: string
  updatedAt: string
}

export interface Agent0ProviderApiKeyAuthRedacted {
  type: 'api_key'
  configured: boolean
  baseURL?: string
}

export type Agent0ProviderAuthRedacted = Agent0ProviderApiKeyAuthRedacted

export interface Agent0ProviderConnectionRedacted extends Omit<Agent0ProviderConnection, 'auth'> {
  auth?: Agent0ProviderAuthRedacted
}

export interface Agent0ConfigRedacted extends Omit<Agent0Config, 'providers'> {
  providers: Record<Agent0ProviderId, Agent0ProviderConnectionRedacted>
}

export interface Agent0ProviderAuthNoneRequirement {
  type: 'none'
}

export interface Agent0ProviderAuthApiKeyRequirement {
  type: 'api_key'
  apiKeyLabel: string
  baseURL?: {
    label: string
    placeholder?: string
    defaultValue?: string
    required: boolean
  }
}

export interface Agent0ProviderAuthPlannedRequirement {
  type: 'planned'
  reason: string
}

export type Agent0ProviderAuthRequirement =
  | Agent0ProviderAuthNoneRequirement
  | Agent0ProviderAuthApiKeyRequirement
  | Agent0ProviderAuthPlannedRequirement

export interface Agent0ProviderModelSource {
  type: 'cognitive' | 'models.dev'
  providerId?: string
}

export interface Agent0CatalogModel {
  providerId: Agent0ProviderId
  modelId: Agent0ModelId
  name: string
  contextWindow?: number
  outputLimit?: number
  inputCostPer1MTokens?: number
  outputCostPer1MTokens?: number
  tags?: string[]
}

export interface Agent0ProviderCatalogEntry {
  id: Agent0ProviderId
  name: string
  displayName?: string
  description: string
  firstParty: boolean
  status: Agent0ProviderCatalogStatus
  enabledByDefault: boolean
  auth: Agent0ProviderAuthRequirement
  modelSource?: Agent0ProviderModelSource
}

export interface Agent0ProviderView {
  id: Agent0ProviderId
  name: string
  displayName?: string
  description: string
  firstParty: boolean
  status: Agent0ProviderCatalogStatus
  enabled: boolean
  connected: boolean
  auth: Agent0ProviderAuthRequirement
  connection?: Agent0ProviderConnectionRedacted
  modelCount: number
}

export interface Agent0AvailableModel {
  id: Agent0ModelId
  providerId: Agent0ProviderId
  providerName: string
  modelId: string
  name: string
  contextWindow?: number
  outputLimit?: number
  inputCostPer1MTokens?: number
  outputCostPer1MTokens?: number
  tags?: string[]
}

export type Agent0WarningCode = 'CATALOG_SOURCE_UNAVAILABLE' | 'CONFIG_UNAVAILABLE' | 'RUNTIME_RESTART_FAILED'

export interface Agent0Warning {
  code: Agent0WarningCode
  source: string
  message: string
}

export interface Agent0ProviderListResult {
  providers: Agent0ProviderView[]
  warnings: Agent0Warning[]
}

export interface Agent0ModelListResult {
  models: Agent0AvailableModel[]
  warnings: Agent0Warning[]
}

export interface Agent0SessionModelRef {
  providerId: Agent0ProviderId
  modelId: Agent0ModelId
  variant?: string
}

export const AGENT0_SESSION_MODES = ['default', 'guided'] as const

export type Agent0SessionMode = (typeof AGENT0_SESSION_MODES)[number]

export interface Agent0Session {
  id: string
  title: string
  projectPath: string
  path?: string
  parentId?: string
  mode?: Agent0SessionMode
  model?: Agent0SessionModelRef
  createdAt: string
  updatedAt: string
  archivedAt?: string
}

export interface Agent0CreateSessionInput {
  title?: string
  mode?: Agent0SessionMode
  model?: Agent0SessionModelRef
}

export interface Agent0SessionListResult {
  sessions: Agent0Session[]
  warnings: Agent0Warning[]
}

export interface Agent0CreateSessionResult {
  session: Agent0Session
  warnings: Agent0Warning[]
}

export type Agent0MessageRole = 'user' | 'assistant'
export type Agent0MessagePartStatus = 'pending' | 'running' | 'completed' | 'error'
export type Agent0MessagePartType =
  | 'agent'
  | 'compaction'
  | 'file'
  | 'patch'
  | 'reasoning'
  | 'retry'
  | 'snapshot'
  | 'step-finish'
  | 'step-start'
  | 'subtask'
  | 'text'
  | 'tool'

export interface Agent0MessageError {
  message: string
  name?: string
  code?: string
  status?: number
  /** Provider/transport context (statusCode, responseBody, …); large strings are truncated. */
  data?: Record<string, unknown>
}

export interface Agent0MessageUsage {
  inputTokens?: number
  outputTokens?: number
  reasoningTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
  totalTokens?: number
  estimatedCost?: number
}

export interface Agent0MessageAttachment {
  mime: string
  url: string
  filename?: string
}

export interface Agent0MessagePartTime {
  createdAt?: string
  startedAt?: string
  endedAt?: string
}

export interface Agent0MessagePartSource {
  type: 'file' | 'resource' | 'symbol'
  path?: string
  uri?: string
  name?: string
  text?: {
    value: string
    start: number
    end: number
  }
}

export interface Agent0ToolState {
  status: Agent0MessagePartStatus
  input?: unknown
  raw?: string
  title?: string
  output?: unknown
  attachments?: Agent0MessageAttachment[]
  error?: string
  metadata?: Record<string, unknown>
  time?: Agent0MessagePartTime
}

export interface Agent0MessagePart {
  id: string
  type: Agent0MessagePartType
  title?: string
  status?: Agent0MessagePartStatus
  text?: string
  reason?: string
  synthetic?: boolean
  ignored?: boolean
  metadata?: Record<string, unknown>
  toolId?: string
  callId?: string
  state?: Agent0ToolState
  input?: unknown
  output?: unknown
  attachments?: Agent0MessageAttachment[]
  filename?: string
  mime?: string
  url?: string
  source?: Agent0MessagePartSource
  hash?: string
  files?: string[]
  attempt?: number
  auto?: boolean
  overflow?: boolean
  tailStartId?: string
  name?: string
  description?: string
  prompt?: string
  agent?: string
  command?: string
  model?: Agent0SessionModelRef
  usage?: Agent0MessageUsage
  time?: Agent0MessagePartTime
  error?: Agent0MessageError
}

export type Agent0PromptPart =
  | {
      type: 'text'
      text: string
      synthetic?: boolean
    }
  | {
      type: 'file'
      mime: string
      url: string
      filename?: string
    }

export interface Agent0Message {
  id: string
  sessionId: string
  role: Agent0MessageRole
  createdAt: string
  completedAt?: string
  completed: boolean
  parentId?: string
  mode?: Agent0SessionMode
  model?: Agent0SessionModelRef
  parts: Agent0MessagePart[]
  usage?: Agent0MessageUsage
  error?: Agent0MessageError
}

export interface Agent0SendMessageInput {
  parts: Agent0PromptPart[]
  mode?: Agent0SessionMode
  model?: Agent0SessionModelRef
  generateReply?: boolean
}

export interface Agent0SessionMessageListResult {
  messages: Agent0Message[]
  warnings: Agent0Warning[]
}

export interface Agent0SendMessageResult {
  message: Agent0Message
  warnings: Agent0Warning[]
}

export interface Agent0AbortSessionResult {
  aborted: boolean
  warnings: Agent0Warning[]
}

export interface Agent0QuestionOption {
  label: string
  description?: string
}

export interface Agent0QuestionInfo {
  question: string
  header: string
  options: Agent0QuestionOption[]
  multiple?: boolean
  custom?: boolean
}

export interface Agent0QuestionToolRef {
  messageId: string
  callId: string
}

export interface Agent0QuestionRequest {
  id: string
  sessionId: string
  questions: Agent0QuestionInfo[]
  tool?: Agent0QuestionToolRef
}

export interface Agent0QuestionListResult {
  questions: Agent0QuestionRequest[]
  warnings: Agent0Warning[]
}

export interface Agent0ReplyQuestionInput {
  answers: string[][]
}

export interface Agent0ReplyQuestionResult {
  answered: boolean
  warnings: Agent0Warning[]
}

export interface Agent0RejectQuestionResult {
  rejected: boolean
  warnings: Agent0Warning[]
}

export interface Agent0Command {
  name: string
  description?: string
  hints: string[]
  subtask?: boolean
}

export interface Agent0CommandListResult {
  commands: Agent0Command[]
  warnings: Agent0Warning[]
}

export interface Agent0RunCommandInput {
  command: string
  arguments?: string
  mode?: Agent0SessionMode
  model?: Agent0SessionModelRef
}

export interface Agent0RunCommandResult {
  message: Agent0Message
  warnings: Agent0Warning[]
}

export type Agent0SessionStatus =
  | { type: 'idle' }
  | { type: 'busy' }
  | {
      type: 'retry'
      attempt: number
      message: string
      next: number
      action?: {
        reason: string
        provider: string
        title: string
        message: string
        label: string
        link?: string
      }
    }

export interface Agent0MessageInfo {
  id: string
  sessionId: string
  role: Agent0MessageRole
  createdAt: string
  completedAt?: string
  completed: boolean
  parentId?: string
  mode?: Agent0SessionMode
  model?: Agent0SessionModelRef
  usage?: Agent0MessageUsage
  error?: Agent0MessageError
}

export type Agent0RuntimeEvent =
  | {
      id?: string
      type: 'runtime.connected' | 'runtime.heartbeat'
    }
  | {
      id?: string
      type: 'session.status'
      sessionId: string
      status: Agent0SessionStatus
    }
  | {
      id?: string
      type: 'session.error'
      sessionId?: string
      error: Agent0MessageError
    }
  | {
      id?: string
      type: 'message.updated'
      message: Agent0MessageInfo
    }
  | {
      id?: string
      type: 'message.removed'
      sessionId: string
      messageId: string
    }
  | {
      id?: string
      type: 'message.part.updated'
      sessionId: string
      messageId: string
      part: Agent0MessagePart
      updatedAt?: string
    }
  | {
      id?: string
      type: 'message.part.delta'
      sessionId: string
      messageId: string
      partId: string
      field: string
      delta: string
    }
  | {
      id?: string
      type: 'message.part.removed'
      sessionId: string
      messageId: string
      partId: string
    }
  | {
      id?: string
      type: 'question.asked'
      question: Agent0QuestionRequest
    }
  | {
      id?: string
      type: 'question.replied'
      sessionId: string
      questionId: string
      answers: string[][]
    }
  | {
      id?: string
      type: 'question.rejected'
      sessionId: string
      questionId: string
    }

export interface Agent0RuntimeEventStreamOptions {
  sessionId?: string
  signal?: AbortSignal
}

export interface Agent0ProjectPaths {
  projectHash: string
  canonicalProjectPath: string
  rootDir: string
  xdgConfigHome: string
  xdgDataHome: string
  xdgCacheHome: string
  xdgStateHome: string
  fakeHomeDir: string
  engineBinDir: string
  engineConfigDir: string
  engineDataDir: string
  sessionsDir: string
}
