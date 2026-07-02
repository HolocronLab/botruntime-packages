import { AdkError } from '@holocronlab/botruntime-analytics'
import type { Agent0OpenCodeProcess, Agent0OpenCodeProcessOptions } from './process.js'
import { startAgent0OpenCodeProcess } from './process.js'
import { loadAgent0BuiltInCommandConfig, resolveAgent0ProjectPlaybooksRoot } from '../capabilities/builtins.js'
import type {
  Agent0AbortSessionResult,
  Agent0Command,
  Agent0CommandListResult,
  Agent0CreateSessionInput,
  Agent0Message,
  Agent0MessageError,
  Agent0MessageInfo,
  Agent0MessageAttachment,
  Agent0MessagePart,
  Agent0MessagePartSource,
  Agent0MessagePartStatus,
  Agent0MessageUsage,
  Agent0PromptPart,
  Agent0QuestionInfo,
  Agent0QuestionListResult,
  Agent0QuestionRequest,
  Agent0RejectQuestionResult,
  Agent0ReplyQuestionInput,
  Agent0ReplyQuestionResult,
  Agent0RunCommandInput,
  Agent0RuntimeEvent,
  Agent0RuntimeEventStreamOptions,
  Agent0SendMessageInput,
  Agent0Session,
  Agent0SessionMessageListResult,
  Agent0SessionMode,
  Agent0SessionModelRef,
  Agent0SessionListResult,
  Agent0SessionStatus,
} from '../types.js'

export type Agent0RuntimeState = 'running'
export type Agent0RuntimeClientErrorCode = 'ENGINE_UNAVAILABLE' | 'ENGINE_HTTP_ERROR' | 'ENGINE_INVALID_RESPONSE'
export type Agent0RuntimeFetch = (input: URL, init?: RequestInit) => Promise<Response>

export interface Agent0RuntimeStatus {
  state: Agent0RuntimeState
  projectPath: string
  worktreePath: string
  renderedOpenCodeConfigHash?: string
}

export interface Agent0RuntimeClient {
  getStatus(): Promise<Agent0RuntimeStatus>
  listSessions(): Promise<Agent0SessionListResult>
  createSession(input?: Agent0CreateSessionInput): Promise<Agent0Session>
  listMessages(sessionId: string): Promise<Agent0SessionMessageListResult>
  sendMessage(sessionId: string, input: Agent0SendMessageInput): Promise<Agent0Message>
  abortSession(sessionId: string): Promise<Agent0AbortSessionResult>
  listQuestions(sessionId?: string): Promise<Agent0QuestionListResult>
  replyQuestion(
    sessionId: string,
    questionId: string,
    input: Agent0ReplyQuestionInput
  ): Promise<Agent0ReplyQuestionResult>
  rejectQuestion(sessionId: string, questionId: string): Promise<Agent0RejectQuestionResult>
  listCommands(): Promise<Agent0CommandListResult>
  runCommand(sessionId: string, input: Agent0RunCommandInput): Promise<Agent0Message>
  streamEvents?(options?: Agent0RuntimeEventStreamOptions): AsyncIterable<Agent0RuntimeEvent>
  stop(): Promise<void>
}

export interface Agent0RuntimeClientOptions extends Agent0OpenCodeProcessOptions {
  fetch?: Agent0RuntimeFetch
}

export interface Agent0RuntimeClientEngine {
  baseURL: string
  authHeaders: Record<string, string>
  renderedOpenCodeConfigHash?: string
  stop: () => Promise<void>
}

export interface Agent0RuntimeClientCreateOptions {
  engine: Agent0RuntimeClientEngine
  projectPath: string
  fetch?: Agent0RuntimeFetch
}

export class Agent0RuntimeClientError extends AdkError<Agent0RuntimeClientErrorCode> {
  readonly status?: number

  constructor(code: Agent0RuntimeClientErrorCode, message: string, options: { cause?: unknown; status?: number } = {}) {
    super({
      code,
      message,
      // An unreachable engine is an environment condition; HTTP errors and
      // malformed responses are protocol bugs we want surfaced loudly.
      expected: code === 'ENGINE_UNAVAILABLE',
      cause: options.cause,
      details: options.status !== undefined ? { status: options.status } : undefined,
    })
    this.status = options.status
  }
}

export async function startAgent0RuntimeClient(options: Agent0RuntimeClientOptions): Promise<Agent0RuntimeClient> {
  const { fetch: fetchImpl, ...processOptions } = options
  const engine = await startAgent0OpenCodeProcess(processOptions)
  return createAgent0RuntimeClient({
    engine,
    projectPath: options.paths.canonicalProjectPath,
    fetch: fetchImpl,
  })
}

