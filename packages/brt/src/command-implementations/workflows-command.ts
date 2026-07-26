import { createHash, randomUUID } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import type {
  WorkflowListParams,
  WorkflowStatus,
} from '../api/cloudapi-client'
import { WORKFLOW_STATUSES } from '../api/cloudapi-client'
import type commandDefinitions from '../command-definitions'
import * as errors from '../errors'
import { CloudCommand, type EvalCloudTarget } from './cloud-command'

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/
const SAFE_IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const POSITIVE_DECIMAL = /^[1-9][0-9]*$/
const MAX_CURSOR = '9223372036854775807'
const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/
const TERMINAL_STATUSES = new Set<WorkflowStatus>(['completed', 'failed', 'timedout', 'cancelled'])
const MAX_INPUT_BYTES = 1024 * 1024
const MAX_PAGE_SIZE = 100
const MAX_OBSERVATION_MS = 86_400_000
const MAX_WORKFLOW_TIMEOUT_MS = 2_592_000_000
const CREATE_DEADLINE_MS = 120_000
const MIN_POLL_INTERVAL_MS = 1_000
const MAX_POLL_INTERVAL_MS = 15_000
const MAX_PROJECTED_STEPS = 1_000
const MAX_STEP_DEPTH = 8

type TargetOutput = EvalCloudTarget['output']

type WorkflowTarget = {
  client: EvalCloudTarget['client']
  output: TargetOutput
  runtimeHeader?: string
}

type WorkflowRecord = {
  id: string
  name: string
  status: WorkflowStatus
  input: unknown
  output: unknown
  tags: Record<string, string>
  parentWorkflowId?: string
  conversationId?: string
  userId?: string
  createdAt: string
  updatedAt: string
  completedAt?: string
  timeoutAt?: string
}

type WorkflowProjection = Omit<WorkflowRecord, 'input' | 'output' | 'tags'> & {
  failure?: {
    code: 'WORKFLOW_FAILED' | 'WORKFLOW_TIMED_OUT' | 'WORKFLOW_CANCELLED'
    reason: string
  }
  input?: unknown
  output?: unknown
  tags?: Record<string, string>
}

type StepProjection = {
  name: string
  attempts: number
  maxAttempts?: number
  requestName?: string
  notificationName?: string
  startedAt: string
  finishedAt?: string
  mapTotal?: number
  error?: {
    name?: string
    failedAt: string
    maxAttemptsReached: boolean
    operation?: string
    status?: number
    kind?: string
    ambiguous?: boolean
  }
  steps?: StepProjection[]
}

type StepsProjection =
  | {
      available: true
      storage: 'state'
      executionCount: number
      revision: number
      steps: StepProjection[]
    }
  | {
      available: false
      storage: 'file'
      reason: 'server_projection_required'
    }

type WorkflowsDefinition =
  | typeof commandDefinitions.workflows.subcommands.run
  | typeof commandDefinitions.workflows.subcommands.list
  | typeof commandDefinitions.workflows.subcommands.show
  | typeof commandDefinitions.workflows.subcommands.wait

abstract class WorkflowsCloudCommand<C extends WorkflowsDefinition> extends CloudCommand<C> {
  protected async resolveWorkflowTarget(): Promise<WorkflowTarget> {
    if (this.argv.local && !this.argv.dev) {
      throw new errors.BotpressCLIError(
        '--local requires --dev for hosted workflow commands; production and development targets cannot be mixed'
      )
    }
    const target = await this.evalCloudapiTarget()
    return {
      client: target.client,
      output: target.output,
      ...('runtimeBotId' in target ? { runtimeHeader: target.runtimeBotId } : {}),
    }
  }

  protected async fetchSteps(
    target: WorkflowTarget,
    workflowId: string,
    deadlineAtMs?: number
  ): Promise<StepsProjection> {
    try {
      return parseWorkflowSteps(
        await target.client.getWorkflowSteps(workflowId, target.runtimeHeader, deadlineAtMs)
      )
    } catch (thrown) {
      if (thrown instanceof errors.HTTPError && thrown.status === 404) {
        return {
          available: true,
          storage: 'state',
          executionCount: 0,
          revision: 0,
          steps: [],
        }
      }
      throw thrown
    }
  }

