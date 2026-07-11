import type { ConversationListParams, TraceListParams } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { CloudCommand } from './cloud-command'
import { parseTracePage, type TraceEntry } from './traces-command'

const POSITIVE_DECIMAL = /^[1-9][0-9]*$/
const CONVERSATION_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/
const CODE_VALUE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/
const MAX_PAGE_SIZE = 1_000
const MAX_LIMIT = 10_000
const MAX_PAGES = 100
const MAX_COUNT = 1_000_000_000

type Conversation = {
  id: string
  createdAt: string
  updatedAt: string
  channel: string
  integration: string
  messageCount: number
}

type ConversationPage = { conversations: Conversation[]; nextToken?: string }

type TargetOutput =
  | { environment: 'production'; workspaceId: string; botId: string }
  | {
      environment: 'development'
      workspaceId: string
      runtimeBotId: string
      targetBotId: string
    }

type ConversationTarget = {
  output: TargetOutput
  fetchConversations: (params: ConversationListParams) => Promise<unknown>
  fetchTraces: (params: TraceListParams) => Promise<unknown>
}

type ConversationsDefinition = typeof commandDefinitions.conversations.subcommands.list | typeof commandDefinitions.conversations.subcommands.show

abstract class ConversationsCloudCommand<C extends ConversationsDefinition> extends CloudCommand<C> {
  protected async resolveConversationTarget(): Promise<ConversationTarget> {
    const target = await this.diagnosticCloudapiTarget()
    if ('runtimeBotId' in target) {
      return {
        output: target.output,
        fetchConversations: (params) => target.client.listDevelopmentConversations(target.runtimeBotId, params),
        fetchTraces: (params) => target.client.listDevelopmentTraces(target.runtimeBotId, params),
      }
    }
    return {
      output: target.output,
      fetchConversations: (params) => target.client.listWorkspaceConversations(target.workspaceId, target.botId, params),
      fetchTraces: (params) => target.client.listWorkspaceTraces(target.workspaceId, target.botId, params),
    }
  }
}

export type ListConversationsCommandDefinition = typeof commandDefinitions.conversations.subcommands.list

export class ListConversationsCommand extends ConversationsCloudCommand<ListConversationsCommandDefinition> {
  public async run(): Promise<void> {
    const { limit, since } = resolveListFilters(this.argv, Date.now())
    if (this.argv.nextToken !== undefined && !POSITIVE_DECIMAL.test(this.argv.nextToken)) {
      throw new errors.BotpressCLIError('--next-token must be a positive decimal cursor returned by brt conversations list')
    }

    const target = await this.resolveConversationTarget()
    const conversations: Conversation[] = []
    const seenTokens = new Set<string>()
    let nextToken = this.argv.nextToken
    if (nextToken) seenTokens.add(nextToken)

    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const pageSize = Math.min(MAX_PAGE_SIZE, limit - conversations.length)
      const raw = await target.fetchConversations({ pageSize, nextToken })
      const page = parseConversationPage(raw, pageSize)
      for (const conversation of page.conversations) {
        if (since === undefined || Date.parse(conversation.updatedAt) >= since.timeMs) {
          conversations.push(conversation)
        }
      }

      if (!page.nextToken) {
        nextToken = undefined
        break
      }
      if (seenTokens.has(page.nextToken)) {
        throw new errors.BotpressCLIError('conversation pagination cursor loop detected; retry and check the server')
      }
      seenTokens.add(page.nextToken)
      nextToken = page.nextToken

      if (conversations.length >= limit) break
      if (page.conversations.length === 0) {
        throw new errors.BotpressCLIError('conversation response advanced pagination without returning rows')
      }
      if (pageNumber === MAX_PAGES) {
        throw new errors.BotpressCLIError(`conversation pagination exceeded the ${MAX_PAGES}-page safety limit`)
      }
    }

    const output = {
      schemaVersion: 1,
      target: target.output,
      conversations: conversations.slice(0, limit),
      nextToken: nextToken ?? null,
    }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }

    if (conversations.length === 0) this.logger.log('No conversations found.')
    for (const conversation of conversations.slice(0, limit)) {
      const destination = conversation.integration ? `${conversation.integration}/${conversation.channel}` : conversation.channel
      this.logger.log(`${conversation.updatedAt} ${conversation.id} ${destination} messages=${conversation.messageCount}`)
    }
    if (nextToken) this.logger.log(`Next token: ${nextToken}`)
  }
}

export type ShowConversationCommandDefinition = typeof commandDefinitions.conversations.subcommands.show