export function createAgent0RuntimeClient(options: Agent0RuntimeClientCreateOptions): Agent0RuntimeClient {
  const fetchImpl = options.fetch ?? ((url, init) => fetch(url, init))

  return {
    async getStatus() {
      const pathInfo = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: '/path',
        searchParams: { directory: options.projectPath },
      })
      return normalizeAgent0RuntimeStatus(pathInfo, options.projectPath, options.engine.renderedOpenCodeConfigHash)
    },
    async listSessions() {
      const sessions = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: '/session',
        searchParams: { directory: options.projectPath, roots: 'true' },
      })
      if (!Array.isArray(sessions)) {
        throw new Agent0RuntimeClientError(
          'ENGINE_INVALID_RESPONSE',
          'Agent(0) private runtime returned an invalid session list response'
        )
      }
      return {
        sessions: sessions.map((session) => normalizeAgent0Session(session, options.projectPath)),
        warnings: [],
      }
    },
    async createSession(input = {}) {
      const session = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: '/session',
        method: 'POST',
        searchParams: { directory: options.projectPath },
        body: toOpenCodeCreateSessionInput(input),
      })
      return normalizeAgent0Session(session, options.projectPath)
    },
    async listMessages(sessionId) {
      const messages = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: `/session/${encodeURIComponent(sessionId)}/message`,
        searchParams: { directory: options.projectPath },
      })
      if (!Array.isArray(messages)) {
        throw new Agent0RuntimeClientError(
          'ENGINE_INVALID_RESPONSE',
          'Agent(0) private runtime returned an invalid message list response'
        )
      }
      return {
        messages: messages.map(normalizeAgent0Message),
        warnings: [],
      }
    },
    async sendMessage(sessionId, input) {
      const send = async () => {
        const message = await fetchAgent0OpenCodeJson({
          engine: options.engine,
          fetch: fetchImpl,
          path: `/session/${encodeURIComponent(sessionId)}/message`,
          method: 'POST',
          searchParams: { directory: options.projectPath },
          body: toOpenCodePromptInput(input),
        })
        return normalizeAgent0Message(message)
      }

      let message = await send()
      // Providers occasionally complete a turn with zero output. OpenCode has no
      // regenerate endpoint, so retry by re-sending the same prompt on the session.
      for (
        let retry = 0;
        retry < EMPTY_COMPLETION_MAX_RETRIES && input.generateReply !== false && isEmptyCompletion(message);
        retry++
      ) {
        await new Promise((resolve) => setTimeout(resolve, EMPTY_COMPLETION_RETRY_DELAY_MS))
        message = await send()
      }
      return message
    },
    async abortSession(sessionId) {
      const result = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: `/session/${encodeURIComponent(sessionId)}/abort`,
        method: 'POST',
        searchParams: { directory: options.projectPath },
      })
      if (typeof result !== 'boolean') {
        throw new Agent0RuntimeClientError(
          'ENGINE_INVALID_RESPONSE',
          'Agent(0) private runtime returned an invalid abort response'
        )
      }
      return { aborted: result, warnings: [] }
    },
    async listQuestions(sessionId) {
      const questions = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: '/question',
        searchParams: { directory: options.projectPath },
      })
      if (!Array.isArray(questions)) {
        throw new Agent0RuntimeClientError(
          'ENGINE_INVALID_RESPONSE',
          'Agent(0) private runtime returned an invalid question list response'
        )
      }
      const normalized = questions.map(normalizeAgent0QuestionRequest)
      return {
        questions: sessionId ? normalized.filter((question) => question.sessionId === sessionId) : normalized,
        warnings: [],
      }
    },
    async replyQuestion(sessionId, questionId, input) {
      await ensureAgent0QuestionBelongsToSession({
        engine: options.engine,
        fetch: fetchImpl,
        projectPath: options.projectPath,
        sessionId,
        questionId,
      })
      const result = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: `/question/${encodeURIComponent(questionId)}/reply`,
        method: 'POST',
        searchParams: { directory: options.projectPath },
        body: { answers: input.answers },
      })
      if (typeof result !== 'boolean') {
        throw new Agent0RuntimeClientError(
          'ENGINE_INVALID_RESPONSE',
          'Agent(0) private runtime returned an invalid question reply response'
        )
      }
      return { answered: result, warnings: [] }
    },
    async rejectQuestion(sessionId, questionId) {
      await ensureAgent0QuestionBelongsToSession({
        engine: options.engine,
        fetch: fetchImpl,
        projectPath: options.projectPath,
        sessionId,
        questionId,
      })
      const result = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: `/question/${encodeURIComponent(questionId)}/reject`,
        method: 'POST',
        searchParams: { directory: options.projectPath },
      })
      if (typeof result !== 'boolean') {
        throw new Agent0RuntimeClientError(
          'ENGINE_INVALID_RESPONSE',
          'Agent(0) private runtime returned an invalid question reject response'
        )
      }
      return { rejected: result, warnings: [] }
    },
    async listCommands() {
      return {
        commands: listAgent0BuiltInCommands(options.projectPath),
        warnings: [],
      }
    },
    async runCommand(sessionId, input) {
      const command = getAgent0BuiltInCommand(options.projectPath, input.command)
      if (!command) {
        throw new Agent0RuntimeClientError('ENGINE_INVALID_RESPONSE', `Unknown Agent(0) command: ${input.command}`)
      }
      const message = await fetchAgent0OpenCodeJson({
        engine: options.engine,
        fetch: fetchImpl,
        path: `/session/${encodeURIComponent(sessionId)}/message`,
        method: 'POST',
        searchParams: { directory: options.projectPath },
        body: toOpenCodePromptInput({
          parts: [{ type: 'text', text: renderAgent0CommandTemplate(command.template, input.arguments) }],
          mode: input.mode,
          model: input.model,
          generateReply: true,
        }),
      })
      return normalizeAgent0Message(message)
    },
    streamEvents(input = {}) {
      return streamAgent0OpenCodeEvents({
        engine: options.engine,
        fetch: fetchImpl,
        projectPath: options.projectPath,
        sessionId: input.sessionId,
        signal: input.signal,
      })
    },
    stop() {
      return options.engine.stop()
    },
  }
}

async function ensureAgent0QuestionBelongsToSession(options: {
  engine: Pick<Agent0OpenCodeProcess, 'baseURL' | 'authHeaders'>
  fetch: Agent0RuntimeFetch
  projectPath: string
  sessionId: string
  questionId: string
}): Promise<void> {
  const questions = await fetchAgent0OpenCodeJson({
    engine: options.engine,
    fetch: options.fetch,
    path: '/question',
    searchParams: { directory: options.projectPath },
  })
  if (!Array.isArray(questions)) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid question list response'
    )
  }

  const belongsToSession = questions
    .map(normalizeAgent0QuestionRequest)
    .some((question) => question.id === options.questionId && question.sessionId === options.sessionId)

  if (!belongsToSession) {
    throw new Agent0RuntimeClientError('ENGINE_HTTP_ERROR', 'Agent(0) private runtime question request was not found', {
      status: 404,
    })
  }
}