  protected printWorkflow(
    target: WorkflowTarget,
    workflow: WorkflowRecord,
    includeData: boolean,
    extra?: Record<string, unknown>
  ): void {
    const projected = projectWorkflow(workflow, includeData)
    const output = {
      schemaVersion: 1,
      target: target.output,
      ...extra,
      workflow: projected,
    }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }
    this.logger.log(
      `${projected.id}  ${projected.status}  ${projected.name}  created=${projected.createdAt}  updated=${projected.updatedAt}`
    )
    if (projected.failure) this.logger.log(`Failure: ${projected.failure.code} — ${projected.failure.reason}`)
    if (projected.conversationId) this.logger.log(`Conversation: ${projected.conversationId}`)
    if (projected.userId) this.logger.log(`User: ${projected.userId}`)
    if (extra?.['created'] !== undefined) this.logger.log(`Created: ${String(extra['created'])}`)
    if (extra?.['idempotencyKey'] !== undefined) {
      this.logger.log(`Idempotency key: ${String(extra['idempotencyKey'])}`)
    }
    const observation = extra?.['observation']
    if (isRecord(observation) && typeof observation.status === 'string') {
      this.logger.log(`Observation: ${observation.status}`)
    }
    if (extra?.['steps'] !== undefined) printSteps(this.logger, extra['steps'] as StepsProjection)
    if (includeData) {
      this.logger.log(`Input: ${JSON.stringify(projected.input)}`)
      this.logger.log(`Output: ${JSON.stringify(projected.output)}`)
      this.logger.log(`Tags: ${JSON.stringify(projected.tags)}`)
    }
  }
}

export type WorkflowsRunCommandDefinition = typeof commandDefinitions.workflows.subcommands.run

export class WorkflowsRunCommand extends WorkflowsCloudCommand<WorkflowsRunCommandDefinition> {
  public async run(): Promise<void> {
    const name = requireSafeText(this.argv.name, 'workflow name', 128)
    const timeout = requireInteger(this.argv.timeout, '--timeout', 1_000, MAX_OBSERVATION_MS)
    const workflowTimeout =
      this.argv.workflowTimeout === undefined
        ? undefined
        : requireInteger(
            this.argv.workflowTimeout,
            '--workflow-timeout',
            1_000,
            MAX_WORKFLOW_TIMEOUT_MS
          )
    const idempotencyKey = requireIdempotencyKey(this.argv.idempotencyKey ?? randomUUID())
    const conversationId = optionalSafeId(this.argv.conversationId, '--conversation-id')
    const userId = optionalSafeId(this.argv.userId, '--user-id')
    const parentWorkflowId = optionalSafeId(this.argv.parentWorkflowId, '--parent-workflow-id')
    const input = readInputFile(this.argv.inputFile, this.projectDir)
    const target = await this.resolveWorkflowTarget()
    if (!this.argv.json) this.logger.log(`Workflow idempotency key: ${idempotencyKey}`)

    const now = Date.now()
    const requestHash = hashWorkflowRequest({
      name,
      input,
      workflowTimeout,
      conversationId,
      userId,
      parentWorkflowId,
    })
    let created: { workflow: WorkflowRecord; created: boolean }
    try {
      created = parseGetOrCreateWorkflowResponse(
        await target.client.getOrCreateWorkflow(
          {
            name,
            status: 'pending',
            input,
            ...(workflowTimeout === undefined
              ? {}
              : { timeoutAt: new Date(now + workflowTimeout).toISOString() }),
            ...(conversationId === undefined ? {} : { conversationId }),
            ...(userId === undefined ? {} : { userId }),
            ...(parentWorkflowId === undefined ? {} : { parentWorkflowId }),
            tags: {
              'brt.idempotencyKey': idempotencyKey,
              'brt.requestHash': requestHash,
            },
            discriminateByTags: ['brt.idempotencyKey'],
          },
          target.runtimeHeader,
          now + CREATE_DEADLINE_MS
        )
      )
    } catch (thrown) {
      if (thrown instanceof errors.TransientRequestError) {
        throw new errors.BotpressCLIError(
          `workflow create outcome is unknown; retry the original command on the same target with the same input and \`--idempotency-key ${idempotencyKey}\`; never retry it with a new key`
        )
      }
      throw thrown
    }
    if (
      created.workflow.tags['brt.idempotencyKey'] !== idempotencyKey
      || created.workflow.tags['brt.requestHash'] !== requestHash
    ) {
      throw new errors.BotpressCLIError(
        'the workflow idempotency key is already associated with a different request; choose a new key only for an intentionally new workflow run'
      )
    }

    if (!this.argv.wait || TERMINAL_STATUSES.has(created.workflow.status)) {
      this.printWorkflow(target, created.workflow, this.argv.includeData, {
        idempotencyKey,
        created: created.created,
        observation: {
          status: this.argv.wait ? 'terminal' : 'not_requested',
          durableWorkflowContinues: !TERMINAL_STATUSES.has(created.workflow.status),
        },
      })
      this.setTerminalExitCode(created.workflow)
      return
    }

    const observed = await observeWorkflow(target, created.workflow, timeout, (message) =>
      this.logger.debug(message)
    )
    this.printWorkflow(target, observed.workflow, this.argv.includeData, {
      idempotencyKey,
      created: created.created,
      observation: {
        status: observed.deadlineReached ? 'deadline_reached' : 'terminal',
        durableWorkflowContinues: observed.deadlineReached,
      },
    })
    if (observed.deadlineReached) {
      if (!this.argv.json) {
        this.logger.log(
          `Continue observing: brt workflows wait ${observed.workflow.id}${this.argv.dev ? ' --dev' : ''}`
        )
      }
      this.setExitCode(2)
      return
    }
    this.setTerminalExitCode(observed.workflow)
  }