export class ShowConversationCommand extends ConversationsCloudCommand<ShowConversationCommandDefinition> {
  public async run(): Promise<void> {
    const conversationId = this.argv.conversationId
    if (!CONVERSATION_ID.test(conversationId)) {
      throw new errors.BotpressCLIError('conversation ID must be 1-256 characters using only letters, digits, dot, underscore, colon, slash, or hyphen')
    }

    const target = await this.resolveConversationTarget()
    const rows: TraceEntry[] = []
    const seenTokens = new Set<string>()
    let nextToken: string | undefined

    for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber++) {
      const raw = await target.fetchTraces({
        conversationId,
        pageSize: MAX_PAGE_SIZE,
        nextToken,
      })
      const page = parseTracePage(raw, MAX_PAGE_SIZE)
      rows.push(...page.traces)

      if (!page.nextToken) break
      if (seenTokens.has(page.nextToken)) {
        throw new errors.BotpressCLIError('conversation timeline pagination cursor loop detected; retry and check the server')
      }
      seenTokens.add(page.nextToken)
      nextToken = page.nextToken
      if (page.traces.length === 0) {
        throw new errors.BotpressCLIError('conversation timeline advanced pagination without returning rows')
      }
      if (pageNumber === MAX_PAGES) {
        throw new errors.BotpressCLIError(`conversation timeline pagination exceeded the ${MAX_PAGES}-page safety limit`)
      }
    }

    const turns = buildTurns(rows)
    const output = {
      schemaVersion: 1,
      target: target.output,
      conversationId,
      turnCount: turns.length,
      turns,
    }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }

    this.logger.log(`Conversation ${conversationId} (${turns.length} turn${turns.length === 1 ? '' : 's'})`)
    for (const turn of turns) {
      const details = [turn.trigger, ...turn.tools.map((tool) => `tool=${tool.name}`)].filter(Boolean).join(' ')
      const suffix = details ? ` ${details}` : ''
      this.logger.log(`${turn.startedAt} ${turn.status.toUpperCase()} ${turn.durationMs}ms ${turn.traceId ?? 'unattributed'}${suffix}`)
    }
  }
}

function resolveListFilters(
  input: { tokens?: string[]; limit?: number; since?: string },
  nowMs: number
): { limit: number; since?: { timeMs: number } } {
  const tokens = parseListTokens(input.tokens ?? [])
  const tokenLimit = tokens.limit === undefined ? undefined : parsePositiveInteger(tokens.limit, 'limit=')
  if (input.limit !== undefined && tokenLimit !== undefined) {
    throw new errors.BotpressCLIError('limit filter conflict: provide it only once as a flag or token')
  }
  const limit = input.limit ?? tokenLimit ?? 20
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new errors.BotpressCLIError(`--limit must be an integer between 1 and ${MAX_LIMIT}`)
  }

  if (input.since !== undefined && tokens.since !== undefined) {
    throw new errors.BotpressCLIError('since filter conflict: provide it only once as a flag or token')
  }
  const rawSince = input.since ?? tokens.since
  return {
    limit,
    ...(rawSince === undefined ? {} : { since: parseSince(rawSince, nowMs) }),
  }
}

function parseListTokens(tokens: string[]): { limit?: string; since?: string } {
  const result: { limit?: string; since?: string } = {}
  for (const token of tokens) {
    if (token === 'include-llm') {
      throw new errors.BotpressCLIError('include-llm is forbidden by the cloud metadata-only privacy boundary')
    }
    const separator = token.indexOf('=')
    if (separator <= 0 || separator === token.length - 1) {
      throw new errors.BotpressCLIError(`unknown conversation filter token: ${token}`)
    }
    const key = token.slice(0, separator)
    if (key !== 'limit' && key !== 'since') {
      throw new errors.BotpressCLIError(`unknown conversation filter token: ${token}`)
    }
    if (result[key] !== undefined) {
      throw new errors.BotpressCLIError(`${key} filter was provided more than once`)
    }
    result[key] = token.slice(separator + 1)
  }
  return result
}

function parsePositiveInteger(value: string, label: string): number {
  if (!POSITIVE_DECIMAL.test(value)) {
    throw new errors.BotpressCLIError(`${label} must be a positive decimal integer`)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new errors.BotpressCLIError(`${label} is too large`)
  return parsed
}

const RFC3339 = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(?:Z|[+-](\d{2}):(\d{2}))$/
const DURATION = /^([0-9]+)(ms|s|m|h|d)$/
const DURATION_MS = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
} as const

function parseSince(value: string, nowMs: number): { timeMs: number } {
  const duration = DURATION.exec(value)
  if (duration) {
    const amount = Number(duration[1])
    const delta = amount * DURATION_MS[duration[2] as keyof typeof DURATION_MS]
    const timeMs = nowMs - delta
    if (!Number.isSafeInteger(amount) || !Number.isFinite(timeMs) || timeMs < 0) {
      throw new errors.BotpressCLIError('since duration is too large')
    }
    return { timeMs }
  }
  const match = RFC3339.exec(value)
  if (!match || !validTimestampParts(match) || !Number.isFinite(Date.parse(value))) {
    throw new errors.BotpressCLIError('since must be RFC3339 or a duration such as 30s, 5m, 1h, or 2d')
  }
  return { timeMs: Date.parse(value) }
}

function validTimestampParts(match: RegExpExecArray): boolean {
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const hour = Number(match[4])
  const minute = Number(match[5])
  const second = Number(match[6])
  const offsetHour = match[7] === undefined ? 0 : Number(match[7])
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59
  )
}