async function fetchAgent0OpenCodeJson(options: {
  engine: Pick<Agent0OpenCodeProcess, 'baseURL' | 'authHeaders'>
  fetch: Agent0RuntimeFetch
  path: string
  method?: 'GET' | 'POST'
  searchParams?: Record<string, string>
  body?: unknown
}): Promise<unknown> {
  const url = new URL(options.path, options.engine.baseURL)
  for (const [key, value] of Object.entries(options.searchParams ?? {})) {
    url.searchParams.set(key, value)
  }

  let response: Response
  try {
    response = await options.fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        ...options.engine.authHeaders,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    })
  } catch (error) {
    throw new Agent0RuntimeClientError('ENGINE_UNAVAILABLE', 'Agent(0) private runtime is unavailable', {
      cause: error,
    })
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.text()
      if (body) detail = `: ${body.slice(0, 500)}`
    } catch {
      // Body detail is decorative on this error path; the HTTP status below
      // is the real signal.
    }
    throw new Agent0RuntimeClientError(
      'ENGINE_HTTP_ERROR',
      `Agent(0) private runtime responded with HTTP ${response.status}${detail}`,
      { status: response.status }
    )
  }

  try {
    return await response.json()
  } catch (error) {
    throw new Agent0RuntimeClientError('ENGINE_INVALID_RESPONSE', 'Agent(0) private runtime returned invalid JSON', {
      cause: error,
    })
  }
}

async function* streamAgent0OpenCodeEvents(options: {
  engine: Pick<Agent0OpenCodeProcess, 'baseURL' | 'authHeaders'>
  fetch: Agent0RuntimeFetch
  projectPath: string
  sessionId?: string
  signal?: AbortSignal
}): AsyncIterable<Agent0RuntimeEvent> {
  const url = new URL('/event', options.engine.baseURL)
  url.searchParams.set('directory', options.projectPath)

  let response: Response
  try {
    response = await options.fetch(url, {
      headers: options.engine.authHeaders,
      signal: options.signal,
    })
  } catch (error) {
    throw new Agent0RuntimeClientError('ENGINE_UNAVAILABLE', 'Agent(0) private runtime event stream is unavailable', {
      cause: error,
    })
  }

  if (!response.ok) {
    throw new Agent0RuntimeClientError(
      'ENGINE_HTTP_ERROR',
      `Agent(0) private runtime event stream responded with HTTP ${response.status}`,
      { status: response.status }
    )
  }

  if (!response.body) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an empty event stream'
    )
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break

      buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n?/g, '\n')
      let separatorIndex: number
      while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
        const record = buffer.slice(0, separatorIndex)
        buffer = buffer.slice(separatorIndex + 2)
        const event = normalizeOpenCodeSSERecord(record)
        if (!event || !matchesAgent0RuntimeEventSession(event, options.sessionId)) continue
        yield event
      }
    }

    buffer += decoder.decode()
    if (buffer.trim().length > 0) {
      const event = normalizeOpenCodeSSERecord(buffer)
      if (event && matchesAgent0RuntimeEventSession(event, options.sessionId)) yield event
    }
  } finally {
    // Fire-and-forget stream teardown — cancel() rejecting on an already-dead
    // reader is expected and must not mask the loop's outcome.
    await reader.cancel().catch(() => {})
  }
}

function normalizeOpenCodeSSERecord(record: string): Agent0RuntimeEvent | undefined {
  const dataLines: string[] = []
  for (const line of record.split('\n')) {
    if (line.length === 0 || line.startsWith(':')) continue

    const colon = line.indexOf(':')
    const field = colon === -1 ? line : line.slice(0, colon)
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '')
    if (field === 'data') dataLines.push(value)
  }

  if (dataLines.length === 0) return undefined

  let value: unknown
  try {
    value = JSON.parse(dataLines.join('\n'))
  } catch {
    // Malformed frames are expected on an SSE stream; skip and keep reading.
    return undefined
  }

  try {
    return normalizeOpenCodeEvent(value)
  } catch {
    // Unrecognized event shapes are expected across engine versions; skip.
    return undefined
  }
}

