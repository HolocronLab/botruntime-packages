import type { EvalDefinition } from '../definition'
import type { EvalFilter, EvalProgressEvent, EvalReport, EvalRunReport, TurnReport, GraderResult } from '../types'
import type {
  EvalStore,
  EvalSummary,
  EvalRunSummary,
  EvalReportHistoryEntry,
  EvalWatchOptions,
  EvalRunCreateOptions,
} from './eval-store'
import type { EvalDefinitionLoader } from './eval-definition-loader'

// ── Vortex response types ──────────────────────────────────────────────

interface VortexEvalRun {
  id: string
  botId: string
  evalManifestId: string
  workflowId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  triggerType: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  aborted: boolean
  errorKind: VortexEvalErrorKind | null
}

interface VortexEvalResult {
  id: string
  evalEntryId: string
  turnIndex: number
  resultIndex: number
  assertionKind: VortexEvalAssertionKind
  passed: boolean
  skipped: boolean
  score: number | null
  botDurationMs: number | null
  graderDurationMs: number | null
  createdAt: string
}

interface VortexEvalEntry {
  id: string
  evalRunId: string
  evalName: string
  evalType: 'capability' | 'regression'
  tags: string[]
  /** null while the entry is in-progress (per-turn lifecycle); set on finalize. */
  passed: boolean | null
  durationMs: number | null
  errorKind: VortexEvalErrorKind | null
  createdAt: string
  results: VortexEvalResult[]
}

/** A single grader result row, as posted to Vortex. */
interface VortexResultInput {
  turnIndex: number
  assertionKind: VortexEvalAssertionKind
  passed: boolean
  skipped: boolean
  score?: number
  botDurationMs?: number
  graderDurationMs?: number
}

type VortexRunWithEntries = VortexEvalRun & { entries: VortexEvalEntry[] }

const OUTCOME_TURN_INDEX = -1

export const VORTEX_EVAL_ASSERTION_KINDS = [
  'response',
  'no_response',
  'response_contains',
  'response_not_contains',
  'response_matches',
  'llm_judge',
  'tool_called',
  'tool_not_called',
  'tool_order',
  'timing',
  'workflow',
  'state',
  'outcome',
  'unknown',
] as const

export type VortexEvalAssertionKind = (typeof VORTEX_EVAL_ASSERTION_KINDS)[number]

export const VORTEX_EVAL_ERROR_KINDS = [
  'aborted',
  'configuration',
  'auth',
  'trace_reader',
  'chat',
  'timeout',
  'upstream',
  'internal',
] as const

export type VortexEvalErrorKind = (typeof VORTEX_EVAL_ERROR_KINDS)[number]

export class VortexEvalStoreError extends Error {
  readonly kind: VortexEvalErrorKind
  readonly status?: number

  constructor(message: string, kind: VortexEvalErrorKind, status?: number) {
    super(message)
    this.name = 'VortexEvalStoreError'
    this.kind = kind
    if (status !== undefined) this.status = status
  }
}

// ── Config ─────────────────────────────────────────────────────────────

export interface VortexEvalStoreConfig {
  url: string
  botId: string
  token: string
  development: boolean
  evalManifestId?: string | (() => string | undefined)
  loadEvalDefinitions?: EvalDefinitionLoader
}

const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const MAX_EVALS_PER_RUN = 128
const MAX_TURNS_PER_EVAL = 1024
const MAX_RESULTS_PER_BATCH = 64
const MAX_RESULTS_PER_EVAL = 1024
const MAX_RESULTS_PER_RUN = 4096
const MAX_TAGS_PER_EVAL = 32
const MAX_EVAL_NAME_BYTES = 128
const MAX_TAG_BYTES = 64
const MAX_DURATION_MS = 86_400_000

function configFailure(message: string): never {
  throw new VortexEvalStoreError(message, 'configuration')
}

function isSafeIdentifier(value: unknown, maxBytes: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxBytes && SAFE_IDENTIFIER.test(value)
}

function assertionArrayLength(value: unknown, field: string): number {
  if (value === undefined) return 0
  if (!Array.isArray(value)) configFailure(`${field} must be an array`)
  return value.length
}

function projectedTurnResults(turn: unknown): number {
  if (turn === null || typeof turn !== 'object' || Array.isArray(turn)) {
    configFailure('hosted eval turns must be objects')
  }
  const value = turn as {
    expectSilence?: unknown
    assert?: {
      response?: unknown
      tools?: unknown
      state?: unknown
      workflow?: unknown
      timing?: unknown
    }
  }
  if (value.assert !== undefined && (value.assert === null || typeof value.assert !== 'object' || Array.isArray(value.assert))) {
    configFailure('hosted eval turn assertions must be an object')
  }
  const response = assertionArrayLength(value.assert?.response, 'response assertions')
  const projectedResponse = value.expectSilence === true ? 1 : Math.max(response, 1)
  return (
    projectedResponse +
    assertionArrayLength(value.assert?.tools, 'tool assertions') +
    assertionArrayLength(value.assert?.state, 'state assertions') +
    assertionArrayLength(value.assert?.workflow, 'workflow assertions') +
    assertionArrayLength(value.assert?.timing, 'timing assertions')
  )
}

/**
 * Validate the complete hosted projection before the server creates a visible
 * run. This mirrors the bounded metadata-only persistence contract; it never
 * examines or serializes conversation content.
 */