  private setTerminalExitCode(workflow: WorkflowRecord): void {
    if (workflow.status === 'completed') return
    if (TERMINAL_STATUSES.has(workflow.status)) this.setExitCode(1)
  }
}

export type WorkflowsListCommandDefinition = typeof commandDefinitions.workflows.subcommands.list

export class WorkflowsListCommand extends WorkflowsCloudCommand<WorkflowsListCommandDefinition> {
  public async run(): Promise<void> {
    const pageSize = requireInteger(this.argv.limit, '--limit', 1, MAX_PAGE_SIZE)
    const name =
      this.argv.name === undefined ? undefined : requireSafeText(this.argv.name, '--name', 128)
    const conversationId = optionalSafeId(this.argv.conversationId, '--conversation-id')
    const userId = optionalSafeId(this.argv.userId, '--user-id')
    const parentWorkflowId = optionalSafeId(this.argv.parentWorkflowId, '--parent-workflow-id')
    const statuses = this.argv.status?.map((status: unknown) => requireWorkflowStatus(status))
    const nextToken = optionalCursor(this.argv.nextToken)
    const target = await this.resolveWorkflowTarget()
    const params: WorkflowListParams = {
      pageSize,
      ...(name === undefined ? {} : { name }),
      ...(conversationId === undefined ? {} : { conversationId }),
      ...(userId === undefined ? {} : { userId }),
      ...(parentWorkflowId === undefined ? {} : { parentWorkflowId }),
      ...(statuses === undefined ? {} : { statuses }),
      ...(nextToken === undefined ? {} : { nextToken }),
    }
    const page = parseWorkflowPage(
      await target.client.listWorkflows(params, target.runtimeHeader),
      pageSize
    )
    const output = {
      schemaVersion: 1,
      target: target.output,
      workflows: page.workflows.map((workflow) => projectWorkflow(workflow, false)),
      nextToken: page.nextToken ?? null,
    }
    if (this.argv.json) {
      this.logger.json(output)
      return
    }
    if (page.workflows.length === 0) this.logger.log('No workflow runs found.')
    for (const workflow of output.workflows) {
      this.logger.log(
        `${workflow.id}  ${workflow.status}  ${workflow.name}  created=${workflow.createdAt}  updated=${workflow.updatedAt}`
      )
    }
    if (page.nextToken) this.logger.log(`Next token: ${page.nextToken}`)
  }
}

export type WorkflowsShowCommandDefinition = typeof commandDefinitions.workflows.subcommands.show