function normalizeOpenCodeEvent(value: unknown): Agent0RuntimeEvent | undefined {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid event envelope'
    )
  }

  const id = typeof value.id === 'string' ? value.id : undefined
  const properties = isRecord(value.properties) ? value.properties : {}

  switch (value.type) {
    case 'server.connected':
      return { ...(id ? { id } : {}), type: 'runtime.connected' }
    case 'server.heartbeat':
      return { ...(id ? { id } : {}), type: 'runtime.heartbeat' }
    case 'message.updated': {
      if (!isRecord(properties.info)) return invalidOpenCodeEvent('message.updated')
      return { ...(id ? { id } : {}), type: 'message.updated', message: normalizeAgent0MessageInfo(properties.info) }
    }
    case 'message.removed': {
      if (typeof properties.sessionID !== 'string' || typeof properties.messageID !== 'string') {
        return invalidOpenCodeEvent('message.removed')
      }
      return {
        ...(id ? { id } : {}),
        type: 'message.removed',
        sessionId: properties.sessionID,
        messageId: properties.messageID,
      }
    }
    case 'message.part.updated': {
      if (!isRecord(properties.part) || typeof properties.sessionID !== 'string') {
        return invalidOpenCodeEvent('message.part.updated')
      }
      const messageId =
        typeof properties.part.messageID === 'string'
          ? properties.part.messageID
          : typeof properties.messageID === 'string'
            ? properties.messageID
            : undefined
      if (!messageId) return invalidOpenCodeEvent('message.part.updated')

      const [part] = normalizeAgent0MessagePart(properties.part)
      if (!part) return undefined

      return {
        ...(id ? { id } : {}),
        type: 'message.part.updated',
        sessionId: properties.sessionID,
        messageId,
        part,
        ...(typeof properties.time === 'number' ? { updatedAt: normalizeTimestamp(properties.time) } : {}),
      }
    }
    case 'message.part.delta': {
      if (
        typeof properties.sessionID !== 'string' ||
        typeof properties.messageID !== 'string' ||
        typeof properties.partID !== 'string' ||
        typeof properties.field !== 'string' ||
        typeof properties.delta !== 'string'
      ) {
        return invalidOpenCodeEvent('message.part.delta')
      }
      return {
        ...(id ? { id } : {}),
        type: 'message.part.delta',
        sessionId: properties.sessionID,
        messageId: properties.messageID,
        partId: properties.partID,
        field: properties.field,
        delta: properties.delta,
      }
    }
    case 'message.part.removed': {
      if (
        typeof properties.sessionID !== 'string' ||
        typeof properties.messageID !== 'string' ||
        typeof properties.partID !== 'string'
      ) {
        return invalidOpenCodeEvent('message.part.removed')
      }
      return {
        ...(id ? { id } : {}),
        type: 'message.part.removed',
        sessionId: properties.sessionID,
        messageId: properties.messageID,
        partId: properties.partID,
      }
    }
    case 'session.status': {
      if (typeof properties.sessionID !== 'string') return invalidOpenCodeEvent('session.status')
      const status = normalizeAgent0SessionStatus(properties.status)
      if (!status) return invalidOpenCodeEvent('session.status')
      return {
        ...(id ? { id } : {}),
        type: 'session.status',
        sessionId: properties.sessionID,
        status,
      }
    }
    case 'session.error': {
      if (!isRecord(properties.error)) return invalidOpenCodeEvent('session.error')
      return {
        ...(id ? { id } : {}),
        type: 'session.error',
        ...(typeof properties.sessionID === 'string' ? { sessionId: properties.sessionID } : {}),
        error: normalizeAgent0Error(properties.error),
      }
    }
    case 'question.asked': {
      return { ...(id ? { id } : {}), type: 'question.asked', question: normalizeAgent0QuestionRequest(properties) }
    }
    case 'question.replied': {
      if (
        typeof properties.sessionID !== 'string' ||
        typeof properties.requestID !== 'string' ||
        !Array.isArray(properties.answers)
      ) {
        return invalidOpenCodeEvent('question.replied')
      }
      return {
        ...(id ? { id } : {}),
        type: 'question.replied',
        sessionId: properties.sessionID,
        questionId: properties.requestID,
        answers: normalizeQuestionAnswers(properties.answers),
      }
    }
    case 'question.rejected': {
      if (typeof properties.sessionID !== 'string' || typeof properties.requestID !== 'string') {
        return invalidOpenCodeEvent('question.rejected')
      }
      return {
        ...(id ? { id } : {}),
        type: 'question.rejected',
        sessionId: properties.sessionID,
        questionId: properties.requestID,
      }
    }
    default:
      return undefined
  }
}

function invalidOpenCodeEvent(type: string): never {
  throw new Agent0RuntimeClientError(
    'ENGINE_INVALID_RESPONSE',
    `Agent(0) private runtime returned an invalid ${type} event`
  )
}

function matchesAgent0RuntimeEventSession(event: Agent0RuntimeEvent, sessionId: string | undefined): boolean {
  if (!sessionId) return true

  switch (event.type) {
    case 'runtime.connected':
    case 'runtime.heartbeat':
      return true
    case 'message.updated':
      return event.message.sessionId === sessionId
    case 'question.asked':
      return event.question.sessionId === sessionId
    case 'session.error':
      return event.sessionId === undefined || event.sessionId === sessionId
    default:
      return event.sessionId === sessionId
  }
}

function normalizeAgent0QuestionRequest(value: unknown): Agent0QuestionRequest {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.sessionID !== 'string') {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid question request'
    )
  }
  if (!Array.isArray(value.questions)) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned a question request without questions'
    )
  }

  return {
    id: value.id,
    sessionId: value.sessionID,
    questions: value.questions.map(normalizeAgent0QuestionInfo),
    ...(isRecord(value.tool) && typeof value.tool.messageID === 'string' && typeof value.tool.callID === 'string'
      ? { tool: { messageId: value.tool.messageID, callId: value.tool.callID } }
      : {}),
  }
}

function normalizeAgent0QuestionInfo(value: unknown): Agent0QuestionInfo {
  if (
    !isRecord(value) ||
    typeof value.question !== 'string' ||
    typeof value.header !== 'string' ||
    !Array.isArray(value.options)
  ) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid question'
    )
  }

  return {
    question: value.question,
    header: value.header,
    options: value.options.flatMap((option) => {
      if (!isRecord(option) || typeof option.label !== 'string') return []
      return [
        {
          label: option.label,
          ...(typeof option.description === 'string' ? { description: option.description } : {}),
        },
      ]
    }),
    ...(typeof value.multiple === 'boolean' ? { multiple: value.multiple } : {}),
    ...(typeof value.custom === 'boolean' ? { custom: value.custom } : {}),
  }
}