export function validateHostedEvalDefinitions(definitions: EvalDefinition[]): void {
  if (!Array.isArray(definitions) || definitions.length === 0 || definitions.length > MAX_EVALS_PER_RUN) {
    configFailure(`hosted eval suites must contain between 1 and ${MAX_EVALS_PER_RUN} evals`)
  }

  const names = new Set<string>()
  let totalProjectedResults = 0
  for (const definition of definitions) {
    if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
      configFailure('hosted eval definitions must be objects')
    }
    if (!isSafeIdentifier(definition.name, MAX_EVAL_NAME_BYTES)) {
      configFailure('hosted eval names must be safe ASCII identifiers of at most 128 bytes')
    }
    if (names.has(definition.name)) configFailure('hosted eval names must be unique')
    names.add(definition.name)
    if (definition.type !== undefined && definition.type !== 'capability' && definition.type !== 'regression') {
      configFailure('hosted eval type must be capability or regression')
    }
    if (!Array.isArray(definition.conversation) || definition.conversation.length > MAX_TURNS_PER_EVAL) {
      configFailure(`a hosted eval may contain at most ${MAX_TURNS_PER_EVAL} turns`)
    }
    const tags = definition.tags ?? []
    if (!Array.isArray(tags) || tags.length > MAX_TAGS_PER_EVAL) {
      configFailure(`a hosted eval may contain at most ${MAX_TAGS_PER_EVAL} tags`)
    }
    const seenTags = new Set<string>()
    for (const tag of tags) {
      if (!isSafeIdentifier(tag, MAX_TAG_BYTES)) {
        configFailure('hosted eval tags must be safe ASCII identifiers of at most 64 bytes')
      }
      if (seenTags.has(tag)) configFailure('hosted eval tags must be unique')
      seenTags.add(tag)
    }

    let evalProjectedResults = 0
    for (const turn of definition.conversation) {
      const count = projectedTurnResults(turn)
      if (count > MAX_RESULTS_PER_BATCH) {
        configFailure(`a hosted eval turn may project at most ${MAX_RESULTS_PER_BATCH} results`)
      }
      evalProjectedResults += count
      totalProjectedResults += count
    }
    const outcomeCount =
      assertionArrayLength(definition.outcome?.state, 'outcome state assertions') +
      assertionArrayLength(definition.outcome?.workflow, 'outcome workflow assertions')
    if (outcomeCount > MAX_RESULTS_PER_BATCH) {
      configFailure(`a hosted eval outcome may project at most ${MAX_RESULTS_PER_BATCH} results`)
    }
    evalProjectedResults += outcomeCount
    totalProjectedResults += outcomeCount
    if (evalProjectedResults > MAX_RESULTS_PER_EVAL) {
      configFailure(`a hosted eval may project at most ${MAX_RESULTS_PER_EVAL} results`)
    }
    if (totalProjectedResults > MAX_RESULTS_PER_RUN) {
      configFailure(`a hosted eval run may project at most ${MAX_RESULTS_PER_RUN} results`)
    }
  }
}

const ASSERTION_KIND_SET = new Set<string>(VORTEX_EVAL_ASSERTION_KINDS)
const ERROR_KIND_SET = new Set<string>(VORTEX_EVAL_ERROR_KINDS)

function validDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_DURATION_MS
}

function validateEntryProjection(meta: {
  evalName: unknown
  evalType?: unknown
  tags?: unknown
}): asserts meta is { evalName: string; evalType?: 'capability' | 'regression'; tags?: string[] } {
  if (!isSafeIdentifier(meta.evalName, MAX_EVAL_NAME_BYTES)) {
    configFailure('hosted eval names must be safe ASCII identifiers of at most 128 bytes')
  }
  if (meta.evalType !== undefined && meta.evalType !== 'capability' && meta.evalType !== 'regression') {
    configFailure('hosted eval type must be capability or regression')
  }
  const tags = meta.tags ?? []
  if (!Array.isArray(tags) || tags.length > MAX_TAGS_PER_EVAL) {
    configFailure(`a hosted eval may contain at most ${MAX_TAGS_PER_EVAL} tags`)
  }
  const seen = new Set<string>()
  for (const tag of tags) {
    if (!isSafeIdentifier(tag, MAX_TAG_BYTES)) {
      configFailure('hosted eval tags must be safe ASCII identifiers of at most 64 bytes')
    }
    if (seen.has(tag)) configFailure('hosted eval tags must be unique')
    seen.add(tag)
  }
}

function validateResultBatch(results: VortexResultInput[]): void {
  if (results.length === 0 || results.length > MAX_RESULTS_PER_BATCH) {
    configFailure(`a hosted eval result batch must contain between 1 and ${MAX_RESULTS_PER_BATCH} results`)
  }
  const turnIndex = results[0]!.turnIndex
  if (!Number.isInteger(turnIndex) || turnIndex < -1 || turnIndex >= MAX_TURNS_PER_EVAL) {
    configFailure('hosted eval turnIndex must be between -1 and 1023')
  }
  for (const result of results) {
    if (result.turnIndex !== turnIndex) configFailure('a hosted eval result batch may contain only one turnIndex')
    if (!ASSERTION_KIND_SET.has(result.assertionKind)) configFailure('hosted eval assertionKind is invalid')
    if (typeof result.passed !== 'boolean' || typeof result.skipped !== 'boolean') {
      configFailure('hosted eval passed and skipped verdicts are required')
    }
    if (
      result.score !== undefined &&
      (typeof result.score !== 'number' || !Number.isFinite(result.score) || result.score < 0 || result.score > 1)
    ) {
      configFailure('hosted eval score must be between 0 and 1')
    }
    if (result.botDurationMs !== undefined && !validDuration(result.botDurationMs)) {
      configFailure('hosted eval botDurationMs is invalid')
    }
    if (result.graderDurationMs !== undefined && !validDuration(result.graderDurationMs)) {
      configFailure('hosted eval graderDurationMs is invalid')
    }
  }
}

