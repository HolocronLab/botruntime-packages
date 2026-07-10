/**
 * Eval runner — orchestrates eval execution.
 *
 * Bot response content comes from authenticated `message_created` signals.
 * Spans provide completion, timing, workflow transitions, safe tool names,
 * and richer local-only observations when the selected source supports them.
 */

import { Client as BpClientCtor, type Client as BpClient } from '@holocronlab/botruntime-client'
import type {
  EvalDefinition,
  EvalProgressEvent,
  EvalReport,
  EvalRunReport,
  EvalRunnerConfig,
  EvalFilter,
  GraderResult,
  TurnReport,
  BotConnection,
  EvalSetup,
  SpanSourceCapabilities,
} from './types'
import { defaultLogger } from './types'
import { ChatSession, assertChatChannelBound, assertTraceStreamReadable } from './client'
import type { SpanSource } from './spans/span-source'
import { LocalSpanSource } from './spans/local-span-source'
import { transformSpans } from './transformer'
import { gradeResponse } from './graders/response'
import { gradeTools } from './graders/tools'
import { gradeState } from './graders/state'
import { gradeWorkflows } from './graders/workflow'
import { gradeTiming } from './graders/timing'
import { gradeOutcome } from './graders/outcome'
import { initLLMJudge } from './graders/llm'
import { loadEvalsFromDir, filterEvals } from './loader'
import { EvalRunnerError } from './errors'
import { isAdkError } from './internal/adk-error'
import { randomUUID } from 'crypto'

/**
 * Run a single eval against a bot.
 */
const DEFAULT_IDLE_TIMEOUT = 30_000
const DEFAULT_DEV_SERVER_URL = 'http://localhost:3001'
const WORKFLOW_TRIGGER_TIMEOUT_MS = 5 * 60 * 1000

class EvalProgressSinkError extends Error {
  constructor(readonly sinkCause: unknown) {
    super('Eval progress sink failed')
    this.name = 'EvalProgressSinkError'
  }
}

async function emitEvalProgress(
  sink: EvalRunnerConfig['onProgress'],
  event: EvalProgressEvent
): Promise<void> {
  if (!sink) return
  try {
    await sink(event)
  } catch (error) {
    throw new EvalProgressSinkError(error)
  }
}
/**
 * Grace window for an event turn's handler span to appear. A subscribed handler starts its span in
 * milliseconds, so no span after this window means nothing is subscribed and the turn can never
 * complete — fail fast rather than wait the full idleTimeout. Generous to absorb routing jitter.
 */
const EVENT_HANDLER_START_TIMEOUT_MS = 30_000

const BUILT_IN_STATES = {
  conversation: 'state',
  user: 'userState',
  bot: 'botState',
} as const

function unsupportedObservation(evalDef: EvalDefinition, location: string, capability: string): never {
  throw new EvalRunnerError({
    code: 'EVAL_OBSERVATION_UNSUPPORTED',
    message: `Eval "${evalDef.name}" ${location} uses ${capability}, but the selected trace source cannot observe it safely.`,
    expected: true,
  })
}

/** Fail before writes when an eval asks the selected trace source for data it cannot expose. */
export function validateEvalCapabilities(
  evals: EvalDefinition[],
  capabilities: SpanSourceCapabilities
): void {
  for (const evalDef of evals) {
    for (let turnIndex = 0; turnIndex < evalDef.conversation.length; turnIndex++) {
      const assertions = evalDef.conversation[turnIndex]?.assert
      for (const assertion of assertions?.tools ?? []) {
        const raw = assertion as unknown as Record<string, unknown>
        if (raw.input !== undefined || raw.output !== undefined) {
          unsupportedObservation(evalDef, `turn ${turnIndex + 1}`, 'unsupported tool input/output assertions')
        }
        if (!capabilities.toolParameters && raw.params !== undefined) {
          unsupportedObservation(evalDef, `turn ${turnIndex + 1}`, 'tool parameter assertions')
        }
      }
      if (!capabilities.stateMutations && (assertions?.state?.length ?? 0) > 0) {
        unsupportedObservation(evalDef, `turn ${turnIndex + 1}`, 'state assertions')
      }
    }
    if (!capabilities.stateMutations && (evalDef.outcome?.state?.length ?? 0) > 0) {
      unsupportedObservation(evalDef, 'outcome', 'state assertions')
    }
  }
}