export class WorkflowsShowCommand extends WorkflowsCloudCommand<WorkflowsShowCommandDefinition> {
  public async run(): Promise<void> {
    const workflowId = requireSafeId(this.argv.workflowId, 'workflow ID')
    const target = await this.resolveWorkflowTarget()
    const workflow = parseWorkflowResponse(
      await target.client.getWorkflow(workflowId, target.runtimeHeader)
    )
    const steps = this.argv.steps
      ? await this.fetchSteps(target, workflowId)
      : undefined
    this.printWorkflow(target, workflow, this.argv.includeData, {
      ...(steps === undefined ? {} : { steps }),
    })
  }
}

export type WorkflowsWaitCommandDefinition = typeof commandDefinitions.workflows.subcommands.wait

export class WorkflowsWaitCommand extends WorkflowsCloudCommand<WorkflowsWaitCommandDefinition> {
  public async run(): Promise<void> {
    const workflowId = requireSafeId(this.argv.workflowId, 'workflow ID')
    const timeout = requireInteger(this.argv.timeout, '--timeout', 1_000, MAX_OBSERVATION_MS)
    const target = await this.resolveWorkflowTarget()
    const initial = parseWorkflowResponse(
      await target.client.getWorkflow(workflowId, target.runtimeHeader)
    )
    const observed = TERMINAL_STATUSES.has(initial.status)
      ? { workflow: initial, deadlineReached: false }
      : await observeWorkflow(target, initial, timeout, (message) => this.logger.debug(message))
    const steps = this.argv.steps
      ? await this.fetchSteps(target, workflowId)
      : undefined
    this.printWorkflow(target, observed.workflow, this.argv.includeData, {
      observation: {
        status: observed.deadlineReached ? 'deadline_reached' : 'terminal',
        durableWorkflowContinues: observed.deadlineReached,
      },
      ...(steps === undefined ? {} : { steps }),
    })
    if (observed.deadlineReached) {
      if (!this.argv.json) {
        this.logger.log(
          `The observation window ended; workflow ${workflowId} was not cancelled and can be observed again.`
        )
      }
      this.setExitCode(2)
      return
    }
    if (observed.workflow.status !== 'completed') this.setExitCode(1)
  }
}

async function observeWorkflow(
  target: WorkflowTarget,
  initial: WorkflowRecord,
  timeoutMs: number,
  debug: (message: string) => void
): Promise<{ workflow: WorkflowRecord; deadlineReached: boolean }> {
  const deadline = Date.now() + timeoutMs
  let current = initial
  let attempt = 0
  while (Date.now() < deadline) {
    const remaining = Math.max(0, deadline - Date.now())
    const exponentialCap = Math.min(
      MAX_POLL_INTERVAL_MS,
      MIN_POLL_INTERVAL_MS * (2 ** Math.min(attempt, 4))
    )
    const jitteredDelay = Math.floor(exponentialCap / 2 + Math.random() * exponentialCap / 2)
    await sleep(Math.min(jitteredDelay, remaining))
    if (Date.now() >= deadline) break
    try {
      current = parseWorkflowResponse(
        await target.client.getWorkflow(current.id, target.runtimeHeader, deadline)
      )
      if (TERMINAL_STATUSES.has(current.status)) {
        return { workflow: current, deadlineReached: false }
      }
    } catch (thrown) {
      if (!(thrown instanceof errors.TransientRequestError)) throw thrown
      debug(`Workflow polling remains transiently unavailable: ${thrown.message}`)
    }
    attempt++
  }
  return { workflow: current, deadlineReached: true }
}

function parseGetOrCreateWorkflowResponse(
  value: unknown
): { workflow: WorkflowRecord; created: boolean } {
  if (!isRecord(value) || !isRecord(value.meta) || typeof value.meta.created !== 'boolean') {
    throw new errors.BotpressCLIError('workflow create response is malformed')
  }
  return {
    workflow: parseWorkflowResponse(value),
    created: value.meta.created,
  }
}

function parseWorkflowResponse(value: unknown): WorkflowRecord {
  if (!isRecord(value) || !isRecord(value.workflow)) {
    throw new errors.BotpressCLIError('workflow response is malformed')
  }
  return parseWorkflow(value.workflow)
}