function normalizeQuestionAnswers(value: unknown[]): string[][] {
  return value.map((answer) => {
    if (!Array.isArray(answer) || answer.some((item) => typeof item !== 'string')) {
      throw new Agent0RuntimeClientError(
        'ENGINE_INVALID_RESPONSE',
        'Agent(0) private runtime returned invalid question answers'
      )
    }
    return [...answer]
  })
}

function listAgent0BuiltInCommands(projectPath: string): Agent0Command[] {
  const commandsRoot = resolveAgent0ProjectPlaybooksRoot(projectPath)
  if (!commandsRoot) return []

  return Object.entries(loadAgent0BuiltInCommandConfig(commandsRoot))
    .map(([name, command]) => ({
      name,
      ...(command.description ? { description: command.description } : {}),
      hints: extractAgent0CommandHints(command.template),
      ...(typeof command.subtask === 'boolean' ? { subtask: command.subtask } : {}),
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name))
}

function getAgent0BuiltInCommand(projectPath: string, name: string) {
  const commandsRoot = resolveAgent0ProjectPlaybooksRoot(projectPath)
  if (!commandsRoot) return undefined

  return loadAgent0BuiltInCommandConfig(commandsRoot)[name]
}

function extractAgent0CommandHints(template: string): string[] {
  const hints = new Set<string>()
  for (const match of template.matchAll(/\$\d+/g)) {
    hints.add(match[0])
  }
  if (template.includes('$ARGUMENTS')) {
    hints.add('$ARGUMENTS')
  }
  return [...hints].sort()
}

function renderAgent0CommandTemplate(template: string, args: string | undefined): string {
  return template.replaceAll('$ARGUMENTS', args?.trim() ?? '')
}

function normalizeAgent0Session(value: unknown, projectPath: string): Agent0Session {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.title !== 'string') {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid session response'
    )
  }
  if (!isRecord(value.time)) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned a session without valid timestamps'
    )
  }

  const mode = normalizeAgent0SessionMode(value.agent)
  return {
    id: value.id,
    title: value.title,
    projectPath,
    ...(typeof value.path === 'string' ? { path: value.path } : {}),
    ...(typeof value.parentID === 'string' ? { parentId: value.parentID } : {}),
    ...(mode ? { mode } : {}),
    ...(isRecord(value.model) ? { model: normalizeAgent0SessionModel(value.model) } : {}),
    createdAt: normalizeTimestamp(value.time.created),
    updatedAt: normalizeTimestamp(value.time.updated),
    ...(value.time.archived === undefined || value.time.archived === null
      ? {}
      : { archivedAt: normalizeTimestamp(value.time.archived) }),
  }
}

function normalizeAgent0SessionModel(value: Record<string, unknown>) {
  if (typeof value.providerID !== 'string' || typeof value.id !== 'string') {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid session model reference'
    )
  }
  return {
    providerId: value.providerID,
    modelId: value.id,
    ...(typeof value.variant === 'string' ? { variant: value.variant } : {}),
  }
}

function normalizeAgent0MessageInfo(info: Record<string, unknown>): Agent0MessageInfo {
  if (
    typeof info.id !== 'string' ||
    typeof info.sessionID !== 'string' ||
    (info.role !== 'user' && info.role !== 'assistant') ||
    !isRecord(info.time)
  ) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid message info response'
    )
  }

  const model =
    info.role === 'user'
      ? isRecord(info.model)
        ? normalizeAgent0MessageModel(info.model)
        : undefined
      : normalizeAgent0AssistantMessageModel(info)
  const usage = normalizeAgent0MessageUsage(info)
  const mode = normalizeAgent0SessionMode(info.agent)

  return {
    id: info.id,
    sessionId: info.sessionID,
    role: info.role,
    createdAt: normalizeTimestamp(info.time.created),
    completed: info.role === 'user' || typeof info.time.completed === 'number' || isRecord(info.error),
    ...(typeof info.time.completed === 'number' ? { completedAt: normalizeTimestamp(info.time.completed) } : {}),
    ...(typeof info.parentID === 'string' ? { parentId: info.parentID } : {}),
    ...(mode ? { mode } : {}),
    ...(model ? { model } : {}),
    ...(usage ? { usage } : {}),
    ...(isRecord(info.error) ? { error: normalizeAgent0Error(info.error) } : {}),
  }
}

const EMPTY_COMPLETION_MAX_RETRIES = 1
const EMPTY_COMPLETION_RETRY_DELAY_MS = 500

/**
 * A completed assistant turn that produced nothing — no parts, no output tokens, no error.
 * Aborted/failed turns carry `error` and are excluded.
 */
function isEmptyCompletion(message: Agent0Message): boolean {
  return (
    message.role === 'assistant' &&
    message.completed &&
    message.error === undefined &&
    message.parts.length === 0 &&
    (message.usage?.outputTokens ?? 0) === 0
  )
}

function normalizeAgent0Message(value: unknown): Agent0Message {
  if (!isRecord(value) || !isRecord(value.info) || !Array.isArray(value.parts)) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid message response'
    )
  }

  const info = normalizeAgent0MessageInfo(value.info)
  const parts = value.parts.flatMap(normalizeAgent0MessagePart)

  return {
    ...info,
    parts,
  }
}

function normalizeAgent0MessageModel(value: Record<string, unknown>): Agent0SessionModelRef {
  if (typeof value.providerID !== 'string' || typeof value.modelID !== 'string') {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid message model reference'
    )
  }
  return {
    providerId: value.providerID,
    modelId: value.modelID,
    ...(typeof value.variant === 'string' ? { variant: value.variant } : {}),
  }
}