/** Reader auth/scope preflight. The fallback uses a bounded dummy correlation. */
export async function assertSpanSourceReadable(source: SpanSource): Promise<void> {
  if (source.assertReadable) {
    await source.assertReadable()
    return
  }

  const suffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
  try {
    await source.connect({ conversationId: `eval-preflight-${suffix}` })
  } finally {
    source.disconnect()
  }
}

function buildStatePayload(value: Record<string, unknown>) {
  // `location` is required by the Botpress setState API schema.
  return {
    value,
    location: { type: 'state' as const },
  }
}

async function seedEvalState(
  client: BpClient,
  ctx: { botId: string; userId: string; conversationId?: string },
  setup?: EvalSetup
): Promise<void> {
  const state = setup?.state
  if (!state) return

  const writes: Array<Promise<unknown>> = []

  if (state.bot) {
    writes.push(
      client.setState({
        type: 'bot',
        id: ctx.botId,
        name: BUILT_IN_STATES.bot,
        payload: buildStatePayload(state.bot),
      })
    )
  }

  if (state.user) {
    writes.push(
      client.setState({
        type: 'user',
        id: ctx.userId,
        name: BUILT_IN_STATES.user,
        payload: buildStatePayload(state.user),
      })
    )
  }

  if (state.conversation) {
    if (!ctx.conversationId) {
      throw new EvalRunnerError({
        code: 'EVAL_SEED_NO_CONVERSATION',
        message: 'Cannot seed conversation state before a conversation is created.',
      })
    }

    writes.push(
      client.setState({
        type: 'conversation',
        id: ctx.conversationId,
        name: BUILT_IN_STATES.conversation,
        payload: buildStatePayload(state.conversation),
      })
    )
  }

  await Promise.all(writes)
}

async function triggerEvalWorkflow(
  client: BpClient,
  ctx: { userId: string; conversationId?: string },
  setup?: EvalSetup
): Promise<void> {
  const workflow = setup?.workflow
  if (!workflow) return

  await client.createWorkflow({
    name: workflow.trigger,
    input: workflow.input ?? {},
    status: 'pending',
    userId: ctx.userId,
    timeoutAt: new Date(Date.now() + WORKFLOW_TRIGGER_TIMEOUT_MS).toISOString(),
    ...(ctx.conversationId !== undefined ? { conversationId: ctx.conversationId } : {}),
  })
}

function evalMetadata(evalDef: EvalDefinition) {
  return {
    name: evalDef.name,
    ...(evalDef.description !== undefined ? { description: evalDef.description } : {}),
    ...(evalDef.type !== undefined ? { type: evalDef.type } : {}),
    ...(evalDef.tags !== undefined ? { tags: evalDef.tags } : {}),
  }
}

