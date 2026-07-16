import type { EvalRunListParams } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { CloudCommand, type EvalCloudTarget } from './cloud-command'
import { prepareHostedEvalManifest } from '../eval-manifest-prepare'
import { aggregateRepeatedEvals, runWithConcurrency, type RepeatedEvalAttempt } from '../eval-repeat'

const POSITIVE_DECIMAL = /^[1-9][0-9]*$/
const SAFE_IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const SAFE_MODEL = /^[A-Za-z0-9][A-Za-z0-9._:/-]*$/
const CURSOR = /^[A-Za-z0-9_-]+$/
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const TRACE_ID = /^[0-9a-f]{32}$/i
const MAX_DATABASE_ID = 9_223_372_036_854_775_807n
const MAX_RUNS = 100
const MAX_DURATION_MS = 86_400_000
const POLL_INTERVAL_MS = 3_000

const EVAL_DIAGNOSTIC_HINTS: Readonly<Record<string, string>> = {
  CHAT_PAYLOAD_INVALID:
    'message payload could not be decoded for eval grading; upgrade brt and @holocronlab/botruntime-evals together, rebuild the agent, then inspect the correlated trace',
  CHAT_LISTENER_FAILED:
    'the response listener stopped during the turn; check tunnel connectivity and inspect the correlated trace',
  EVAL_RELATION_NOT_FOUND:
    'the declared conversation relation did not resolve; verify its integration, channel, and tag selectors',
  EVAL_RELATION_AMBIGUOUS:
    'the declared conversation relation matched more than one conversation; make its tag selector unique',
}

const RUN_STATUSES = ['pending', 'running', 'completed', 'failed'] as const
const WORKFLOW_STATUSES = [
  'pending',
  'in_progress',
  'listening',
  'paused',
  'completed',
  'failed',
  'timedout',
  'cancelled',
] as const
const ERROR_KINDS = [
  'aborted',
  'configuration',
  'auth',
  'trace_reader',
  'chat',
  'timeout',
  'upstream',
  'internal',
] as const
const ERROR_PHASES = ['setup', 'routing', 'dispatch', 'observation', 'grading'] as const
const ASSERTION_KINDS = [
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
  'delivered_to',
  'not_delivered_to',
  'conversation_mode',
  'outcome',
  'unknown',
] as const

type RunStatus = (typeof RUN_STATUSES)[number]
type ErrorKind = (typeof ERROR_KINDS)[number]
type AssertionKind = (typeof ASSERTION_KINDS)[number]

type EvalRunSummary = {
  id: string
  botId: string
  workspaceId: string
  evalManifestId: string
  workflowId: string
  status: RunStatus
  triggerType: 'manual' | 'scheduled'
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string
  aborted: boolean
  errorKind: ErrorKind | null
}

type EvalResult = {
  id: string
  evalEntryId: string
  turnIndex: number
  resultIndex: number
  assertionKind: AssertionKind
  passed: boolean
  skipped: boolean
  score: number | null
  botDurationMs: number | null
  graderDurationMs: number | null
  conversationId?: string | null
  traceId?: string | null
  createdAt: string
}

type EvalEntry = {
  id: string
  evalRunId: string
  evalName: string
  evalType: 'capability' | 'regression'
  tags: string[]
  passed: boolean | null
  durationMs: number | null
  errorKind: ErrorKind | null
  errorCode?: string | null
  errorPhase?: (typeof ERROR_PHASES)[number] | null
  errorTurnIndex?: number | null
  conversationId?: string | null
  traceId?: string | null
  createdAt: string
  results: EvalResult[]
}

type EvalRunDetail = EvalRunSummary & { entries: EvalEntry[] }
type EvalTarget = EvalCloudTarget & {
  runtimeHeader?: string
}

type EvalDefinition = typeof commandDefinitions.eval.subcommands.run | typeof commandDefinitions.eval.subcommands.runs