function normalizeAgent0AssistantMessageModel(value: Record<string, unknown>): Agent0SessionModelRef | undefined {
  if (typeof value.providerID !== 'string' || typeof value.modelID !== 'string') return undefined
  return {
    providerId: value.providerID,
    modelId: value.modelID,
    ...(typeof value.variant === 'string' ? { variant: value.variant } : {}),
  }
}

function normalizeAgent0SessionMode(value: unknown): Agent0SessionMode | undefined {
  return value === 'default' || value === 'guided' ? value : undefined
}

function normalizeAgent0SessionStatus(value: unknown): Agent0SessionStatus | undefined {
  if (!isRecord(value)) return undefined
  if (value.type === 'idle' || value.type === 'busy') return { type: value.type }
  if (
    value.type !== 'retry' ||
    typeof value.attempt !== 'number' ||
    !Number.isFinite(value.attempt) ||
    typeof value.message !== 'string' ||
    typeof value.next !== 'number' ||
    !Number.isFinite(value.next)
  ) {
    return undefined
  }

  return {
    type: 'retry',
    attempt: value.attempt,
    message: value.message,
    next: value.next,
    ...(isRecord(value.action) &&
    typeof value.action.reason === 'string' &&
    typeof value.action.provider === 'string' &&
    typeof value.action.title === 'string' &&
    typeof value.action.message === 'string' &&
    typeof value.action.label === 'string'
      ? {
          action: {
            reason: value.action.reason,
            provider: value.action.provider,
            title: value.action.title,
            message: value.action.message,
            label: value.action.label,
            ...(typeof value.action.link === 'string' ? { link: value.action.link } : {}),
          },
        }
      : {}),
  }
}

function normalizeAgent0MessagePart(part: unknown): Agent0MessagePart[] {
  if (!isRecord(part) || typeof part.id !== 'string' || typeof part.type !== 'string') return []

  switch (part.type) {
    case 'text':
      return [
        {
          id: part.id,
          type: 'text',
          ...(typeof part.text === 'string' ? { text: part.text } : {}),
          ...(part.synthetic === true ? { synthetic: true } : {}),
          ...(part.ignored === true ? { ignored: true } : {}),
          ...(isRecord(part.metadata) ? { metadata: part.metadata } : {}),
          ...(normalizeAgent0PartTime(part.time) ? { time: normalizeAgent0PartTime(part.time) } : {}),
        },
      ]
    case 'agent':
      return [
        {
          id: part.id,
          type: 'agent',
          title: typeof part.name === 'string' ? part.name : 'Agent',
          ...(typeof part.name === 'string' ? { name: part.name } : {}),
          ...(normalizePartSource(part.source) ? { source: normalizePartSource(part.source) } : {}),
        },
      ]
    case 'compaction':
      return [
        {
          id: part.id,
          type: 'compaction',
          title: 'Compaction',
          status: 'completed',
          ...(part.auto === true || part.auto === false ? { auto: part.auto } : {}),
          ...(part.overflow === true || part.overflow === false ? { overflow: part.overflow } : {}),
          ...(typeof part.tail_start_id === 'string' ? { tailStartId: part.tail_start_id } : {}),
        },
      ]
    case 'file':
      return [
        {
          id: part.id,
          type: 'file',
          title: typeof part.filename === 'string' ? part.filename : 'File',
          ...(typeof part.filename === 'string' ? { filename: part.filename } : {}),
          ...(typeof part.mime === 'string' ? { mime: part.mime } : {}),
          ...(typeof part.url === 'string' ? { url: part.url } : {}),
          ...(normalizePartSource(part.source) ? { source: normalizePartSource(part.source) } : {}),
        },
      ]
    case 'patch':
      return [
        {
          id: part.id,
          type: 'patch',
          title: 'Patch',
          status: 'completed',
          ...(typeof part.hash === 'string' ? { hash: part.hash } : {}),
          ...(Array.isArray(part.files)
            ? { files: part.files.filter((file): file is string => typeof file === 'string') }
            : {}),
        },
      ]
    case 'reasoning':
      return [
        {
          id: part.id,
          type: 'reasoning',
          title: 'Reasoning',
          status: normalizeTimedPartStatus(part.time),
          ...(typeof part.text === 'string' ? { text: part.text } : {}),
          ...(isRecord(part.metadata) ? { metadata: part.metadata } : {}),
          ...(normalizeAgent0PartTime(part.time) ? { time: normalizeAgent0PartTime(part.time) } : {}),
        },
      ]
    case 'retry':
      return [
        {
          id: part.id,
          type: 'retry',
          title: 'Retry',
          status: 'error',
          ...(typeof part.attempt === 'number' && Number.isFinite(part.attempt) ? { attempt: part.attempt } : {}),
          ...(normalizeAgent0PartTime(part.time) ? { time: normalizeAgent0PartTime(part.time) } : {}),
          ...(isRecord(part.error) ? { error: normalizeAgent0Error(part.error) } : {}),
        },
      ]
    case 'snapshot':
      return [
        {
          id: part.id,
          type: 'snapshot',
          title: 'Snapshot',
          status: 'completed',
          ...(typeof part.snapshot === 'string' ? { text: part.snapshot } : {}),
        },
      ]
    case 'step-start':
      return [
        {
          id: part.id,
          type: 'step-start',
          title: 'Step started',
          status: 'running',
          ...(typeof part.snapshot === 'string' ? { text: part.snapshot } : {}),
        },
      ]
    case 'step-finish':
      return [
        {
          id: part.id,
          type: 'step-finish',
          title: 'Step finished',
          status: 'completed',
          ...(typeof part.reason === 'string' ? { reason: part.reason } : {}),
          ...(typeof part.snapshot === 'string' ? { hash: part.snapshot } : {}),
          ...(normalizeAgent0MessageUsage(part) ? { usage: normalizeAgent0MessageUsage(part) } : {}),
        },
      ]
    case 'subtask':
      return [
        {
          id: part.id,
          type: 'subtask',
          title: typeof part.description === 'string' ? part.description : 'Subtask',
          ...(typeof part.description === 'string' ? { description: part.description } : {}),
          ...(typeof part.prompt === 'string' ? { prompt: part.prompt } : {}),
          ...(typeof part.agent === 'string' ? { agent: part.agent } : {}),
          ...(typeof part.command === 'string' ? { command: part.command } : {}),
          ...(isRecord(part.model) ? { model: normalizeAgent0MessageModel(part.model) } : {}),
        },
      ]
    case 'tool':
      return normalizeAgent0ToolPart(part)
    default:
      return []
  }
}