export async function runEval(
  evalDef: EvalDefinition,
  connection: BotConnection,
  options: {
    devServerUrl?: string
    idleTimeout?: number
    /** @deprecated Compatibility no-op: the LLM judge returns a boolean verdict, not a score. */
    judgePassThreshold?: number
    /**
     * Configure the LLM judge inside the runner's OWN graders module. A bundled embedder can hold a
     * different copy of that module, so initializing it here guarantees the instance grading consults.
     */
    judge?: {
      credentials: { token: string; apiUrl: string; botId: string; workspaceId?: string }
      model?: string
      failClosed?: boolean
    }
    onProgress?: (event: EvalProgressEvent) => void | Promise<void>
    evalIndex?: number
    /** Forwarded from EvalRunnerConfig — lets per-turn workflow waits unblock immediately on Stop instead of burning the full idleTimeout each. */
    signal?: AbortSignal
    devServerHeaders?: Record<string, string>
    chatClient?: EvalRunnerConfig['chatClient']
    logger?: EvalRunnerConfig['logger']
    onException?: EvalRunnerConfig['onException']
    spanSource?: SpanSource
    chatWebhookId?: string
    chatBaseUrl?: string
    /** @internal The suite already authenticated this source kind before starting evals. */
    sourcePreflighted?: boolean
  } = {}
): Promise<EvalReport> {
  const devServerUrl = options.devServerUrl || DEFAULT_DEV_SERVER_URL
  const devServerHeaders = options.devServerHeaders ?? {}
  const logger = options.logger ?? defaultLogger
  const idleTimeout = evalDef.options?.idleTimeout ?? options.idleTimeout ?? DEFAULT_IDLE_TIMEOUT
  const judgePassThreshold = evalDef.options?.judgePassThreshold ?? options.judgePassThreshold
  const collector: SpanSource = options.spanSource ?? new LocalSpanSource(devServerUrl, devServerHeaders)

  validateEvalCapabilities([evalDef], collector.capabilities)
  if (!options.sourcePreflighted) {
    if (options.spanSource) {
      await assertSpanSourceReadable(collector)
    } else {
      await assertTraceStreamReadable(devServerUrl, devServerHeaders)
    }
  }

  if (options.judge) {
    const judgeClient = new BpClientCtor(options.judge.credentials)
    await initLLMJudge(judgeClient, {
      ...(options.judge.model !== undefined ? { model: options.judge.model } : {}),
      ...(options.judge.failClosed !== undefined ? { failClosed: options.judge.failClosed } : {}),
      logger,
    })
  }
  const start = Date.now()
  const turns: TurnReport[] = []
  let outcomeAssertions: GraderResult[] = []
  let session: ChatSession | undefined

  try {
    session = new ChatSession(
      connection.client,
      connection.botId,
      options.chatWebhookId,
      options.chatBaseUrl,
      options.chatClient
    )
    await session.connect()

    let conversationId = ''
    if (evalDef.setup?.state?.conversation || evalDef.setup?.workflow) {
      conversationId = await session.ensureConversation()
    }

    await seedEvalState(
      connection.client,
      {
        botId: connection.botId,
        userId: session.userId,
        ...(conversationId ? { conversationId } : {}),
      },
      evalDef.setup
    )

    await triggerEvalWorkflow(
      connection.client,
      {
        userId: session.userId,
        ...(conversationId ? { conversationId } : {}),
      },
      evalDef.setup
    )

    // Ensure we have a conversation before connecting the collector
    if (!conversationId && evalDef.conversation.length > 0) {
      conversationId = await session.ensureConversation()
    }

    // Connect the collector filtered by conversationId
    if (conversationId) {
      await collector.connect({ conversationId })
    } else if (evalDef.conversation.length > 0) {
      throw new EvalRunnerError({
        code: 'EVAL_NO_CONVERSATION_ID',
        message: 'Cannot run conversation eval without a conversationId — no chat session or setup created one.',
      })
    }

    for (let i = 0; i < evalDef.conversation.length; i++) {
      // Bail mid-eval the moment the caller signals abort, so a long
      // multi-turn eval doesn't keep ticking through turns after Stop.
      if (options.signal?.aborted) break

      const turn = evalDef.conversation[i]!

      const turnConfigError = (message: string) =>
        new EvalRunnerError({
          code: 'EVAL_TURN_CONFIG_INVALID',
          message: `Turn ${i + 1}: ${message}`,
          expected: true,
          details: { turn: i + 1 },
        })

      if (turn.expectSilence && turn.assert?.response) {
        throw turnConfigError(`'expectSilence' and 'assert.response' are mutually exclusive.`)
      }
      if (turn.user && turn.event) {
        throw turnConfigError(`'user' and 'event' are mutually exclusive.`)
      }
      if (!turn.user && !turn.event) {
        throw turnConfigError(`must have either 'user' or 'event'.`)
      }

      const turnLabel = turn.event ? '[event]' : turn.user!
      await emitEvalProgress(options.onProgress, {
        type: 'turn_start',
        evalName: evalDef.name,
        evalIndex: options.evalIndex ?? 0,
        turnIndex: i,
        totalTurns: evalDef.conversation.length,
        userMessage: turnLabel,
      })

      // Cross a conversation boundary under the same user. Ignored on the first turn.
      if (turn.newConversation && i > 0) {
        const newConversationId = await session.newConversation()
        await collector.repoint({ conversationId: newConversationId })
      }

      // Mark turn boundary, emit message, wait for handler completion via traces
      collector.startTurn()
      session.startTurn()

      if (turn.event) {
        await session.sendEvent(turn.event.payload)
      } else {
        await session.sendMessage(turn.user!)
      }

      try {
        // A user-message turn completes via handler.conversation; an event turn
        // via handler.event. Scoping the wait keeps async noise (e.g. a workflow
        // callback's silent handler.event) from releasing the turn early.
        await session.raceWithListenerError(
          collector.waitForTurnComplete({
            timeout: idleTimeout,
            acceptSpanNames: turn.event ? new Set(['handler.event']) : new Set(['handler.conversation']),
            // Long quiet window: a tool-started workflow and its callback only run
            // AFTER the handler closes; sending the next message into that window
            // can get it absorbed by their transcript saves and silently skipped.
            settleQuietMs: 1_500,
            settleMaxMs: 15_000,
            // Event turns fail fast when nothing is subscribed (see the constant).
            ...(turn.event ? { handlerStartTimeoutMs: EVENT_HANDLER_START_TIMEOUT_MS } : {}),
            ...(options.signal !== undefined ? { abortSignal: options.signal } : {}),
          })
        )
      } catch (err) {
        // If the wait was aborted, exit the turn loop cleanly rather than
        // surfacing an error on the eval — Stop is a user action, not a
        // failure. Other errors (timeout, etc.) still propagate.
        if (options.signal?.aborted) break
        throw err
      }

      // Wait for per-turn workflow assertions.
      // Skip the wait for negative assertions (entered: false / completed: false) — the
      // grader will check already-collected spans, so blocking on a signal that's expected
      // not to arrive just burns the full idleTimeout per assertion.
      if (turn.assert?.workflow) {
        for (const wfAssert of turn.assert.workflow) {
          const expectsPositive = wfAssert.entered !== false && wfAssert.completed !== false
          if (!expectsPositive) continue
          const wfSignal = wfAssert.completed ? 'completed' : 'entered'
          await session
            .raceWithListenerError(
              collector.waitForWorkflow(wfAssert.name, {
                signal: wfSignal,
                timeout: idleTimeout,
                ...(options.signal !== undefined ? { abortSignal: options.signal } : {}),
              })
            )
            .catch((error) => {
              if (isAdkError(error) && error.code === 'CHAT_LISTENER_FAILED') throw error
              // Timeout is OK — the grader will report the failure
            })
        }
      }

      // Transform turn spans into grader-friendly data
      let turnData = transformSpans(collector.getTurnSpans())
      let responseMessages = session.getTurnResponses()

      // The chat signal can land just after the trace completion snapshot.
      if (!turn.expectSilence && responseMessages.length === 0 && turnData.handlerDuration > 0) {
        for (let waited = 0; waited < 600 && responseMessages.length === 0; waited += 150) {
          await session.raceWithListenerError(new Promise<void>((resolve) => setTimeout(resolve, 150)))
          responseMessages = session.getTurnResponses()
          if (turn.event) turnData = transformSpans(collector.getTurnSpans())
        }
      }

      const botResponse = responseMessages.join('\n')
      const botDuration = turnData.handlerDuration

      const evalStart = Date.now()
      let assertions: GraderResult[] = []
      const noResponse = !turn.expectSilence && responseMessages.length === 0

      if (noResponse) {
        // A missing response is a graded outcome, not an exceptional state —
        // record the failure and keep going so later turns and outcome
        // assertions still produce data (a throw here used to abort the whole
        // eval and discard everything after this turn).
        assertions.push({
          assertion: 'response',
          pass: false,
          expected: 'Bot produces a response',
          actual: `Turn ${i + 1}: bot produced no response.`,
        })
      }

      if (turn.expectSilence) {
        const wasSilent = responseMessages.length === 0
        assertions.push({
          assertion: 'no_response',
          pass: wasSilent,
          expected: 'No response',
          actual: wasSilent ? 'No response' : `Bot responded: "${botResponse}"`,
        })
      }

      // Response assertions — skipped when there's no response: the failing
      // 'response' assertion above already covers it, and grading an empty
      // string would only add noise.
      if (turn.assert?.response && !noResponse) {
        assertions = await gradeResponse(botResponse, turn.assert.response, {
          userMessage: turnLabel,
          ...(judgePassThreshold !== undefined ? { judgePassThreshold } : {}),
        })
      }

      // Tool assertions from turn spans
      if (turn.assert?.tools) {
        const toolResults = gradeTools(turnData.toolCalls, turn.assert.tools)
        assertions = [...assertions, ...toolResults]
      }

      // Per-turn state assertions
      if (turn.assert?.state) {
        try {
          const stateResults = gradeState(turnData.stateMutations, turn.assert.state)
          assertions.push(...stateResults)
        } catch (err) {
          assertions.push({
            assertion: 'state',
            pass: false,
            expected: 'State assertions executed',
            actual: `Error: ${(err as Error).message}`,
          })
        }
      }

      // Per-turn workflow assertions
      if (turn.assert?.workflow) {
        const workflowResults = gradeWorkflows(turnData.workflowSpans, turn.assert.workflow)
        assertions.push(...workflowResults)
      }

      // Per-turn timing assertions
      if (turn.assert?.timing) {
        const timingResults = gradeTiming(botDuration, turn.assert.timing)
        assertions.push(...timingResults)
      }

      const turnPass = assertions.every((a) => a.pass)

      const evalDuration = Date.now() - evalStart

      const turnReport: TurnReport = {
        turnIndex: i,
        userMessage: turnLabel,
        botResponse,
        assertions,
        pass: turnPass,
        botDuration,
        evalDuration,
      }
      turns.push(turnReport)

      await emitEvalProgress(options.onProgress, {
        type: 'turn_complete',
        evalName: evalDef.name,
        evalIndex: options.evalIndex ?? 0,
        turnIndex: i,
        totalTurns: evalDef.conversation.length,
        turnReport,
      })
    }

    // Outcome assertions (after all turns)
    if (evalDef.outcome && !options.signal?.aborted) {
      // Wait for outcome-level workflow assertions. Same negative-assertion gate as the per-turn loop.
      if (evalDef.outcome.workflow) {
        for (const wfAssert of evalDef.outcome.workflow) {
          const expectsPositive = wfAssert.entered !== false && wfAssert.completed !== false
          if (!expectsPositive) continue
          const wfSignal = wfAssert.completed ? 'completed' : 'entered'
          await session
            .raceWithListenerError(
              collector.waitForWorkflow(wfAssert.name, {
                signal: wfSignal,
                timeout: idleTimeout,
                ...(options.signal !== undefined ? { abortSignal: options.signal } : {}),
              })
            )
            .catch((error) => {
              if (isAdkError(error) && error.code === 'CHAT_LISTENER_FAILED') throw error
              // Timeout is OK — the grader will report the failure
            })
        }
      }

      try {
        const allTurnData = transformSpans(collector.getAllSpans())
        outcomeAssertions = gradeOutcome(allTurnData.stateMutations, evalDef, allTurnData.workflowSpans)
      } catch (err) {
        outcomeAssertions = [
          {
            assertion: 'outcome',
            pass: false,
            expected: 'Outcome assertions executed',
            actual: `Error: ${(err as Error).message}`,
          },
        ]
      }
    }

    const aborted = options.signal?.aborted === true
    const turnsPass = turns.every((t) => t.pass)
    const outcomePass = outcomeAssertions.every((a) => a.pass)

    return {
      ...evalMetadata(evalDef),
      turns,
      outcomeAssertions,
      pass: !aborted && turnsPass && outcomePass,
      duration: Date.now() - start,
      ...(aborted ? { error: 'Eval aborted', errorCode: 'EVAL_ABORTED' as const } : {}),
    }
  } catch (err) {
    // Progress sinks are host persistence, not eval verdicts. Folding their
    // failure into EvalReport could finalize an entry before the missing write
    // is reconciled, making the replay terminally impossible.
    if (err instanceof EvalProgressSinkError) throw err.sinkCause

    // Preserve the stable code/expected flag on the report instead of
    // flattening everything to a message string. Unexpected (internal-bug)
    // failures are logged AND reported to the injected exception hook —
    // this catch swallows the error into report.error, so it never reaches
    // the CLI's command boundary and would otherwise be invisible to
    // PostHog error tracking.
    const adkErr = isAdkError(err) ? err : undefined
    const evalErr = err instanceof EvalRunnerError ? err : undefined
    if (!adkErr || !adkErr.expected) {
      const errMsg = (err as Error).message ?? String(err)
      const errStack = (err as Error).stack ?? ''
      logger.error(`Eval "${evalDef.name}" failed unexpectedly: ${errMsg}`)
      logger.error(`  stack: ${errStack}`)
      logger.error(`  eval: ${evalDef.name}, turn: ${turns.length}/${evalDef.conversation.length}`)
      logger.error(`  connection: botId=${connection.botId}`)
      logger.error(
        `  spanSource: ${options.spanSource?.constructor?.name ?? 'default'}, devServerUrl: ${options.devServerUrl ?? 'n/a'}`
      )
      options.onException?.(err, { source: 'evals', eval_name: evalDef.name })
    }
    return {
      ...evalMetadata(evalDef),
      turns,
      outcomeAssertions,
      pass: false,
      duration: Date.now() - start,
      error: (err as Error).message,
      ...(evalErr ? { errorCode: evalErr.code } : {}),
    }
  } finally {
    collector.disconnect()
    await session?.disconnect().catch((error) => {
      logger.warn(`Chat response listener cleanup failed: ${error instanceof Error ? error.message : String(error)}`)
    })
  }
}