function validateReportProjection(reports: EvalReport[]): void {
  if (!Array.isArray(reports) || reports.length > MAX_EVALS_PER_RUN) {
    configFailure(`a hosted eval run may contain at most ${MAX_EVALS_PER_RUN} eval reports`)
  }
  const names = new Set<string>()
  let totalResults = 0
  for (const report of reports) {
    validateEntryProjection({ evalName: report.name, evalType: report.type, tags: report.tags })
    if (names.has(report.name)) configFailure('hosted eval report names must be unique')
    names.add(report.name)
    if (!validDuration(report.duration)) configFailure('hosted eval duration is invalid')
    if (!Array.isArray(report.turns) || report.turns.length > MAX_TURNS_PER_EVAL) {
      configFailure(`a hosted eval report may contain at most ${MAX_TURNS_PER_EVAL} turns`)
    }
    let evalResults = 0
    for (const turn of report.turns) {
      const results = turnToResultRows(turn)
      if (results.length > 0) validateResultBatch(results)
      evalResults += results.length
      totalResults += results.length
    }
    const outcome = outcomeToResultRows(report.outcomeAssertions)
    if (outcome.length > 0) validateResultBatch(outcome)
    evalResults += outcome.length
    totalResults += outcome.length
    if (evalResults > MAX_RESULTS_PER_EVAL) {
      configFailure(`a hosted eval report may contain at most ${MAX_RESULTS_PER_EVAL} results`)
    }
    if (totalResults > MAX_RESULTS_PER_RUN) {
      configFailure(`a hosted eval run may contain at most ${MAX_RESULTS_PER_RUN} results`)
    }
  }
}

// ── Transformers ───────────────────────────────────────────────────────

function vortexEntryToEvalReport(entry: VortexEvalEntry): EvalReport {
  const outcomeAssertions: GraderResult[] = entry.results
    .filter((r) => r.turnIndex === OUTCOME_TURN_INDEX)
    .map((r) => ({
      assertion: r.assertionKind,
      pass: r.passed,
      ...(r.skipped ? { skipped: true } : {}),
      expected: '',
      actual: '',
    }))

  const resultsByTurn = new Map<number, VortexEvalResult[]>()
  for (const r of entry.results) {
    if (r.turnIndex === OUTCOME_TURN_INDEX) continue
    const existing = resultsByTurn.get(r.turnIndex) ?? []
    existing.push(r)
    resultsByTurn.set(r.turnIndex, existing)
  }

  const turns: TurnReport[] = [...resultsByTurn.entries()]
    .sort(([a], [b]) => a - b)
    .map(([turnIndex, results]) => {
      const assertions: GraderResult[] = results.map((r) => ({
        assertion: r.assertionKind,
        pass: r.passed,
        ...(r.skipped ? { skipped: true } : {}),
        expected: '',
        actual: '',
      }))
      const first = results[0]!
      return {
        turnIndex,
        userMessage: '',
        botResponse: '',
        assertions,
        pass: assertions.every((a) => a.pass),
        botDuration: first.botDurationMs ?? 0,
        evalDuration: first.graderDurationMs ?? 0,
      }
    })

  return {
    name: entry.evalName,
    type: entry.evalType,
    tags: entry.tags,
    turns,
    outcomeAssertions,
    pass: entry.passed ?? false,
    duration: entry.durationMs ?? 0,
    error: entry.errorKind ?? undefined,
  }
}

/** Run an async fn over items with bounded concurrency, preserving input order. */
async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++
      results[i] = await fn(items[i]!)
    }
  })
  await Promise.all(workers)
  return results
}

/** Map one turn's assertions to Vortex result rows (shared by batch + per-turn writes). */
function turnToResultRows(turn: TurnReport): VortexResultInput[] {
  const context = {
    turnIndex: turn.turnIndex,
    botDurationMs: turn.botDuration,
    graderDurationMs: turn.evalDuration,
  }
  if (turn.assertions.length === 0) {
    return [{ ...context, assertionKind: 'response', passed: turn.pass, skipped: false }]
  }
  return graderResultsToRows(turn.assertions, context)
}

function outcomeToResultRows(assertions: GraderResult[]): VortexResultInput[] {
  return graderResultsToRows(assertions, {
    turnIndex: OUTCOME_TURN_INDEX,
  }, 'outcome')
}

function graderResultsToRows(
  assertions: GraderResult[],
  context: Omit<VortexResultInput, 'assertionKind' | 'passed' | 'skipped'>,
  forcedKind?: VortexEvalAssertionKind
): VortexResultInput[] {
  return assertions.map((assertion) => ({
    ...context,
    assertionKind: forcedKind ?? assertionKindOf(assertion.assertion),
    passed: assertion.pass,
    skipped: assertion.skipped === true,
  }))
}

function assertionKindOf(assertion: string): VortexEvalAssertionKind {
  if (assertion === 'response') return 'response'
  if (assertion === 'no_response') return 'no_response'
  if (assertion.startsWith('contains ')) return 'response_contains'
  if (assertion.startsWith('not_contains ')) return 'response_not_contains'
  if (assertion.startsWith('matches ')) return 'response_matches'
  if (assertion.startsWith('llm_judge:')) return 'llm_judge'
  if (assertion.startsWith('tool called:')) return 'tool_called'
  if (assertion.startsWith('tool not_called:')) return 'tool_not_called'
  if (assertion.startsWith('call_order:')) return 'tool_order'
  if (assertion.startsWith('response_time ')) return 'timing'
  if (assertion === 'workflow' || assertion.startsWith('workflow:')) return 'workflow'
  if (assertion === 'state' || assertion.startsWith('state:')) return 'state'
  if (assertion === 'outcome') return 'outcome'
  return 'unknown'
}