function parseWorkflowPage(
  value: unknown,
  pageSize: number
): { workflows: WorkflowRecord[]; nextToken?: string } {
  if (!isRecord(value) || !Array.isArray(value.workflows) || value.workflows.length > pageSize) {
    throw new errors.BotpressCLIError('workflow list response is malformed')
  }
  if (!isRecord(value.meta)) throw new errors.BotpressCLIError('workflow list metadata is malformed')
  const nextToken =
    value.meta.nextToken === undefined ? undefined : requireCursor(value.meta.nextToken, 'workflow nextToken')
  return {
    workflows: value.workflows.map(parseWorkflow),
    ...(nextToken === undefined ? {} : { nextToken }),
  }
}

function parseWorkflow(value: unknown): WorkflowRecord {
  if (!isRecord(value)) throw new errors.BotpressCLIError('workflow record is malformed')
  return {
    id: requireSafeId(value.id, 'workflow ID'),
    name: requireSafeText(value.name, 'workflow name', 128),
    status: requireWorkflowStatus(value.status),
    input: value.input,
    output: value.output,
    tags: requireTags(value.tags),
    ...(value.parentWorkflowId === undefined
      ? {}
      : { parentWorkflowId: requireSafeId(value.parentWorkflowId, 'parent workflow ID') }),
    ...(value.conversationId === undefined
      ? {}
      : { conversationId: requireSafeId(value.conversationId, 'conversation ID') }),
    ...(value.userId === undefined
      ? {}
      : { userId: requireSafeId(value.userId, 'user ID') }),
    createdAt: requireTimestamp(value.createdAt, 'createdAt'),
    updatedAt: requireTimestamp(value.updatedAt, 'updatedAt'),
    ...(value.completedAt === undefined
      ? {}
      : { completedAt: requireTimestamp(value.completedAt, 'completedAt') }),
    ...(value.timeoutAt === undefined
      ? {}
      : { timeoutAt: requireTimestamp(value.timeoutAt, 'timeoutAt') }),
  }
}

function projectWorkflow(workflow: WorkflowRecord, includeData: boolean): WorkflowProjection {
  const { input, output, tags, ...metadata } = workflow
  const failure =
    workflow.status === 'failed'
      ? {
          code: 'WORKFLOW_FAILED' as const,
          reason: 'The durable workflow failed; inspect privacy-safe steps and correlated traces.',
        }
      : workflow.status === 'timedout'
        ? {
            code: 'WORKFLOW_TIMED_OUT' as const,
            reason: 'The durable workflow reached its configured execution deadline.',
          }
        : workflow.status === 'cancelled'
          ? {
              code: 'WORKFLOW_CANCELLED' as const,
              reason: 'The durable workflow was cancelled.',
            }
          : undefined
  return {
    ...metadata,
    ...(failure === undefined ? {} : { failure }),
    ...(includeData ? { input, output, tags } : {}),
  }
}

function parseWorkflowSteps(value: unknown): StepsProjection {
  if (!isRecord(value) || !isRecord(value.state) || !isRecord(value.state.payload)) {
    throw new errors.BotpressCLIError('workflow steps response is malformed')
  }
  const payload = value.state.payload
  if (!isRecord(payload.location) || typeof payload.location.type !== 'string') {
    throw new errors.BotpressCLIError('workflow steps storage location is malformed')
  }
  if (payload.location.type === 'file') {
    return {
      available: false,
      storage: 'file',
      reason: 'server_projection_required',
    }
  }
  if (payload.location.type !== 'state' || !isRecord(payload.value)) {
    throw new errors.BotpressCLIError('workflow steps inline state is malformed')
  }
  const context = payload.value
  if (!isRecord(context.steps)) throw new errors.BotpressCLIError('workflow steps map is malformed')
  const counter = { count: 0 }
  return {
    available: true,
    storage: 'state',
    executionCount: requireInteger(context.executionCount, 'workflow executionCount', 0, 1_000_000),
    revision: requireInteger(context.revision, 'workflow revision', 0, 1_000_000_000),
    steps: projectStepMap(context.steps, 0, counter),
  }
}

