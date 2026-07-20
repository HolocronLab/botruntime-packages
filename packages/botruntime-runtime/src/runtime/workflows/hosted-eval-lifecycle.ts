import type { EvalDefinition, EvalProgressEvent, EvalReport, EvalRunReport } from '@holocronlab/botruntime-evals'
import {
  classifyVortexEvalError,
  classifyVortexEvalReport,
  type VortexEvalErrorKind,
  type VortexEvalStore,
} from '@holocronlab/botruntime-evals/stores/vortex'
import { createStepSignal, isStepSignal } from '../../primitives/workflow-signal'

export type HostedEvalStep = <T>(name: string, action: () => Promise<T>) => Promise<T>

type HostedEvalStore = Pick<
  VortexEvalStore,
  | 'startEntry'
  | 'appendTurnResults'
  | 'appendOutcomeResults'
  | 'finalizeEntry'
  | 'addRunResults'
  | 'reconcileRunResults'
  | 'markRunComplete'
>

export type HostedEvalCompletion = {
  aborted?: boolean
  errorKind?: VortexEvalErrorKind
}

/**
 * Owns the hosted eval persistence state machine. Workflow yields are transport
 * control signals, so they must escape without reclassification or terminalization.
 */
export class HostedEvalLifecycle {
  private readonly definitions: EvalDefinition[]
  private readonly definitionByName: Map<string, EvalDefinition>
  private readonly entryIds = new Map<string, string>()
  private readonly completedReports = new Map<string, EvalReport>()
  private readonly finalizedReports = new Set<string>()

  constructor(
    private readonly store: HostedEvalStore,
    private readonly runId: string,
    definitions: EvalDefinition[],
    private readonly signal?: AbortSignal
  ) {
    this.definitions = definitions
    this.definitionByName = new Map(definitions.map((definition) => [definition.name, definition]))
  }

  async onProgress(
    event: EvalProgressEvent,
    step: HostedEvalStep = async (_name, action) => action()
  ): Promise<void> {
    if (event.type === 'eval_start') {
      const definition = this.definitionByName.get(event.evalName)
      if (!definition) throw new Error(`Hosted eval definition ${event.evalName} is missing`)
      const entryId = await step(`start-entry-${event.index}`, () => this.startDefinition(definition))
      // A replayed step returns its cached id without running startDefinition,
      // so every fresh workflow invocation must rehydrate the in-memory index.
      this.entryIds.set(definition.name, entryId)
      return
    }
    if (event.type === 'turn_complete') {
      await this.store.appendTurnResults(this.runId, this.requireEntryId(event.evalName), event.turnReport)
      return
    }
    if (event.type !== 'eval_complete') return

    // The sandbox signal is a durable-workflow yield boundary, not an eval
    // verdict. Persisting the engine's synthetic aborted report here would
    // poison the hosted entry instead of resuming the checkpointed report.
    if (this.signal?.aborted) throw createStepSignal()

    // Save the engine's exact report before persistence. A failure below must
    // reconcile this verdict, never replace a successful entry with internal.
    this.completedReports.set(event.evalName, event.report)
    const entryId = this.requireEntryId(event.evalName)
    await step(`persist-outcome-${event.index}`, () =>
      this.store.appendOutcomeResults(this.runId, entryId, event.report.outcomeAssertions)
    )
    const errorKind = classifyVortexEvalReport(event.report)
    await step(`finalize-entry-${event.index}`, () =>
      this.store.finalizeEntry(this.runId, entryId, {
        passed: event.report.pass,
        durationMs: event.report.duration,
        ...(errorKind ? { errorKind } : {}),
        ...(event.report.diagnostic ? { diagnostic: event.report.diagnostic } : {}),
      })
    )
    this.finalizedReports.add(event.evalName)
  }

  rememberCompletedReport(report: EvalReport): void {
    this.completedReports.set(report.name, report)
  }

  async reconcileForCompletion(report: EvalRunReport, step: HostedEvalStep): Promise<void> {
    if (report.aborted) {
      await step('finalize-aborted-evals', () =>
        this.finalizeMissingDefinitions(new Set(report.evals.map((evalReport) => evalReport.name)), 'aborted')
      )
    }
    await step('reconcile-run-results', () => this.store.reconcileRunResults(this.runId, report))
  }

  completionOf(report: EvalRunReport): HostedEvalCompletion {
    const errorKind = report.aborted
      ? 'aborted'
      : report.evals.map((evalReport) => classifyVortexEvalReport(evalReport)).find((kind) => kind !== undefined)
    return {
      ...(report.aborted ? { aborted: true } : {}),
      ...(errorKind ? { errorKind } : {}),
    }
  }

  async terminalizeFailure(cause: unknown, step: HostedEvalStep): Promise<never> {
    if (isStepSignal(cause)) throw cause
    const errorKind: VortexEvalErrorKind = this.signal?.aborted ? 'aborted' : classifyVortexEvalError(cause)
    try {
      await step('reconcile-failed-run', async () => {
        for (const report of this.completedReports.values()) {
          if (this.finalizedReports.has(report.name)) continue
          await this.store.addRunResults(this.runId, report)
        }
        await this.finalizeMissingDefinitions(new Set(this.completedReports.keys()), errorKind)
      })
      await step('fail-run', () =>
        this.store.markRunComplete(this.runId, {
          ...(errorKind === 'aborted' ? { aborted: true } : {}),
          errorKind,
        })
      )
    } catch (terminalError) {
      if (isStepSignal(terminalError)) throw terminalError
      throw new AggregateError(
        [cause, terminalError],
        'Eval execution failed and the hosted run could not be terminalized'
      )
    }
    throw cause
  }

  private requireEntryId(evalName: string): string {
    const entryId = this.entryIds.get(evalName)
    if (!entryId) throw new Error(`Hosted eval entry ${evalName} was not started`)
    return entryId
  }

  private async startDefinition(definition: EvalDefinition): Promise<string> {
    const existing = this.entryIds.get(definition.name)
    if (existing) return existing
    const entryId = await this.store.startEntry(this.runId, {
      evalName: definition.name,
      ...(definition.type ? { evalType: definition.type } : {}),
      ...(definition.tags ? { tags: definition.tags } : {}),
    })
    this.entryIds.set(definition.name, entryId)
    return entryId
  }

  private async finalizeMissingDefinitions(presentNames: Set<string>, errorKind: VortexEvalErrorKind): Promise<void> {
    for (const definition of this.definitions) {
      if (presentNames.has(definition.name)) continue
      const entryId = await this.startDefinition(definition)
      await this.store.finalizeEntry(this.runId, entryId, {
        passed: false,
        durationMs: 0,
        errorKind,
      })
    }
  }
}