function runMatchesWatchOptions(run: VortexEvalRun, options: EvalWatchOptions): boolean {
  if (options.runId && run.id !== options.runId) return false
  if (options.workflowId && run.workflowId !== options.workflowId) return false
  return true
}

function vortexRunToReport(run: VortexRunWithEntries): EvalRunReport {
  const evals = run.entries.map(vortexEntryToEvalReport)
  return {
    id: run.id,
    timestamp: run.createdAt,
    evals,
    passed: evals.filter((e) => e.pass).length,
    failed: evals.filter((e) => !e.pass).length,
    total: evals.length,
    duration: evals.reduce((s, e) => s + e.duration, 0),
    ...(run.aborted ? { aborted: true } : {}),
  }
}

function vortexRunToSummary(run: VortexEvalRun & { entries?: VortexEvalEntry[] }): EvalRunSummary {
  const startMs = run.startedAt ? new Date(run.startedAt).getTime() : 0
  const endMs = run.completedAt ? new Date(run.completedAt).getTime() : 0

  if (run.entries) {
    const evals = run.entries.map(vortexEntryToEvalReport)
    return {
      id: run.id,
      timestamp: run.createdAt,
      passed: evals.filter((e) => e.pass).length,
      failed: evals.filter((e) => !e.pass).length,
      total: evals.length,
      duration: evals.reduce((s, e) => s + e.duration, 0),
      botDuration: evals.reduce((s, e) => e.turns.reduce((ts, t) => ts + t.botDuration, s), 0),
      evalDuration: evals.reduce((s, e) => e.turns.reduce((ts, t) => ts + t.evalDuration, s), 0),
      evalNames: evals.map((e) => e.name),
      aborted: run.aborted,
    }
  }

  return {
    id: run.id,
    timestamp: run.createdAt,
    passed: 0,
    failed: 0,
    total: 0,
    duration: startMs && endMs ? endMs - startMs : 0,
    botDuration: 0,
    evalDuration: 0,
    evalNames: [],
    aborted: run.aborted,
  }
}

const CONFIGURATION_ERROR_CODES = new Set([
  'EVAL_LOAD_FAILED',
  'EVAL_FILE_EMPTY',
  'EVAL_DUPLICATE_NAME',
  'EVAL_SEED_NO_CONVERSATION',
  'EVAL_NO_CONVERSATION_ID',
  'EVAL_TURN_CONFIG_INVALID',
  'EVAL_OBSERVATION_UNSUPPORTED',
])
const TRACE_READER_ERROR_CODES = new Set(['SSE_CONNECT_FAILED', 'SSE_NO_BODY'])
const CHAT_ERROR_CODES = new Set([
  'CHAT_CLIENT_MISSING',
  'CHAT_NOT_CONNECTED',
  'CHAT_LISTENER_FAILED',
  'CHAT_INTEGRATION_MISSING',
  'CHAT_CHANNEL_UNBOUND',
])

function errorCodeOf(value: unknown): string | undefined {
  if (value === null || typeof value !== 'object') return undefined
  const code = (value as { code?: unknown }).code
  return typeof code === 'string' ? code : undefined
}

export function classifyVortexEvalError(error: unknown): VortexEvalErrorKind {
  if (error instanceof VortexEvalStoreError) return error.kind
  const code = errorCodeOf(error)
  if (code && CONFIGURATION_ERROR_CODES.has(code)) return 'configuration'
  if (code && TRACE_READER_ERROR_CODES.has(code)) return 'trace_reader'
  if (code && CHAT_ERROR_CODES.has(code)) return 'chat'
  if (error instanceof Error && error.name === 'AbortError') return 'aborted'
  if (error instanceof Error && error.name === 'TimeoutError') return 'timeout'
  return 'internal'
}

export function classifyVortexEvalReport(
  report: EvalReport
): VortexEvalErrorKind | undefined {
  if (report.error === undefined) return undefined
  if (report.errorCode === 'EVAL_ABORTED') return 'aborted'
  if (report.errorCode && CONFIGURATION_ERROR_CODES.has(report.errorCode)) return 'configuration'
  if (report.errorCode && TRACE_READER_ERROR_CODES.has(report.errorCode)) return 'trace_reader'
  if (report.errorCode && CHAT_ERROR_CODES.has(report.errorCode)) return 'chat'
  return 'internal'
}

function httpErrorKind(status: number): VortexEvalErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 409) return 'internal'
  if (status === 400 || status === 404 || status === 413 || status === 422) return 'configuration'
  if (status === 429 || status >= 500) return 'upstream'
  return 'internal'
}

// ── VortexEvalStore ────────────────────────────────────────────────────

export class VortexEvalStore implements EvalStore {
  private url: string
  private botId: string
  private token: string
  private development: boolean
  private _evalManifestId?: string | (() => string | undefined)
  private _loadEvalDefinitions?: EvalDefinitionLoader

  constructor(config: VortexEvalStoreConfig) {
    if (!config.url) throw new VortexEvalStoreError('Vortex eval store URL is required', 'configuration')
    if (!config.token) throw new VortexEvalStoreError('Vortex eval store token is required', 'auth')
    if (!isSafeIdentifier(config.botId, MAX_EVAL_NAME_BYTES)) {
      throw new VortexEvalStoreError('Vortex eval store botId is malformed', 'configuration')
    }

    this.url = config.url.replace(/\/+$/, '')
    this.botId = config.botId
    this.token = config.token
    this.development = config.development
    this._evalManifestId = config.evalManifestId
    this._loadEvalDefinitions = config.loadEvalDefinitions
  }