abstract class EvalCloudCommand<C extends EvalDefinition> extends CloudCommand<C> {
  protected async resolveEvalTarget(): Promise<EvalTarget> {
    if (this.argv.local && !this.argv.dev) {
      throw new errors.BotpressCLIError(
        '--local requires --dev for hosted eval commands; production and development targets cannot be mixed'
      )
    }
    const target = await this.evalCloudapiTarget()
    return {
      ...target,
      ...('runtimeBotId' in target ? { runtimeHeader: target.runtimeBotId } : {}),
    }
  }

  protected printDetail(target: EvalTarget, run: EvalRunDetail): void {
    const output = { schemaVersion: 1, target: target.output, run }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }
    this.logger.log(`Eval run ${run.id}  ${run.status}  ${run.triggerType}  ${run.createdAt}`)
    for (const entry of run.entries) {
      const verdict = entry.passed === null ? 'RUNNING' : entry.passed ? 'PASS' : 'FAIL'
      this.logger.log(`  ${verdict}  ${entry.evalName}  type=${entry.evalType}  durationMs=${entry.durationMs ?? '-'}`)
      if (this.argv.verbose) {
        if (entry.errorCode && entry.errorPhase) {
          this.logger.log(
            `    diagnostic code=${entry.errorCode}  phase=${entry.errorPhase}  turn=${entry.errorTurnIndex ?? '-'}`
          )
          const hint = EVAL_DIAGNOSTIC_HINTS[entry.errorCode]
          if (hint) this.logger.log(`    hint: ${hint}`)
        }
        const correlatedResult = entry.results.find((result) => result.conversationId)
        const correlation = entry.conversationId
          ? { conversationId: entry.conversationId, traceId: entry.traceId }
          : correlatedResult
        if (correlation?.conversationId) {
          const targetFlag = target.output.environment === 'development' ? ' --dev' : ''
          const traceFlag = correlation.traceId ? ` --trace-id ${correlation.traceId}` : ''
          this.logger.log(
            `    inspect: brt traces${targetFlag}${traceFlag} --conversation-id ${correlation.conversationId}`
          )
        }
        for (const result of entry.results) {
          const resultVerdict = result.skipped ? 'SKIP' : result.passed ? 'PASS' : 'FAIL'
          this.logger.log(
            `    turn=${result.turnIndex}  ${resultVerdict}  ${result.assertionKind}  botMs=${result.botDurationMs ?? '-'}  graderMs=${result.graderDurationMs ?? '-'}`
          )
        }
      }
    }
  }
}

export type EvalRunsCommandDefinition = typeof commandDefinitions.eval.subcommands.runs

export class EvalRunsCommand extends EvalCloudCommand<EvalRunsCommandDefinition> {
  public async run(): Promise<void> {
    const limit = requireIntegerInRange('limit', this.argv.limit, 1, MAX_RUNS)
    const runId = this.argv.runId === undefined ? undefined : requireDatabaseId(this.argv.runId, 'run id')
    const status = this.argv.status === undefined ? undefined : requireEnum(this.argv.status, RUN_STATUSES, '--status')
    if (this.argv.latest && runId !== undefined) {
      throw new errors.BotpressCLIError('--latest cannot be combined with a run ID')
    }
    if (this.argv.nextToken !== undefined) requireCursor(this.argv.nextToken, '--next-token')
    if ((runId !== undefined || this.argv.latest) && (status !== undefined || this.argv.nextToken !== undefined)) {
      throw new errors.BotpressCLIError(
        '--status and --next-token are list filters and cannot be combined with a run detail selector'
      )
    }

    this.logger.debug('Resolving hosted eval target')
    const target = await this.resolveEvalTarget()
    if (runId !== undefined) {
      const detail = parseEvalRunDetail(await target.client.getEvalRun(runId, target.runtimeHeader))
      this.printDetail(target, detail)
      return
    }

    if (this.argv.latest) {
      const page = parseEvalRunPage(
        await target.client.listEvalRuns(target.selector, { limit: 1 }, target.runtimeHeader),
        1
      )
      if (page.runs.length === 0) {
        const output = { schemaVersion: 1, target: target.output, run: null }
        if (this.argv.json) this.logger.json(output)
        else this.logger.log('No hosted eval runs found.')
        return
      }
      const detail = parseEvalRunDetail(await target.client.getEvalRun(page.runs[0]!.id, target.runtimeHeader))
      this.printDetail(target, detail)
      return
    }

    const params: EvalRunListParams = {
      limit,
      ...(status !== undefined ? { status } : {}),
      ...(this.argv.nextToken !== undefined ? { nextToken: this.argv.nextToken } : {}),
    }
    const page = parseEvalRunPage(
      await target.client.listEvalRuns(target.selector, params, target.runtimeHeader),
      limit
    )
    const output = {
      schemaVersion: 1,
      target: target.output,
      runs: page.runs,
      nextToken: page.nextToken ?? null,
    }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }
    for (const item of page.runs) {
      this.logger.log(`${item.id}  ${item.status}  ${item.triggerType}  ${item.createdAt}`)
    }
    if (page.nextToken) this.logger.log(`Next token: ${page.nextToken}`)
  }
}