/**
 * Run a suite of evals.
 */
export async function runEvalSuite(config: EvalRunnerConfig, filter?: EvalFilter): Promise<EvalRunReport> {
  const start = Date.now()
  const runId = config.runId ?? randomUUID().replace(/-/g, '').slice(0, 26)

  // Load eval definitions — from pre-loaded definitions or from disk
  let allEvals: EvalDefinition[]
  if (config.definitions) {
    allEvals = config.definitions
  } else if (config.agentPath) {
    allEvals = await loadEvalsFromDir(`${config.agentPath}/evals`)
  } else {
    throw new Error('Either `definitions` or `agentPath` must be provided in EvalRunnerConfig')
  }
  const evals = filterEvals(allEvals, filter)

  if (evals.length === 0) {
    return {
      id: runId,
      timestamp: new Date().toISOString(),
      evals: [],
      passed: 0,
      failed: 0,
      total: 0,
      duration: 0,
      ...(filter !== undefined ? { filter } : {}),
    }
  }

  if (config.createSpanSource) {
    const preflightSource = config.createSpanSource()
    try {
      validateEvalCapabilities(evals, preflightSource.capabilities)
      if (!config.sourcePreflighted) {
        await assertSpanSourceReadable(preflightSource)
      }
    } finally {
      preflightSource.disconnect()
    }
  } else {
    validateEvalCapabilities(evals, LocalSpanSource.capabilities)
    await assertChatChannelBound(config.devServerUrl || DEFAULT_DEV_SERVER_URL, config.devServerHeaders ?? {}, config.logger)
    await assertTraceStreamReadable(config.devServerUrl || DEFAULT_DEV_SERVER_URL, config.devServerHeaders ?? {})
  }

  // Initialize the LLM judge with the client
  await initLLMJudge(config.client, {
    ...(config.evalOptions?.judgeModel !== undefined ? { model: config.evalOptions.judgeModel } : {}),
    ...(config.logger !== undefined ? { logger: config.logger } : {}),
  })

  const connection: BotConnection = {
    client: config.client,
    botId: config.botId,
  }

  const devServerUrl = config.devServerUrl || DEFAULT_DEV_SERVER_URL
  const devServerHeaders = config.devServerHeaders ?? {}

  const reports: EvalReport[] = []

  await config.onProgress?.({ type: 'suite_start', totalEvals: evals.length })

  for (let i = 0; i < evals.length; i++) {
    // Stop starting new evals if the caller aborted. The eval loop only
    // checks between evals — an in-flight eval (with possibly in-flight LLM
    // calls) finishes naturally because those calls can't always be cancelled
    // mid-flight.
    if (config.signal?.aborted) break

    const evalDef = evals[i]!
    await config.onProgress?.({
      type: 'eval_start',
      evalName: evalDef.name,
      index: i,
      totalTurns: evalDef.conversation.length,
    })

    const report = await runEval(evalDef, connection, {
      devServerUrl,
      devServerHeaders,
      evalIndex: i,
      ...(config.evalOptions?.idleTimeout !== undefined ? { idleTimeout: config.evalOptions.idleTimeout } : {}),
      ...(config.evalOptions?.judgePassThreshold !== undefined
        ? { judgePassThreshold: config.evalOptions.judgePassThreshold }
        : {}),
      ...(config.onProgress !== undefined ? { onProgress: config.onProgress } : {}),
      ...(config.signal !== undefined ? { signal: config.signal } : {}),
      ...(config.chatClient !== undefined ? { chatClient: config.chatClient } : {}),
      ...(config.logger !== undefined ? { logger: config.logger } : {}),
      ...(config.onException !== undefined ? { onException: config.onException } : {}),
      ...(config.createSpanSource !== undefined ? { spanSource: config.createSpanSource() } : {}),
      ...(config.chatWebhookId !== undefined ? { chatWebhookId: config.chatWebhookId } : {}),
      ...(config.chatBaseUrl !== undefined ? { chatBaseUrl: config.chatBaseUrl } : {}),
      sourcePreflighted: true,
    })
    reports.push(report)

    await config.onProgress?.({ type: 'eval_complete', evalName: evalDef.name, index: i, report })
  }

  const runReport: EvalRunReport = {
    id: runId,
    timestamp: new Date().toISOString(),
    evals: reports,
    passed: reports.filter((r) => r.pass).length,
    failed: reports.filter((r) => !r.pass).length,
    total: reports.length,
    duration: Date.now() - start,
    ...(filter !== undefined ? { filter } : {}),
  }

  if (isPartialEvalSuiteAbort(config.signal, reports, evals.length)) {
    runReport.aborted = true
  }

  await config.onProgress?.({ type: 'suite_complete', report: runReport })

  return runReport
}

/** @internal Exported for the abort-boundary contract test. */
export function isPartialEvalSuiteAbort(
  signal: AbortSignal | undefined,
  reports: ReadonlyArray<Pick<EvalReport, 'errorCode'>>,
  selectedCount: number
): boolean {
  return (
    signal?.aborted === true &&
    (reports.length < selectedCount || reports.some((report) => report.errorCode === 'EVAL_ABORTED'))
  )
}