function projectStepMap(
  value: Record<string, unknown>,
  depth: number,
  counter: { count: number }
): StepProjection[] {
  if (depth > MAX_STEP_DEPTH) {
    throw new errors.BotpressCLIError(`workflow steps exceed the ${MAX_STEP_DEPTH}-level projection limit`)
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
  const projected: StepProjection[] = []
  for (const [name, raw] of entries) {
    counter.count++
    if (counter.count > MAX_PROJECTED_STEPS) {
      throw new errors.BotpressCLIError(
        `workflow steps exceed the ${MAX_PROJECTED_STEPS}-step projection limit`
      )
    }
    if (!isRecord(raw)) throw new errors.BotpressCLIError('workflow step record is malformed')
    const error = raw.error === undefined ? undefined : projectStepError(raw.error)
    const children =
      raw.steps === undefined
        ? undefined
        : isRecord(raw.steps)
          ? projectStepMap(raw.steps, depth + 1, counter)
          : malformedStepMap()
    projected.push({
      name: requireSafeText(name, 'workflow step name', 256),
      attempts: requireInteger(raw.attempts, 'workflow step attempts', 0, 1_000_000),
      ...(raw.maxAttempts === undefined
        ? {}
        : { maxAttempts: requireInteger(raw.maxAttempts, 'workflow step maxAttempts', 0, 1_000_000) }),
      ...(raw.requestName === undefined
        ? {}
        : { requestName: requireSafeText(raw.requestName, 'workflow request name', 128) }),
      ...(raw.notificationName === undefined
        ? {}
        : { notificationName: requireSafeText(raw.notificationName, 'workflow notification name', 128) }),
      startedAt: requireTimestamp(raw.startedAt, 'workflow step startedAt'),
      ...(raw.finishedAt === undefined
        ? {}
        : { finishedAt: requireTimestamp(raw.finishedAt, 'workflow step finishedAt') }),
      ...(raw.mapTotal === undefined
        ? {}
        : { mapTotal: requireInteger(raw.mapTotal, 'workflow step mapTotal', 0, 1_000_000) }),
      ...(error === undefined ? {} : { error }),
      ...(children === undefined ? {} : { steps: children }),
    })
  }
  return projected
}

function malformedStepMap(): never {
  throw new errors.BotpressCLIError('workflow nested steps map is malformed')
}

function projectStepError(value: unknown): NonNullable<StepProjection['error']> {
  if (!isRecord(value)) throw new errors.BotpressCLIError('workflow step error is malformed')
  return {
    ...(value.name === undefined ? {} : { name: requireErrorName(value.name) }),
    failedAt: requireTimestamp(value.failedAt, 'workflow step failedAt'),
    maxAttemptsReached: requireBoolean(value.maxAttemptsReached, 'workflow step maxAttemptsReached'),
    ...(value.operation === undefined ? {} : { operation: requireOperation(value.operation) }),
    ...(value.status === undefined
      ? {}
      : { status: requireInteger(value.status, 'workflow step error status', 100, 599) }),
    ...(value.kind === undefined ? {} : { kind: requireErrorKind(value.kind) }),
    ...(value.ambiguous === undefined
      ? {}
      : { ambiguous: requireBoolean(value.ambiguous, 'workflow step error ambiguous') }),
  }
}

function readInputFile(file: string | undefined, projectDir: string): Record<string, unknown> {
  if (file === undefined) return {}
  const absolute = path.isAbsolute(file) ? file : path.resolve(projectDir, file)
  let stat: fs.Stats
  try {
    stat = fs.statSync(absolute)
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `cannot read workflow input file ${absolute}`)
  }
  if (!stat.isFile()) throw new errors.BotpressCLIError(`workflow input path is not a regular file: ${absolute}`)
  if (stat.size > MAX_INPUT_BYTES) {
    throw new errors.BotpressCLIError(
      `workflow input file exceeds the ${MAX_INPUT_BYTES}-byte CLI safety limit`
    )
  }
  let value: unknown
  try {
    value = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  } catch (thrown) {
    throw errors.BotpressCLIError.wrap(thrown, `workflow input file is not valid JSON: ${absolute}`)
  }
  if (!isRecord(value)) throw new errors.BotpressCLIError('workflow input JSON must be an object')
  return value
}

function requireTags(value: unknown): Record<string, string> {
  if (!isRecord(value) || Object.keys(value).length > 128) {
    throw new errors.BotpressCLIError('workflow tags are malformed')
  }
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    result[requireSafeText(key, 'workflow tag key', 128)] = requireSafeText(
      item,
      'workflow tag value',
      1024
    )
  }
  return result
}