export type EvalRunCommandDefinition = typeof commandDefinitions.eval.subcommands.run

export class EvalRunCommand extends EvalCloudCommand<EvalRunCommandDefinition> {
  public async run(): Promise<void> {
    const timeout = requireIntegerInRange('timeout', this.argv.timeout, 1_000, 3_600_000)
    const name = optionalIdentifier(this.argv.name, 'eval name', 128)
    const tag = optionalIdentifier(this.argv.tag, 'eval tag', 64)
    const judgeModel = optionalModel(this.argv.judgeModel)
    const repeat = requireIntegerInRange('repeat', this.argv.repeat ?? 1, 1, 100)
    const maxConcurrency = requireIntegerInRange('max-concurrency', this.argv.maxConcurrency ?? 1, 1, 10)
    const minPassRate = requirePassRate(this.argv.minPassRate ?? 1)
    const evalType =
      this.argv.type === undefined
        ? undefined
        : requireEnum(this.argv.type, ['capability', 'regression'] as const, '--type')
    this.logger.debug('Resolving hosted eval target')
    const target = await this.resolveEvalTarget()
    if ('runtimeBotId' in target) {
      this.logger.debug('Checking development tunnel readiness')
      await target.client.requireEvalBotReady(target.runtimeBotId)
    }
    this.logger.debug('Preparing hosted eval manifest and attachment fixtures')
    const apiBotId = target.output.environment === 'development' ? target.output.targetBotId : target.output.botId
    const manifest = await prepareHostedEvalManifest({
      projectDir: this.projectDir,
      botId: apiBotId,
      workspaceId: target.output.workspaceId,
      client: target.client.sdkClient(apiBotId, target.output.workspaceId),
    })
    this.logger.debug(`Hosted eval manifest ready (${manifest.manifestFileId})`)

    const filter = {
      ...(name !== undefined ? { names: [name] } : {}),
      ...(tag !== undefined ? { tags: [tag] } : {}),
      ...(evalType !== undefined ? { type: evalType } : {}),
    }
    const input = {
      ...(Object.keys(filter).length > 0 ? { filter } : {}),
      runType: 'manual',
      evalManifestId: manifest.manifestFileId,
      ...(judgeModel !== undefined ? { judgeModel } : {}),
    }
    const attempts = await runWithConcurrency(
      Array.from({ length: repeat }, () => () => this.runAttempt(target, input, timeout)),
      maxConcurrency
    )

    if (attempts.length === 1) {
      const attempt = attempts[0]!
      this.printDetail(target, attempt.detail)
      if (!attempt.summary.passed) {
        throw new errors.BotpressCLIError(
          `hosted eval suite failed (${attempt.completion.failed} failed eval${attempt.completion.failed === 1 ? '' : 's'}); inspect \`brt eval runs ${attempt.detail.id} --verbose\` and \`brt traces\``
        )
      }
      return
    }

    const aggregate = aggregateRepeatedEvals(attempts.map((attempt) => attempt.summary))
    if (this.argv.json) {
      this.logger.json({ schemaVersion: 1, target: target.output, aggregate })
    } else {
      this.logger.log(
        `Repeated evals: ${aggregate.passedRuns}/${aggregate.repeat} passed (${aggregate.passRate.toFixed(3)}), ${aggregate.classification}`
      )
      this.logger.log(`Latency: p50=${aggregate.p50DurationMs}ms p95=${aggregate.p95DurationMs}ms`)
      for (const [assertion, count] of Object.entries(aggregate.failureHistogram).sort()) {
        this.logger.log(`  ${assertion}: ${count}`)
      }
    }
    if (aggregate.passRate < minPassRate) {
      throw new errors.BotpressCLIError(
        `hosted eval pass rate ${aggregate.passRate.toFixed(3)} is below required ${minPassRate.toFixed(3)}`
      )
    }
  }