function normalizeAgent0ToolPart(part: Record<string, unknown>): Agent0MessagePart[] {
  if (!isRecord(part.state)) return []
  const status = normalizeToolStatus(part.state.status)
  const state = {
    ...(status ? { status } : { status: 'pending' as const }),
    ...(isRecord(part.state.input) ? { input: part.state.input } : {}),
    ...(typeof part.state.raw === 'string' ? { raw: part.state.raw } : {}),
    ...(typeof part.state.title === 'string' ? { title: part.state.title } : {}),
    ...(isRecord(part.state.metadata) ? { metadata: part.state.metadata } : {}),
    ...('output' in part.state ? { output: part.state.output } : {}),
    ...(Array.isArray(part.state.attachments)
      ? { attachments: normalizeAgent0MessageAttachments(part.state.attachments) }
      : {}),
    ...(typeof part.state.error === 'string' ? { error: part.state.error } : {}),
    ...(normalizeAgent0PartTime(part.state.time) ? { time: normalizeAgent0PartTime(part.state.time) } : {}),
  }
  return [
    {
      id: part.id as string,
      type: 'tool',
      title:
        typeof part.state.title === 'string' ? part.state.title : typeof part.tool === 'string' ? part.tool : 'Tool',
      ...(typeof part.tool === 'string' ? { toolId: part.tool } : {}),
      ...(typeof part.callID === 'string' ? { callId: part.callID } : {}),
      ...(status ? { status } : {}),
      ...(isRecord(part.state.input) ? { input: part.state.input } : {}),
      ...('output' in part.state ? { output: part.state.output } : {}),
      ...(Array.isArray(part.state.attachments)
        ? { attachments: normalizeAgent0MessageAttachments(part.state.attachments) }
        : {}),
      ...(typeof part.state.error === 'string' ? { error: { message: part.state.error } } : {}),
      state,
      ...(isRecord(part.metadata) ? { metadata: part.metadata } : {}),
    },
  ]
}

function normalizeAgent0MessageAttachments(value: unknown[]): Agent0MessageAttachment[] {
  return value.flatMap((attachment) => {
    if (!isRecord(attachment) || typeof attachment.mime !== 'string' || typeof attachment.url !== 'string') return []
    return [
      {
        mime: attachment.mime,
        url: attachment.url,
        ...(typeof attachment.filename === 'string' ? { filename: attachment.filename } : {}),
      },
    ]
  })
}

function normalizeToolStatus(value: unknown): Agent0MessagePartStatus | undefined {
  if (value === 'pending' || value === 'running' || value === 'completed' || value === 'error') return value
  return undefined
}

function normalizeAgent0PartTime(value: unknown) {
  if (!isRecord(value)) return undefined
  const time = {
    ...(typeof value.created === 'number' && Number.isFinite(value.created)
      ? { createdAt: normalizeTimestamp(value.created) }
      : {}),
    ...(typeof value.start === 'number' && Number.isFinite(value.start)
      ? { startedAt: normalizeTimestamp(value.start) }
      : {}),
    ...(typeof value.end === 'number' && Number.isFinite(value.end) ? { endedAt: normalizeTimestamp(value.end) } : {}),
  }
  return Object.keys(time).length > 0 ? time : undefined
}

function normalizeTimedPartStatus(value: unknown): Agent0MessagePartStatus | undefined {
  if (!isRecord(value)) return undefined
  return typeof value.end === 'number' ? 'completed' : 'running'
}

function normalizePartSource(value: unknown): Agent0MessagePartSource | undefined {
  if (!isRecord(value) || (value.type !== 'file' && value.type !== 'resource' && value.type !== 'symbol'))
    return undefined
  const type = value.type
  return {
    type,
    ...(typeof value.path === 'string' ? { path: value.path } : {}),
    ...(typeof value.uri === 'string' ? { uri: value.uri } : {}),
    ...(typeof value.name === 'string' ? { name: value.name } : {}),
    ...(isRecord(value.text) &&
    typeof value.text.value === 'string' &&
    typeof value.text.start === 'number' &&
    typeof value.text.end === 'number'
      ? { text: { value: value.text.value, start: value.text.start, end: value.text.end } }
      : {}),
  }
}

function normalizeErrorMessage(value: Record<string, unknown>): string {
  return typeof value.message === 'string' && value.message.trim().length > 0
    ? value.message
    : 'Agent(0) message failed.'
}

const MAX_ERROR_DATA_STRING = 2000

function truncateErrorData(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    out[key] =
      typeof value === 'string' && value.length > MAX_ERROR_DATA_STRING ? value.slice(0, MAX_ERROR_DATA_STRING) : value
  }
  return out
}

