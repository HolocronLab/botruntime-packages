import type {
  Agent0CatalogModel,
  Agent0AbortSessionResult,
  Agent0CommandListResult,
  Agent0Config,
  Agent0CreateSessionInput,
  Agent0Message,
  Agent0QuestionListResult,
  Agent0RejectQuestionResult,
  Agent0ReplyQuestionInput,
  Agent0ReplyQuestionResult,
  Agent0RunCommandInput,
  Agent0RuntimeEvent,
  Agent0RuntimeEventStreamOptions,
  Agent0ProjectPaths,
  Agent0SendMessageInput,
  Agent0Session,
  Agent0SessionMessageListResult,
  Agent0SessionListResult,
  Agent0Warning,
} from '../types.js'
import { AdkError } from '@holocronlab/botruntime-analytics'
import { Agent0ConfigStore } from '../config/store.js'
import { ensureAgent0ProjectDirs } from '../config/paths.js'
import { startAgent0RuntimeClient, type Agent0RuntimeClient, type Agent0RuntimeStatus } from './client.js'

export type Agent0RuntimeManagerState = 'stopped' | 'starting' | 'running' | 'restarting' | 'stopping' | 'unavailable'

export type Agent0RuntimeManagerErrorCode = 'RUNTIME_NOT_RUNNING' | 'RUNTIME_START_FAILED'

export interface Agent0RuntimeManagerConfigStore {
  read(): Promise<Agent0Config>
}

export interface Agent0RuntimeManagerCatalogSource {
  listModelsWithStatus(): Promise<{ models: Agent0CatalogModel[]; warnings: Agent0Warning[] }>
}

export type Agent0RuntimeManagerProjectDirsResolver = (agentPath: string) => Promise<Agent0ProjectPaths>

export type Agent0RuntimeManagerStarter = (options: {
  paths: Agent0ProjectPaths
  agentPath: string
  adkDevConsolePort: number
  agent0Config: Agent0Config
  cognitiveModels?: Agent0CatalogModel[]
  startupTimeoutMs?: number
  onLog?: (message: string) => void
}) => Promise<Agent0RuntimeClient>

export interface Agent0RuntimeManagerOptions {
  agentPath: string
  adkDevConsolePort: number
  startupTimeoutMs?: number
  onLog?: (message: string) => void
  configStore?: Agent0RuntimeManagerConfigStore
  resolveProjectDirs?: Agent0RuntimeManagerProjectDirsResolver
  cognitiveSource?: Agent0RuntimeManagerCatalogSource
  startRuntimeClient?: Agent0RuntimeManagerStarter
}

export interface Agent0RuntimeManagerSnapshot {
  state: Agent0RuntimeManagerState
  engineGeneration: number
  configVersion?: string
  warnings: Agent0Warning[]
  error?: string
}

export class Agent0RuntimeManagerError extends AdkError<Agent0RuntimeManagerErrorCode> {
  constructor(code: Agent0RuntimeManagerErrorCode, message: string, options: { cause?: unknown } = {}) {
    super({
      code,
      message,
      // Calling into a stopped runtime is an expected call-order condition;
      // a runtime that fails to start is a problem we want surfaced loudly.
      expected: code === 'RUNTIME_NOT_RUNNING',
      cause: options.cause,
    })
  }
}

export class Agent0RuntimeManager implements Agent0RuntimeClient {
  private readonly options: Required<
    Pick<Agent0RuntimeManagerOptions, 'configStore' | 'resolveProjectDirs' | 'startRuntimeClient'>
  > &
    Omit<Agent0RuntimeManagerOptions, 'configStore' | 'resolveProjectDirs' | 'startRuntimeClient'>
  private state: Agent0RuntimeManagerState = 'stopped'
  private client: Agent0RuntimeClient | undefined
  private operation = Promise.resolve()
  private engineGeneration = 0
  private configVersion: string | undefined
  private warnings: Agent0Warning[] = []
  private lastError: unknown

  constructor(options: Agent0RuntimeManagerOptions) {
    this.options = {
      ...options,
      configStore: options.configStore ?? new Agent0ConfigStore(),
      resolveProjectDirs: options.resolveProjectDirs ?? ensureAgent0ProjectDirs,
      startRuntimeClient: options.startRuntimeClient ?? startAgent0RuntimeClient,
    }
  }

  async start(): Promise<Agent0RuntimeClient> {
    return this.enqueue(async () => {
      if (this.client) return this
      await this.startUnlocked('starting')
      return this
    })
  }

  async restart(): Promise<Agent0RuntimeClient> {
    return this.enqueue(async () => {
      await this.stopUnlocked('restarting')
      await this.startUnlocked('restarting')
      return this
    })
  }

  async invalidate(): Promise<void> {
    await this.enqueue(async () => {
      if (this.state === 'stopped') return
      await this.stopUnlocked('restarting')
      await this.startUnlocked('restarting')
    })
  }