  private async runAttempt(
    target: EvalTarget,
    input: Record<string, unknown>,
    timeout: number
  ): Promise<{
    completion: ReturnType<typeof parseWorkflowCompletion>
    detail: EvalRunDetail
    summary: RepeatedEvalAttempt
  }> {
    this.logger.debug('Creating hosted eval workflow')
    const created = parseWorkflowResponse(
      await target.client.createEvalWorkflow(
        {
          name: 'builtin_eval_runner',
          status: 'pending',
          input,
          timeoutAt: new Date(Date.now() + timeout).toISOString(),
        },
        target.runtimeHeader
      )
    )
    this.logger.debug(`Hosted eval workflow created (${created.id})`)

    const deadline = Date.now() + timeout
    while (Date.now() <= deadline) {
      const current = parseWorkflowResponse(await target.client.getEvalWorkflow(created.id, target.runtimeHeader))
      if (current.status === 'completed') {
        const completion = parseWorkflowCompletion(current.output)
        const detail = parseEvalRunDetail(await target.client.getEvalRun(completion.runId, target.runtimeHeader))
        const passed = !(
          completion.failed > 0 ||
          detail.status === 'failed' ||
          detail.entries.some((item) => item.passed === false)
        )
        return {
          completion,
          detail,
          summary: {
            id: detail.id,
            passed,
            duration: completion.duration,
            failedAssertions: detail.entries.flatMap((entry) =>
              entry.results.filter((result) => !result.passed && !result.skipped).map((result) => result.assertionKind)
            ),
          },
        }
      }
      if (current.status === 'failed' || current.status === 'timedout' || current.status === 'cancelled') {
        if (current.failureCode === 'delivery_unavailable') {
          throw new errors.BotpressCLIError(
            'hosted eval workflow delivery unavailable; verify that `brt dev` is still running and the development tunnel is connected, then retry'
          )
        }
        throw new errors.BotpressCLIError(
          `hosted eval workflow ${current.status}; redeploy the bot to refresh its eval manifest, then inspect runtime traces and retry`
        )
      }
      await sleep(Math.min(POLL_INTERVAL_MS, Math.max(0, deadline - Date.now())))
    }
    throw new errors.BotpressCLIError(
      `hosted eval workflow timed out after ${timeout}ms; inspect \`brt eval runs --latest\` and runtime traces before retrying`
    )
  }
}

function parseEvalRunPage(value: unknown, limit: number): { runs: EvalRunSummary[]; nextToken?: string } {
  if (!isRecord(value) || !Array.isArray(value.runs) || value.runs.length > limit) {
    throw new errors.BotpressCLIError('hosted eval response runs are malformed')
  }
  if (value.nextToken !== undefined && typeof value.nextToken !== 'string') {
    throw new errors.BotpressCLIError('hosted eval response nextToken is malformed')
  }
  if (value.nextToken !== undefined) requireCursor(value.nextToken, 'hosted eval response nextToken')
  return {
    runs: value.runs.map((item) => parseEvalRunSummary(item)),
    ...(value.nextToken !== undefined ? { nextToken: value.nextToken } : {}),
  }
}

