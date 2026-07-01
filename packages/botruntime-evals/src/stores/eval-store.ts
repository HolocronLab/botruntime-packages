import type { EvalDefinition } from '../definition'
import type { EvalFilter, EvalProgressEvent, EvalReport, EvalRunReport } from '../types'

export interface EvalSummary {
  name: string
  description?: string
  tags: string[]
  type: 'capability' | 'regression'
  turnCount: number
  hasOutcome: boolean
}

export interface EvalRunSummary {
  id: string
  timestamp: string
  passed: number
  failed: number
  total: number
  duration: number
  botDuration: number
  evalDuration: number
  filter?: EvalFilter
  evalNames: string[]
  aborted: boolean
}

export interface EvalReportHistoryEntry {
  runId: string
  timestamp: string
  report: EvalReport
  totalEvalsInRun: number
  filter?: EvalFilter
}

export interface EvalWatchOptions {
  runId?: string
  workflowId?: string
}

export interface EvalStore {
  listEvals(filter?: EvalFilter): Promise<EvalSummary[]>
  getEval(name: string): Promise<EvalDefinition | null>
  createRun(runType?: string, metadata?: Record<string, unknown>): Promise<string>
  addRunResults(runId: string, evalReport: EvalReport): Promise<void>
  completeRun(runId: string, report: EvalRunReport): Promise<void>
  loadRunResult(runId: string): Promise<EvalRunReport | null>
  getLatestRun(): Promise<EvalRunReport | null>
  listRunSummaries(opts?: { limit?: number; since?: number }): Promise<EvalRunSummary[]>
  listEvalReportsByName(
    evalName: string,
    opts?: { limit?: number; since?: number }
  ): Promise<EvalReportHistoryEntry[]>
  listEvalReportsBulk(opts?: {
    perEval?: number
    since?: number
  }): Promise<Record<string, EvalReportHistoryEntry[]>>
  watchRun(signal?: AbortSignal, options?: EvalWatchOptions): AsyncIterable<EvalProgressEvent>
  getRunnerState(): Promise<{ running: boolean; runId: string | null }>
}