  async stop(): Promise<void> {
    await this.enqueue(async () => {
      await this.stopUnlocked('stopping')
    })
  }

  async getStatus(): Promise<Agent0RuntimeStatus> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.getStatus()
  }

  async listSessions(): Promise<Agent0SessionListResult> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.listSessions()
  }

  async createSession(input?: Agent0CreateSessionInput): Promise<Agent0Session> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.createSession(input)
  }

  async listMessages(sessionId: string): Promise<Agent0SessionMessageListResult> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.listMessages(sessionId)
  }

  async sendMessage(sessionId: string, input: Agent0SendMessageInput): Promise<Agent0Message> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.sendMessage(sessionId, input)
  }

  async abortSession(sessionId: string): Promise<Agent0AbortSessionResult> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.abortSession(sessionId)
  }

  async listQuestions(sessionId?: string): Promise<Agent0QuestionListResult> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.listQuestions(sessionId)
  }

  async replyQuestion(
    sessionId: string,
    questionId: string,
    input: Agent0ReplyQuestionInput
  ): Promise<Agent0ReplyQuestionResult> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.replyQuestion(sessionId, questionId, input)
  }

  async rejectQuestion(sessionId: string, questionId: string): Promise<Agent0RejectQuestionResult> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.rejectQuestion(sessionId, questionId)
  }

  async listCommands(): Promise<Agent0CommandListResult> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.listCommands()
  }

  async runCommand(sessionId: string, input: Agent0RunCommandInput): Promise<Agent0Message> {
    const client = this.client
    if (!client) {
      throw this.toNotRunningError()
    }
    return client.runCommand(sessionId, input)
  }

  streamEvents(options?: Agent0RuntimeEventStreamOptions): AsyncIterable<Agent0RuntimeEvent> {
    const client = this.client
    if (!client?.streamEvents) {
      throw this.toNotRunningError()
    }
    return client.streamEvents(options)
  }

  getSnapshot(): Agent0RuntimeManagerSnapshot {
    return {
      state: this.state,
      engineGeneration: this.engineGeneration,
      configVersion: this.configVersion,
      warnings: this.cloneWarnings(),
      ...(this.lastError ? { error: stringifyError(this.lastError) } : {}),
    }
  }

  private async startUnlocked(state: Extract<Agent0RuntimeManagerState, 'starting' | 'restarting'>): Promise<void> {
    this.state = state
    this.lastError = undefined

    try {
      const [paths, agent0Config, cognitiveModelResult] = await Promise.all([
        this.options.resolveProjectDirs(this.options.agentPath),
        this.options.configStore.read(),
        this.resolveCognitiveModels(),
      ])

      const client = await this.options.startRuntimeClient({
        paths,
        agentPath: this.options.agentPath,
        adkDevConsolePort: this.options.adkDevConsolePort,
        agent0Config,
        cognitiveModels: cognitiveModelResult.models.length > 0 ? cognitiveModelResult.models : undefined,
        startupTimeoutMs: this.options.startupTimeoutMs,
        onLog: this.options.onLog,
      })

      this.client = client
      this.engineGeneration += 1
      this.configVersion = agent0Config.updatedAt
      this.warnings = cognitiveModelResult.warnings
      this.state = 'running'
    } catch (error) {
      this.client = undefined
      this.lastError = error
      this.state = 'unavailable'
      throw new Agent0RuntimeManagerError(
        'RUNTIME_START_FAILED',
        `Agent(0) runtime failed to start: ${stringifyError(error)}`,
        { cause: error }
      )
    }
  }

  private async stopUnlocked(state: Extract<Agent0RuntimeManagerState, 'stopping' | 'restarting'>): Promise<void> {
    const client = this.client
    this.client = undefined
    this.state = state
    try {
      await client?.stop()
    } finally {
      this.state = 'stopped'
    }
  }

  private async resolveCognitiveModels(): Promise<{ models: Agent0CatalogModel[]; warnings: Agent0Warning[] }> {
    const source = this.options.cognitiveSource
    if (!source) return { models: [], warnings: [] }

    const result = await source.listModelsWithStatus()
    for (const warning of result.warnings) {
      this.options.onLog?.(`${warning.source}: ${warning.message}`)
    }
    return {
      models: result.models,
      warnings: result.warnings,
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.operation.then(operation, operation)
    this.operation = next.then(
      () => undefined,
      () => undefined
    )
    return next
  }

  private toNotRunningError(): Agent0RuntimeManagerError {
    if (this.state === 'unavailable' && this.lastError) {
      return new Agent0RuntimeManagerError('RUNTIME_NOT_RUNNING', 'Agent(0) runtime is unavailable', {
        cause: this.lastError,
      })
    }
    return new Agent0RuntimeManagerError('RUNTIME_NOT_RUNNING', 'Agent(0) runtime is not running')
  }

  private cloneWarnings(): Agent0Warning[] {
    return this.warnings.map((warning) => ({ ...warning }))
  }
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