function parseEvalRunDetail(value: unknown): EvalRunDetail {
  const summary = parseEvalRunSummary(value)
  if (!isRecord(value) || !Array.isArray(value.entries) || value.entries.length > 128) {
    throw new errors.BotpressCLIError('hosted eval response has malformed entries')
  }
  return {
    ...summary,
    entries: value.entries.map((item) => parseEvalEntry(item, summary.id)),
  }
}

function parseEvalRunSummary(value: unknown): EvalRunSummary {
  if (!isRecord(value)) throw new errors.BotpressCLIError('hosted eval run is malformed')
  return {
    id: requireDatabaseId(value.id, 'run id'),
    botId: requireIdentifier(value.botId, 'botId', 128),
    workspaceId: requireDatabaseId(value.workspaceId, 'workspaceId'),
    evalManifestId: requireIdentifier(value.evalManifestId, 'evalManifestId', 128),
    workflowId: requireIdentifier(value.workflowId, 'workflowId', 128),
    status: requireEnum(value.status, RUN_STATUSES, 'status'),
    triggerType: requireEnum(value.triggerType, ['manual', 'scheduled'] as const, 'triggerType'),
    startedAt: requireNullableTimestamp(value.startedAt, 'startedAt'),
    completedAt: requireNullableTimestamp(value.completedAt, 'completedAt'),
    createdAt: requireTimestamp(value.createdAt, 'createdAt'),
    updatedAt: requireTimestamp(value.updatedAt, 'updatedAt'),
    expiresAt: requireTimestamp(value.expiresAt, 'expiresAt'),
    aborted: requireBoolean(value.aborted, 'aborted'),
    errorKind: requireNullableEnum(value.errorKind, ERROR_KINDS, 'errorKind'),
  }
}

function parseEvalEntry(value: unknown, runId: string): EvalEntry {
  if (!isRecord(value)) throw new errors.BotpressCLIError('hosted eval entry is malformed')
  const id = requireDatabaseId(value.id, 'entry id')
  const evalRunId = requireDatabaseId(value.evalRunId, 'evalRunId')
  if (evalRunId !== runId) throw new errors.BotpressCLIError('hosted eval entry has a malformed evalRunId')
  if (!Array.isArray(value.tags) || value.tags.length > 32) {
    throw new errors.BotpressCLIError('hosted eval entry has malformed tags')
  }
  if (!Array.isArray(value.results) || value.results.length > 1_024) {
    throw new errors.BotpressCLIError('hosted eval entry has malformed results')
  }
  return {
    id,
    evalRunId,
    evalName: requireIdentifier(value.evalName, 'evalName', 128),
    evalType: requireEnum(value.evalType, ['capability', 'regression'] as const, 'evalType'),
    tags: value.tags.map((tag) => requireIdentifier(tag, 'tag', 64)),
    passed: requireNullableBoolean(value.passed, 'passed'),
    durationMs: requireNullableDuration(value.durationMs, 'durationMs'),
    errorKind: requireNullableEnum(value.errorKind, ERROR_KINDS, 'errorKind'),
    ...(value.errorCode !== undefined
      ? {
          errorCode: requireOptionalNullableIdentifier(value.errorCode, 'errorCode', 64),
        }
      : {}),
    ...(value.errorPhase !== undefined
      ? {
          errorPhase: requireOptionalNullableEnum(value.errorPhase, ERROR_PHASES, 'errorPhase'),
        }
      : {}),
    ...(value.errorTurnIndex !== undefined
      ? {
          errorTurnIndex: requireOptionalNullableInteger(value.errorTurnIndex, 'errorTurnIndex', 0, 1_023),
        }
      : {}),
    ...(value.conversationId !== undefined
      ? {
          conversationId: requireOptionalNullableIdentifier(value.conversationId, 'conversationId', 128),
        }
      : {}),
    ...(value.traceId !== undefined ? { traceId: requireOptionalNullableTraceId(value.traceId) } : {}),
    createdAt: requireTimestamp(value.createdAt, 'createdAt'),
    results: value.results.map((item) => parseEvalResult(item, id)),
  }
}