  // ── Eval definitions (from Files API manifest) ───────────────────────

  async listEvals(filter?: EvalFilter): Promise<EvalSummary[]> {
    const defs = await this.getEvalDefinitions()
    const filtered = defs.filter((e) => {
      if (filter?.names && !filter.names.includes(e.name)) return false
      if (filter?.type && e.type !== filter.type) return false
      if (filter?.tags && !filter.tags.every((tag) => e.tags?.includes(tag))) return false
      return true
    })
    return filtered.map((e) => ({
      name: e.name,
      description: e.description,
      tags: e.tags || [],
      type: e.type || 'capability',
      turnCount: e.conversation.length,
      hasOutcome: !!e.outcome,
    }))
  }

  async getEval(name: string): Promise<EvalDefinition | null> {
    const defs = await this.getEvalDefinitions()
    return defs.find((e) => e.name === name) ?? null
  }

  // ── Run lifecycle — write ───────────────────────────────────────────

  async createRun(
    runType: 'manual' | 'scheduled' = 'scheduled',
    options?: EvalRunCreateOptions
  ): Promise<string> {
    if (runType !== 'manual' && runType !== 'scheduled') {
      throw new VortexEvalStoreError('Vortex eval triggerType is malformed', 'configuration')
    }
    if (!isSafeIdentifier(options?.workflowId, MAX_EVAL_NAME_BYTES)) {
      throw new VortexEvalStoreError('workflowId is required to create a Vortex eval run', 'configuration')
    }
    if (!options?.definitions) {
      throw new VortexEvalStoreError('hosted eval definitions are required before creating a run', 'configuration')
    }
    validateHostedEvalDefinitions(options.definitions)
    const evalManifestId =
      typeof this._evalManifestId === 'function' ? this._evalManifestId() : this._evalManifestId
    if (!isSafeIdentifier(evalManifestId, MAX_EVAL_NAME_BYTES)) {
      throw new VortexEvalStoreError('evalManifestId is required to create a Vortex eval run', 'configuration')
    }

    const res = await this.fetch(`/v1/evals/bot/${encodeURIComponent(this.botId)}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evalManifestId,
        workflowId: options.workflowId,
        triggerType: runType,
      }),
    })
    const data = await this.responseJson<{ id?: unknown }>(res, 'create run')
    return this.requireDatabaseId(data.id, 'create run', 'upstream')
  }

  async addRunResults(runId: string, evalReport: EvalReport): Promise<void> {
    validateReportProjection([evalReport])
    await this.reconcileEvalReport(runId, evalReport)
  }

  /**
   * Required final reconciliation. Every live lifecycle write is replayed with
   * the same safe projection before the run becomes terminal. The server makes
   * identical replays idempotent and rejects divergent ones with 409.
   */
  async reconcileRunResults(runId: string, report: EvalRunReport): Promise<void> {
    validateReportProjection(report.evals)
    for (const evalReport of report.evals) {
      await this.reconcileEvalReport(runId, evalReport)
    }
  }

  async completeRun(runId: string, report: EvalRunReport): Promise<void> {
    await this.reconcileRunResults(runId, report)
    const firstExecutionError = report.aborted
      ? 'aborted'
      : report.evals
          .map((evalReport) => classifyVortexEvalReport(evalReport))
          .find((kind) => kind !== undefined)
    await this.markRunComplete(runId, {
      ...(report.aborted ? { aborted: true } : {}),
      ...(firstExecutionError ? { errorKind: firstExecutionError } : {}),
    })
  }

  private async reconcileEvalReport(runId: string, evalReport: EvalReport): Promise<void> {
    const entryId = await this.startEntry(runId, {
      evalName: evalReport.name,
      evalType: evalReport.type ?? 'capability',
      tags: evalReport.tags ?? [],
    })
    for (const turn of evalReport.turns) {
      await this.appendTurnResults(runId, entryId, turn)
    }
    await this.appendOutcomeResults(runId, entryId, evalReport.outcomeAssertions)
    const errorKind = classifyVortexEvalReport(evalReport)
    await this.finalizeEntry(runId, entryId, {
      passed: evalReport.pass,
      durationMs: evalReport.duration,
      ...(errorKind ? { errorKind } : {}),
    })
  }

  // ── Per-turn incremental lifecycle (Option B) ──
  //
  // The eval-runner workflow builds each entry up as the eval runs (rather than
  // writing it whole at the end), so the dev console can stream turn-by-turn
  // progress. This is the prod ingestion path and requires Vortex to provide:
  //   startEntry        POST  /runs/{runId}/entries                    → { entries:[{ id }] }  (passed:null, in-progress)
  //   appendTurnResults POST  /runs/{runId}/entries/{entryId}/results  (idempotent by turnIndex+resultIndex)
  //   finalizeEntry     PATCH /runs/{runId}/entries/{entryId}          (sets the verdict)
  //   markRunComplete   POST  /runs/{runId}/complete                   (status → completed|failed)

  /** Create an in-progress entry (metadata only, no results) and return its server id. */
  async startEntry(
    runId: string,
    meta: { evalName: string; evalType?: 'capability' | 'regression'; tags?: string[] }
  ): Promise<string> {
    validateEntryProjection(meta)
    const safeRunId = this.requireDatabaseId(runId, 'run')
    const res = await this.fetch(`/v1/evals/runs/${safeRunId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [
          {
            evalName: meta.evalName,
            evalType: meta.evalType ?? 'capability',
            tags: meta.tags ?? [],
          },
        ],
      }),
    })

    const data = await this.responseJson<{ entries?: Array<{ id?: unknown }> }>(res, 'start entry')
    return this.requireDatabaseId(data.entries?.[0]?.id, 'start entry', 'upstream')
  }

  /** Append one turn's grader results to an existing entry. */
  async appendTurnResults(runId: string, entryId: string, turn: TurnReport): Promise<void> {
    const results = turnToResultRows(turn)
    if (results.length === 0) return
    validateResultBatch(results)
    const safeRunId = this.requireDatabaseId(runId, 'run')
    const safeEntryId = this.requireDatabaseId(entryId, 'entry')
    const res = await this.fetch(`/v1/evals/runs/${safeRunId}/entries/${safeEntryId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    })
    await this.requireOkResponse(res, 'append results')
  }

  /** Append outcome-level grader results to an existing entry. */
  async appendOutcomeResults(runId: string, entryId: string, assertions: GraderResult[]): Promise<void> {
    if (assertions.length === 0) return

    const results = outcomeToResultRows(assertions)
    validateResultBatch(results)

    const safeRunId = this.requireDatabaseId(runId, 'run')
    const safeEntryId = this.requireDatabaseId(entryId, 'entry')
    const res = await this.fetch(`/v1/evals/runs/${safeRunId}/entries/${safeEntryId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results }),
    })

    await this.requireOkResponse(res, 'append outcome results')
  }

  /** Set the verdict on an entry once its eval finishes. */
  async finalizeEntry(
    runId: string,
    entryId: string,
    verdict: { passed: boolean; durationMs?: number; errorKind?: VortexEvalErrorKind }
  ): Promise<void> {
    if (verdict.durationMs !== undefined && !validDuration(verdict.durationMs)) {
      configFailure('hosted eval durationMs is invalid')
    }
    if (verdict.errorKind !== undefined && !ERROR_KIND_SET.has(verdict.errorKind)) {
      configFailure('hosted eval errorKind is invalid')
    }
    const safeRunId = this.requireDatabaseId(runId, 'run')
    const safeEntryId = this.requireDatabaseId(entryId, 'entry')
    const res = await this.fetch(`/v1/evals/runs/${safeRunId}/entries/${safeEntryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passed: verdict.passed,
        ...(verdict.durationMs !== undefined ? { durationMs: verdict.durationMs } : {}),
        ...(verdict.errorKind !== undefined ? { errorKind: verdict.errorKind } : {}),
      }),
    })
    await this.requireOkResponse(res, 'finalize entry')
  }

  /** Flip the run to its terminal status. Identical terminal replays are safe. */
  async markRunComplete(
    runId: string,
    opts: { aborted?: boolean; errorKind?: VortexEvalErrorKind } = {}
  ): Promise<void> {
    if (opts.errorKind !== undefined && !ERROR_KIND_SET.has(opts.errorKind)) {
      configFailure('hosted eval errorKind is invalid')
    }
    if (opts.aborted && opts.errorKind !== undefined && opts.errorKind !== 'aborted') {
      throw new VortexEvalStoreError('aborted eval runs may only use errorKind=aborted', 'configuration')
    }
    if (!opts.aborted && opts.errorKind === 'aborted') {
      throw new VortexEvalStoreError('errorKind=aborted requires aborted=true', 'configuration')
    }
    const safeRunId = this.requireDatabaseId(runId, 'run')
    const res = await this.fetch(`/v1/evals/runs/${safeRunId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(opts.aborted !== undefined ? { aborted: opts.aborted } : {}),
        ...(opts.errorKind !== undefined ? { errorKind: opts.errorKind } : {}),
      }),
    })
    await this.requireOkResponse(res, 'complete run')
  }

  // ── Run results — read ─────────────────────────────────────────────

  async loadRunResult(runId: string): Promise<EvalRunReport | null> {
    const data = await this.fetchJson<VortexRunWithEntries>(`/v1/evals/runs/${runId}`)
    return vortexRunToReport(data)
  }

  async getLatestRun(): Promise<EvalRunReport | null> {
    const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(
      `/v1/evals/bot/${encodeURIComponent(this.botId)}/runs`,
      { limit: '1' }
    )
    if (!data.runs.length) return null
    const latest = data.runs[0]!
    return this.loadRunResult(latest.id)
  }

  async listRunSummaries(opts?: { limit?: number; since?: number }): Promise<EvalRunSummary[]> {
    // Vortex's list endpoint returns runs WITHOUT entries, so summary counts
    // would all be zero — which the heatmap renders as "No evals". Pull each
    // run's entries to compute real pass/fail/total. N+1, bounded by the list
    // size; a counts field on the list endpoint would let us drop the per-run
    // fetch.
    const runs = await this.fetchRunsWithEntries(opts?.limit ?? 50, opts?.since)
    return runs.map(vortexRunToSummary)
  }

  async listEvalReportsByName(
    evalName: string,
    opts?: { limit?: number; since?: number }
  ): Promise<EvalReportHistoryEntry[]> {
    const limit = opts?.limit ?? 20
    const runs = await this.fetchRunsWithEntries(50, opts?.since)

    const entries: EvalReportHistoryEntry[] = []
    for (const run of runs) {
      if (entries.length >= limit) break
      const entry = run.entries.find((e) => e.evalName === evalName)
      if (entry) {
        entries.push({
          runId: run.id,
          timestamp: run.createdAt,
          report: vortexEntryToEvalReport(entry),
          totalEvalsInRun: run.entries.length,
        })
      }
    }
    return entries
  }

  async listEvalReportsBulk(opts?: {
    perEval?: number
    since?: number
  }): Promise<Record<string, EvalReportHistoryEntry[]>> {
    const per = opts?.perEval ?? 20
    const runs = await this.fetchRunsWithEntries(50, opts?.since)

    const grouped: Record<string, EvalReportHistoryEntry[]> = {}
    for (const run of runs) {
      for (const entry of run.entries) {
        if (!grouped[entry.evalName]) grouped[entry.evalName] = []
        if (grouped[entry.evalName]!.length < per) {
          grouped[entry.evalName]!.push({
            runId: run.id,
            timestamp: run.createdAt,
            report: vortexEntryToEvalReport(entry),
            totalEvalsInRun: run.entries.length,
          })
        }
      }
    }
    return grouped
  }

  // ── Live run tracking ──────────────────────────────────────────────

  async *watchRun(signal?: AbortSignal, options: EvalWatchOptions = {}): AsyncIterable<EvalProgressEvent> {
    // Poll fast enough that batched turns don't arrive in a single visible
    // burst — the prod path can't push per-event like the dev SSE stream, so a
    // tighter cadence is what keeps it feeling live.
    const POLL_INTERVAL = 1_500
    const POLL_TIMEOUT = 60 * 60 * 1_000 // 60min
    const start = Date.now()

    // Capture the run that's already the latest before this invocation begins.
    // The eval-runner workflow now creates its Vortex run UP FRONT (before
    // running the suite), so a genuinely new run appears almost immediately —
    // but until it does, the "latest" run is the PREVIOUS one. Reporting that
    // would surface a stale, mismatched run (the runner shows eval "A" while
    // watchRun reports the prior run of eval "B", and the per-eval replay
    // filter renders "no results"). Only act on a run whose id differs from
    // this baseline.
    const hasExpectedRun = !!options.runId || !!options.workflowId
    let baselineRunId: string | null = null
    if (!hasExpectedRun) {
      try {
        const initial = await this.fetchJson<{ runs: VortexEvalRun[] }>(
          `/v1/evals/bot/${encodeURIComponent(this.botId)}/runs`,
          { limit: '1' }
        )
        baselineRunId = initial.runs[0]?.id ?? null
      } catch {
        // Couldn't read the baseline; fall back to reporting the first completed run.
      }
    }

    // Diff the run on every poll and stream progress: `eval_start` when an
    // entry first appears, `turn_start` for the next in-flight turn (synthesized
    // from the definition so the pending-turn UI shows before results land),
    // `turn_complete` as each turn's results arrive, and `eval_complete` once
    // the entry is finalized (verdict set → `passed` is non-null).
    // `suite_complete` fires when the run reaches a terminal status. (Depends on
    // the per-turn lifecycle endpoints; see the write methods above.)
    const evalMeta = await this.loadEvalMeta()
    const startedEvals = new Set<string>()
    const seenTurns = new Set<string>()
    const startedTurns = new Set<string>()
    const finalizedEvals = new Set<string>()

    while (!signal?.aborted && Date.now() - start < POLL_TIMEOUT) {
      try {
        const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(
          `/v1/evals/bot/${encodeURIComponent(this.botId)}/runs`,
          { limit: hasExpectedRun ? '20' : '1' }
        )
        let latest: VortexEvalRun | null = null
        let raw: VortexRunWithEntries | null = null
        for (const candidate of data.runs) {
          if (options.runId && candidate.id !== options.runId) continue
          if (options.workflowId && candidate.workflowId !== options.workflowId) {
            const candidateRaw = await this.fetchJson<VortexRunWithEntries>(`/v1/evals/runs/${candidate.id}`)
            if (!runMatchesWatchOptions(candidateRaw, options)) continue
            raw = candidateRaw
          }
          latest = candidate
          break
        }

        // Still seeing the pre-existing run (or none yet) — the new run hasn't
        // been created. Wait and retry.
        if (!latest || (!hasExpectedRun && latest.id === baselineRunId)) {
          await new Promise((r) => setTimeout(r, POLL_INTERVAL))
          continue
        }

        raw ??= await this.fetchJson<VortexRunWithEntries>(`/v1/evals/runs/${latest.id}`)
        const terminal = raw.status === 'completed' || raw.status === 'failed'

        for (let i = 0; i < raw.entries.length; i++) {
          const entry = raw.entries[i]!
          const evalReport = vortexEntryToEvalReport(entry)
          const meta = evalMeta.get(entry.evalName)
          const totalTurns = meta?.totalTurns ?? evalReport.turns.length

          if (!startedEvals.has(entry.evalName)) {
            startedEvals.add(entry.evalName)
            yield { type: 'eval_start', evalName: entry.evalName, index: i, totalTurns }
          }
          for (const turn of evalReport.turns) {
            const turnKey = `${entry.evalName}::${turn.turnIndex}`
            if (seenTurns.has(turnKey)) continue
            seenTurns.add(turnKey)
            yield {
              type: 'turn_complete',
              evalName: entry.evalName,
              evalIndex: i,
              turnIndex: turn.turnIndex,
              totalTurns,
              turnReport: turn,
            }
          }
          // Verdict set (passed non-null) → the eval is done.
          if (entry.passed != null && !finalizedEvals.has(entry.evalName)) {
            finalizedEvals.add(entry.evalName)
            yield { type: 'eval_complete', evalName: entry.evalName, index: i, report: evalReport }
          } else if (entry.passed == null && !terminal) {
            // Still running: announce the next expected turn so the UI renders
            // the in-flight turn (its user message + spinner) instead of jumping
            // straight from completed turns to the next completed turn. Results
            // land per-turn, so the next index is simply the completed count.
            const nextTurnIndex = evalReport.turns.length
            const startKey = `${entry.evalName}::${nextTurnIndex}`
            if (nextTurnIndex < totalTurns && !startedTurns.has(startKey)) {
              startedTurns.add(startKey)
              yield {
                type: 'turn_start',
                evalName: entry.evalName,
                evalIndex: i,
                turnIndex: nextTurnIndex,
                totalTurns,
                userMessage: meta?.userMessages[nextTurnIndex] ?? '',
              }
            }
          }
        }

        if (terminal) {
          const finalReport = vortexRunToReport(raw)
          // Flush any eval that never received an explicit verdict (e.g. it
          // errored out before finalizeEntry was called).
          for (let i = 0; i < finalReport.evals.length; i++) {
            const evalReport = finalReport.evals[i]!
            if (finalizedEvals.has(evalReport.name)) continue
            finalizedEvals.add(evalReport.name)
            yield { type: 'eval_complete', evalName: evalReport.name, index: i, report: evalReport }
          }
          yield {
            type: 'suite_complete',
            report: finalReport,
            error: raw.status === 'failed' ? 'Eval run failed' : undefined,
          }
          return
        }
      } catch {
        // Poll failed, retry next interval
      }

      // Settled-but-not-terminal poll (or a failed poll): wait before the next.
      // The "no new run yet" branch above already slept and continued, so this
      // is the only other delay point.
      await new Promise((r) => setTimeout(r, POLL_INTERVAL))
    }

    if (!signal?.aborted) {
      yield {
        type: 'suite_complete',
        report: {
          id: 'timeout',
          timestamp: new Date().toISOString(),
          evals: [],
          passed: 0,
          failed: 0,
          total: 0,
          duration: 0,
        },
        error: 'Eval run timed out',
      }
    }
  }

  // ── Runner state ───────────────────────────────────────────────────

  async getRunnerState(): Promise<{ running: boolean; runId: string | null }> {
    try {
      const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(
        `/v1/evals/bot/${encodeURIComponent(this.botId)}/runs`,
        { status: 'running', limit: '1' }
      )
      const active = data.runs[0] ?? null
      return { running: !!active, runId: active?.id ?? null }
    } catch {
      return { running: false, runId: null }
    }
  }

  // ── Internal helpers ───────────────────────────────────────────────

  private async getEvalDefinitions(): Promise<EvalDefinition[]> {
    if (!this._loadEvalDefinitions) return []
    return this._loadEvalDefinitions()
  }

  /**
   * evalName → { totalTurns, userMessages } from the eval definitions, so
   * watchRun can report `totalTurns` and synthesize `turn_start` events (with
   * the turn's user message) for the in-flight turn — matching the dev SSE
   * experience where the pending turn is visible before its results land.
   */
  private async loadEvalMeta(): Promise<Map<string, { totalTurns: number; userMessages: string[] }>> {
    try {
      const defs = await this.getEvalDefinitions()
      return new Map(
        defs.map((d) => [
          d.name,
          { totalTurns: d.conversation.length, userMessages: d.conversation.map((t) => t.user ?? '') },
        ])
      )
    } catch {
      return new Map()
    }
  }

  private async fetchRunsWithEntries(limit: number, since?: number): Promise<VortexRunWithEntries[]> {
    const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(
      `/v1/evals/bot/${encodeURIComponent(this.botId)}/runs`,
      { limit: String(limit) }
    )

    let runs = data.runs
    if (since) {
      runs = runs.filter((r) => new Date(r.createdAt).getTime() >= since)
    }

    // The list endpoint omits entries, so fetch each run's detail. Bounded
    // concurrency keeps a wide `since` window from opening hundreds of sockets.
    return mapWithConcurrency(runs, 8, (r) => this.fetchJson<VortexRunWithEntries>(`/v1/evals/runs/${r.id}`))
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const target = new URL(`${this.url}${path}`)
    return this.request(target, init)
  }

  private async request(target: URL, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${this.token}`)
    if (this.development) headers.set('x-bot-id', this.botId)

    let response: Response
    try {
      response = await globalThis.fetch(target, { ...init, headers })
    } catch {
      throw new VortexEvalStoreError('Vortex eval store request failed before receiving a response', 'upstream')
    }
    if (!response.ok) {
      throw new VortexEvalStoreError(
        `Vortex eval store request failed (HTTP ${response.status})`,
        httpErrorKind(response.status),
        response.status
      )
    }
    return response
  }

  private async responseJson<T>(response: Response, operation: string): Promise<T> {
    try {
      return (await response.json()) as T
    } catch {
      throw new VortexEvalStoreError(`Vortex ${operation} response is malformed`, 'upstream')
    }
  }

  private async requireOkResponse(response: Response, operation: string): Promise<void> {
    const data = await this.responseJson<{ ok?: unknown }>(response, operation)
    if (data.ok !== true) {
      throw new VortexEvalStoreError(`Vortex ${operation} response is malformed`, 'upstream')
    }
  }

  private requireDatabaseId(
    value: unknown,
    operation: string,
    kind: VortexEvalErrorKind = 'configuration'
  ): string {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
      throw new VortexEvalStoreError(`Vortex ${operation} has a malformed id`, kind)
    }
    if (BigInt(value) > 9_223_372_036_854_775_807n) {
      throw new VortexEvalStoreError(`Vortex ${operation} has a malformed id`, kind)
    }
    return value
  }

  private async fetchJson<T>(path: string, params?: Record<string, string>): Promise<T> {
    const target = new URL(`${this.url}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
    }
    const res = await this.request(target)
    return this.responseJson<T>(res, 'read')
  }
}