function requireWorkflowStatus(value: unknown): WorkflowStatus {
  if (typeof value !== 'string' || !WORKFLOW_STATUSES.includes(value as WorkflowStatus)) {
    throw new errors.BotpressCLIError('workflow status is malformed')
  }
  return value as WorkflowStatus
}

function requireSafeId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) {
    throw new errors.BotpressCLIError(
      `${field} must be 1-256 characters using letters, digits, dot, underscore, colon, slash, or hyphen`
    )
  }
  return value
}

function optionalSafeId(value: unknown, field: string): string | undefined {
  return value === undefined ? undefined : requireSafeId(value, field)
}

function requireIdempotencyKey(value: unknown): string {
  if (typeof value !== 'string' || !SAFE_IDEMPOTENCY_KEY.test(value)) {
    throw new errors.BotpressCLIError(
      '--idempotency-key must be 1-128 characters using letters, digits, dot, underscore, colon, or hyphen'
    )
  }
  return value
}

function requireSafeText(value: unknown, field: string, max: number): string {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > max
    || /[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/.test(value)
  ) {
    throw new errors.BotpressCLIError(`${field} must be non-empty, control-free text of at most ${max} characters`)
  }
  return value
}

function requireTimestamp(value: unknown, field: string): string {
  if (typeof value !== 'string' || !RFC3339.test(value)) {
    throw new errors.BotpressCLIError(`${field} is malformed`)
  }
  const normalized = value.replace(/\.(\d{3})\d+/, '.$1')
  if (!Number.isFinite(Date.parse(normalized))) throw new errors.BotpressCLIError(`${field} is malformed`)
  return value
}

function requireInteger(value: unknown, field: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new errors.BotpressCLIError(`${field} must be an integer between ${min} and ${max}`)
  }
  return value
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') throw new errors.BotpressCLIError(`${field} is malformed`)
  return value
}

function optionalCursor(value: unknown): string | undefined {
  return value === undefined ? undefined : requireCursor(value, '--next-token')
}

function requireCursor(value: unknown, field: string): string {
  if (
    typeof value !== 'string'
    || !POSITIVE_DECIMAL.test(value)
    || value.length > MAX_CURSOR.length
    || (value.length === MAX_CURSOR.length && value > MAX_CURSOR)
  ) {
    throw new errors.BotpressCLIError(
      `${field} must be the positive decimal cursor returned by brt workflows list`
    )
  }
  return value
}

function requireErrorName(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z][A-Za-z0-9]{0,63}$/.test(value)) {
    throw new errors.BotpressCLIError('workflow step error name is malformed')
  }
  return value
}

function requireOperation(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Z]{3,10} \/[A-Za-z0-9._~:/-]{1,240}$/.test(value)) {
    throw new errors.BotpressCLIError('workflow step error operation is malformed')
  }
  return value
}

function requireErrorKind(value: unknown): string {
  if (typeof value !== 'string' || !/^[a-z][a-z0-9_-]{0,31}$/.test(value)) {
    throw new errors.BotpressCLIError('workflow step error kind is malformed')
  }
  return value
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hashWorkflowRequest(value: unknown): string {
  return `sha256:${createHash('sha256').update(canonicalJson(value)).digest('hex')}`
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`
  }
  const encoded = JSON.stringify(value)
  if (encoded === undefined) throw new errors.BotpressCLIError('workflow request contains an unsupported value')
  return encoded
}

function printSteps(
  logger: { log(message: string): void },
  value: StepsProjection
): void {
  if (!value.available) {
    logger.log(
      'Steps: stored in a large swapped state; this server needs the bounded workflow projection endpoint.'
    )
    return
  }
  logger.log(`Steps: executionCount=${value.executionCount} revision=${value.revision}`)
  for (const step of value.steps) printOneStep(logger, step, '  ')
}

function printOneStep(
  logger: { log(message: string): void },
  step: StepProjection,
  indent: string
): void {
  const status = step.error ? 'FAILED' : step.finishedAt ? 'COMPLETED' : 'ACTIVE'
  logger.log(`${indent}${status} ${step.name} attempts=${step.attempts}`)
  for (const child of step.steps ?? []) printOneStep(logger, child, `${indent}  `)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