function parseEvalResult(value: unknown, entryId: string): EvalResult {
  if (!isRecord(value)) throw new errors.BotpressCLIError('hosted eval result is malformed')
  const evalEntryId = requireDatabaseId(value.evalEntryId, 'evalEntryId')
  if (evalEntryId !== entryId) throw new errors.BotpressCLIError('hosted eval result has a malformed evalEntryId')
  return {
    id: requireDatabaseId(value.id, 'result id'),
    evalEntryId,
    turnIndex: requireIntegerInRange('turnIndex', value.turnIndex, -1, 1_023),
    resultIndex: requireIntegerInRange('resultIndex', value.resultIndex, 0, 1_023),
    assertionKind: requireEnum(value.assertionKind, ASSERTION_KINDS, 'assertionKind'),
    passed: requireBoolean(value.passed, 'passed'),
    skipped: requireBoolean(value.skipped, 'skipped'),
    score: requireNullableScore(value.score),
    botDurationMs: requireNullableDuration(value.botDurationMs, 'botDurationMs'),
    graderDurationMs: requireNullableDuration(value.graderDurationMs, 'graderDurationMs'),
    ...(value.conversationId !== undefined
      ? {
          conversationId: requireOptionalNullableIdentifier(value.conversationId, 'conversationId', 128),
        }
      : {}),
    ...(value.traceId !== undefined ? { traceId: requireOptionalNullableTraceId(value.traceId) } : {}),
    createdAt: requireTimestamp(value.createdAt, 'createdAt'),
  }
}

function parseWorkflowResponse(value: unknown): {
  id: string
  status: (typeof WORKFLOW_STATUSES)[number]
  output: Record<string, unknown>
  failureCode?: 'delivery_unavailable'
} {
  if (!isRecord(value) || !isRecord(value.workflow)) {
    throw new errors.BotpressCLIError('hosted eval workflow response is malformed')
  }
  if (!isRecord(value.workflow.output)) {
    throw new errors.BotpressCLIError('hosted eval workflow output is malformed')
  }
  return {
    id: requireIdentifier(value.workflow.id, 'workflow id', 128),
    status: requireEnum(value.workflow.status, WORKFLOW_STATUSES, 'workflow status'),
    output: value.workflow.output,
    ...(value.workflow.failureReason === 'workflow delivery unavailable'
      ? { failureCode: 'delivery_unavailable' as const }
      : {}),
  }
}

function parseWorkflowCompletion(value: Record<string, unknown>): {
  runId: string
  passed: number
  failed: number
  total: number
  duration: number
} {
  return {
    runId: requireDatabaseId(value.runId, 'workflow runId'),
    passed: requireIntegerInRange('workflow passed', value.passed, 0, 128),
    failed: requireIntegerInRange('workflow failed', value.failed, 0, 128),
    total: requireIntegerInRange('workflow total', value.total, 0, 128),
    duration: requireIntegerInRange('workflow duration', value.duration, 0, MAX_DURATION_MS),
  }
}

function requireDatabaseId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !POSITIVE_DECIMAL.test(value)) {
    throw new errors.BotpressCLIError(`${field} must be a positive decimal ID`)
  }
  try {
    if (BigInt(value) > MAX_DATABASE_ID) throw new Error('overflow')
  } catch {
    throw new errors.BotpressCLIError(`${field} must be a positive decimal ID within int64 range`)
  }
  return value
}