function parseConversationPage(value: unknown, pageSize: number): ConversationPage {
  if (!isRecord(value) || !Array.isArray(value.conversations)) {
    throw new errors.BotpressCLIError('conversation response has malformed conversations')
  }
  if (!isRecord(value.meta)) throw new errors.BotpressCLIError('conversation response has malformed meta')
  if (value.conversations.length > pageSize) {
    throw new errors.BotpressCLIError('conversation response returned more rows than the requested pageSize')
  }
  const rawNextToken = value.meta.nextToken
  if (rawNextToken !== undefined && typeof rawNextToken !== 'string') {
    throw new errors.BotpressCLIError('conversation response has a malformed nextToken')
  }
  if (typeof rawNextToken === 'string' && rawNextToken !== '' && !POSITIVE_DECIMAL.test(rawNextToken)) {
    throw new errors.BotpressCLIError('conversation response has a malformed nextToken')
  }
  return {
    conversations: value.conversations.map((row, index) => parseConversation(row, index)),
    nextToken: rawNextToken || undefined,
  }
}

function parseConversation(value: unknown, index: number): Conversation {
  const prefix = `conversation response row ${index}`
  if (!isRecord(value)) throw new errors.BotpressCLIError(`${prefix} is malformed`)
  const id = safeString(value.id, `${prefix}.id`, CONVERSATION_ID)
  const createdAt = safeTimestamp(value.createdAt, `${prefix}.createdAt`)
  const updatedAt = safeTimestamp(value.updatedAt, `${prefix}.updatedAt`)
  const channel = safeString(value.channel, `${prefix}.channel`, CODE_VALUE)
  const integration = value.integration === '' ? '' : safeString(value.integration, `${prefix}.integration`, CODE_VALUE)
  const messageCount = value.messageCount
  if (!Number.isInteger(messageCount) || (messageCount as number) < 0 || (messageCount as number) > MAX_COUNT) {
    throw new errors.BotpressCLIError(`${prefix}.messageCount is malformed`)
  }
  return {
    id,
    createdAt,
    updatedAt,
    channel,
    integration,
    messageCount: messageCount as number,
  }
}

type ConversationTurn = {
  traceId: string | null
  startedAt: string
  durationMs: number
  status: 'unset' | 'ok' | 'error'
  trigger: string | null
  tools: Array<{
    name: string
    status: string
    durationMs: number
    errorKind?: string
  }>
  errorKinds: string[]
}

const TRIGGERS = new Set(['request.incoming', 'handler.conversation', 'handler.event', 'handler.trigger'])

function buildTurns(rows: TraceEntry[]): ConversationTurn[] {
  const groups = new Map<string, TraceEntry[]>()
  for (const row of rows) {
    const key = row.traceId ?? `row:${row.id}`
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  return [...groups.values()]
    .map((group) => {
      const ordered = group.toSorted((left, right) => timeOf(left) - timeOf(right))
      const root = ordered.find((row) => row.parentSpanId === undefined) ?? ordered[0]!
      const status = group.some(isEffectiveError) ? 'error' : group.some((row) => row.status === 'ok') ? 'ok' : 'unset'
      const tools = ordered
        .filter((row) => row.name === 'autonomous.tool')
        .map((row) => ({
          name: String(row.metadata?.autonomousToolName ?? 'autonomous.tool'),
          status: String(row.metadata?.autonomousToolStatus ?? row.status),
          durationMs: row.durationMs,
          ...(row.metadata?.errorKind === undefined ? {} : { errorKind: String(row.metadata.errorKind) }),
        }))
      const errorKinds = [...new Set(ordered.flatMap((row) => (row.metadata?.errorKind === undefined ? [] : [String(row.metadata.errorKind)])))].toSorted()
      return {
        traceId: root.traceId ?? null,
        startedAt: root.startedAt ?? root.createdAt,
        durationMs: root.durationMs,
        status,
        trigger: ordered.find((row) => TRIGGERS.has(row.name))?.name ?? null,
        tools,
        errorKinds,
      } satisfies ConversationTurn
    })
    .toSorted((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
}

function isEffectiveError(row: TraceEntry): boolean {
  const autonomousStatus = row.metadata?.autonomousStatus
  return (
    row.status === 'error' ||
    row.metadata?.errorKind !== undefined ||
    row.metadata?.autonomousToolStatus === 'error' ||
    autonomousStatus === 'generation_error' ||
    autonomousStatus === 'execution_error' ||
    autonomousStatus === 'invalid_code_error' ||
    autonomousStatus === 'exit_error' ||
    autonomousStatus === 'aborted'
  )
}

function timeOf(row: TraceEntry): number {
  return Date.parse(row.startedAt ?? row.createdAt)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeString(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return value
}

function safeTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new errors.BotpressCLIError(`${field} is malformed`)
  const match = RFC3339.exec(value)
  if (!match || !validTimestampParts(match) || !Number.isFinite(Date.parse(value))) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  return value
}