// Preserve the structured error (name/code/status/data) so a provider failure
// stays diagnosable instead of collapsing to a bare message.
function normalizeAgent0Error(value: Record<string, unknown>): Agent0MessageError {
  const error: Agent0MessageError = { message: normalizeErrorMessage(value) }
  if (typeof value.name === 'string') error.name = value.name
  if (typeof value.code === 'string') error.code = value.code
  if (typeof value.status === 'number') error.status = value.status
  if (isRecord(value.data)) error.data = truncateErrorData(value.data)
  return error
}

function normalizeAgent0MessageUsage(value: Record<string, unknown>): Agent0MessageUsage | undefined {
  const usage: Agent0MessageUsage = {}
  if (typeof value.cost === 'number' && Number.isFinite(value.cost)) usage.estimatedCost = value.cost
  if (isRecord(value.tokens)) {
    if (typeof value.tokens.total === 'number' && Number.isFinite(value.tokens.total))
      usage.totalTokens = value.tokens.total
    if (typeof value.tokens.input === 'number' && Number.isFinite(value.tokens.input))
      usage.inputTokens = value.tokens.input
    if (typeof value.tokens.output === 'number' && Number.isFinite(value.tokens.output))
      usage.outputTokens = value.tokens.output
    if (typeof value.tokens.reasoning === 'number' && Number.isFinite(value.tokens.reasoning)) {
      usage.reasoningTokens = value.tokens.reasoning
    }
    if (isRecord(value.tokens.cache)) {
      if (typeof value.tokens.cache.read === 'number' && Number.isFinite(value.tokens.cache.read)) {
        usage.cacheReadTokens = value.tokens.cache.read
      }
      if (typeof value.tokens.cache.write === 'number' && Number.isFinite(value.tokens.cache.write)) {
        usage.cacheWriteTokens = value.tokens.cache.write
      }
    }
  }

  return Object.keys(usage).length > 0 ? usage : undefined
}

function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid session timestamp'
    )
  }
  return new Date(value).toISOString()
}

function toOpenCodePromptInput(input: Agent0SendMessageInput): Record<string, unknown> {
  return {
    parts: input.parts.map(toOpenCodePromptPart),
    ...(input.mode === undefined ? {} : { agent: input.mode }),
    ...(input.generateReply === false ? { noReply: true } : {}),
    ...(input.model === undefined
      ? {}
      : {
          model: {
            providerID: input.model.providerId,
            modelID: input.model.modelId,
          },
          ...(input.model.variant === undefined ? {} : { variant: input.model.variant }),
        }),
  }
}

function toOpenCodePromptPart(part: Agent0PromptPart): Agent0PromptPart {
  if (part.type !== 'file') return part
  if (part.mime === 'text/plain') return part
  if (!isTextReadablePromptFile(part)) return part

  return {
    ...part,
    // Pinned OpenCode expands only text/plain file prompt parts into model
    // context. Keep text-like Agent(0) attachments readable without exposing
    // raw OpenCode file-shape details to the public API.
    mime: 'text/plain',
    url: rewriteDataUrlMime(part.url, 'text/plain'),
  }
}

function isTextReadablePromptFile(part: Extract<Agent0PromptPart, { type: 'file' }>): boolean {
  if (part.mime.startsWith('text/')) return true

  const normalizedMime = part.mime.toLowerCase().split(';')[0]?.trim() ?? ''
  if (
    [
      'application/json',
      'application/ld+json',
      'application/javascript',
      'application/typescript',
      'application/xml',
      'application/yaml',
      'application/x-yaml',
      'application/toml',
      'application/x-ndjson',
      'image/svg+xml',
    ].includes(normalizedMime)
  ) {
    return true
  }

  const filename = part.filename?.toLowerCase()
  if (!filename) return false
  return [
    '.c',
    '.conf',
    '.cpp',
    '.css',
    '.csv',
    '.env',
    '.go',
    '.graphql',
    '.h',
    '.html',
    '.java',
    '.js',
    '.json',
    '.jsx',
    '.kt',
    '.log',
    '.md',
    '.mdx',
    '.py',
    '.rs',
    '.scss',
    '.sh',
    '.sql',
    '.toml',
    '.ts',
    '.tsx',
    '.txt',
    '.xml',
    '.yaml',
    '.yml',
  ].some((extension) => filename.endsWith(extension))
}

function rewriteDataUrlMime(url: string, mime: string): string {
  if (!url.startsWith('data:')) return url
  const comma = url.indexOf(',')
  if (comma === -1) return url

  const metadata = url.slice('data:'.length, comma)
  const parameters = metadata
    .split(';')
    .slice(1)
    .filter((parameter) => parameter.length > 0)
  return `data:${mime}${parameters.map((parameter) => `;${parameter}`).join('')}${url.slice(comma)}`
}

function toOpenCodeCreateSessionInput(input: Agent0CreateSessionInput): Record<string, unknown> {
  return {
    ...(input.title === undefined ? {} : { title: input.title }),
    ...(input.mode === undefined ? {} : { agent: input.mode }),
    ...(input.model === undefined
      ? {}
      : {
          model: {
            providerID: input.model.providerId,
            id: input.model.modelId,
            ...(input.model.variant === undefined ? {} : { variant: input.model.variant }),
          },
        }),
  }
}

function normalizeAgent0RuntimeStatus(
  value: unknown,
  projectPath: string,
  renderedOpenCodeConfigHash?: string
): Agent0RuntimeStatus {
  if (!isRecord(value) || typeof value.directory !== 'string' || typeof value.worktree !== 'string') {
    throw new Agent0RuntimeClientError(
      'ENGINE_INVALID_RESPONSE',
      'Agent(0) private runtime returned an invalid path response'
    )
  }

  return {
    state: 'running',
    projectPath,
    worktreePath: value.worktree,
    ...(renderedOpenCodeConfigHash === undefined ? {} : { renderedOpenCodeConfigHash }),
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