function requireCursor(value: string, field: string): void {
  if (!CURSOR.test(value) || value.length > 128) {
    throw new errors.BotpressCLIError(`${field} must be an opaque base64url cursor returned by brt eval runs`)
  }
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8')
    if (!POSITIVE_DECIMAL.test(decoded) || Buffer.from(decoded).toString('base64url') !== value) throw new Error('bad')
    if (BigInt(decoded) > MAX_DATABASE_ID) throw new Error('overflow')
  } catch {
    throw new errors.BotpressCLIError(`${field} must be an opaque base64url cursor returned by brt eval runs`)
  }
}

function optionalIdentifier(value: unknown, field: string, max: number): string | undefined {
  if (value === undefined) return undefined
  return requireIdentifier(value, field, max)
}

function optionalModel(value: unknown): string | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'string' || value.length > 128 || !SAFE_MODEL.test(value)) {
    throw new errors.BotpressCLIError('--judge-model must be a safe model reference of at most 128 characters')
  }
  return value
}

function requireIdentifier(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.length > max || !SAFE_IDENTIFIER.test(value)) {
    throw new errors.BotpressCLIError(`${field} is malformed; expected a safe identifier of at most ${max} characters`)
  }
  return value
}

function requireTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !RFC3339.test(value)) {
    throw new errors.BotpressCLIError(`hosted eval ${field} is malformed`)
  }
  const normalized = value.replace(/\.(\d{3})\d+/, '.$1')
  if (!Number.isFinite(Date.parse(normalized))) throw new errors.BotpressCLIError(`hosted eval ${field} is malformed`)
  return value
}

function requireNullableTimestamp(value: unknown, field: string): string | null {
  if (value === null) return null
  return requireTimestamp(value, field)
}

function requireIntegerInRange(field: string, value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new errors.BotpressCLIError(`${field} must be an integer between ${min} and ${max}`)
  }
  if (value < min || value > max) {
    throw new errors.BotpressCLIError(`${field} must be between ${min} and ${max}`)
  }
  return value
}

function requirePassRate(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new errors.BotpressCLIError('min-pass-rate must be a number between 0 and 1')
  }
  return value
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new errors.BotpressCLIError(`hosted eval ${field} is malformed`)
  return value
}

function requireNullableBoolean(value: unknown, field: string): boolean | null {
  if (value === null) return null
  return requireBoolean(value, field)
}

function requireNullableDuration(value: unknown, field: string): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_DURATION_MS) {
    throw new errors.BotpressCLIError(`${field} must be a finite number between 0 and ${MAX_DURATION_MS}`)
  }
  return value
}

function requireNullableScore(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new errors.BotpressCLIError('hosted eval score is malformed')
  }
  return value
}

function requireOptionalNullableIdentifier(value: unknown, field: string, max: number): string | null {
  if (value === null) return null
  return requireIdentifier(value, field, max)
}

function requireOptionalNullableTraceId(value: unknown): string | null {
  if (value === null) return null
  if (typeof value !== 'string' || !TRACE_ID.test(value)) {
    throw new errors.BotpressCLIError('hosted eval traceId is malformed')
  }
  return value.toLowerCase()
}

function requireOptionalNullableInteger(value: unknown, field: string, min: number, max: number): number | null {
  if (value === null) return null
  return requireIntegerInRange(field, value, min, max)
}

function requireOptionalNullableEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string
): T[number] | null {
  if (value === null) return null
  return requireEnum(value, allowed, field)
}

function requireEnum<const T extends readonly string[]>(value: unknown, allowed: T, field: string): T[number] {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new errors.BotpressCLIError(`hosted eval ${field} is malformed`)
  }
  return value as T[number]
}

function requireNullableEnum<const T extends readonly string[]>(
  value: unknown,
  allowed: T,
  field: string
): T[number] | null {
  if (value === null) return null
  return requireEnum(value, allowed, field)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}
