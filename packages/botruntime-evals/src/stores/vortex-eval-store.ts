import type { EvalDefinition } from '../definition'
import type { EvalFilter, EvalProgressEvent, EvalReport, EvalRunReport, TurnReport, GraderResult } from '../types'
import type { EvalStore, EvalSummary, EvalRunSummary, EvalReportHistoryEntry, EvalWatchOptions } from './eval-store'
import type { EvalDefinitionLoader } from './eval-definition-loader'

// ── Vortex response types ──────────────────────────────────────────────

interface VortexEvalRun {
  id: string
  botId: string
  workspaceId: string
  evalManifestId: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  triggerType: string
  startedAt: string | null
  completedAt: string | null
  createdAt: string
  updatedAt: string
  metadata?: Record<string, unknown> | null
}

interface VortexEvalResult {
  id: string
  evalEntryId: string
  turnIndex: number
  graderName: string
  passed: boolean
  score: number | null
  evidence: Record<string, unknown>
  userMessage: string
  botResponse: string
  botDurationMs: number | null
  graderDurationMs: number | null
  createdAt: string
}

interface VortexEvalEntry {
  id: string
  evalRunId: string
  evalName: string
  evalType: 'capability' | 'regression'
  description: string
  tags: string[]
  /** null while the entry is in-progress (per-turn lifecycle); set on finalize. */
  passed: boolean | null
  durationMs: number | null
  error: string | null
  createdAt: string
  results: VortexEvalResult[]
}

/** A single grader result row, as posted to Vortex. */
interface VortexResultInput {
  turnIndex: number
  graderName: string
  passed: boolean
  evidence: { expected: string; actual: string }
  userMessage: string
  botResponse: string
  botDurationMs: number
  graderDurationMs: number
}

type VortexRunWithEntries = VortexEvalRun & { entries: VortexEvalEntry[] }

const OUTCOME_TURN_INDEX = -1

// ── Config ─────────────────────────────────────────────────────────────

export interface VortexEvalStoreConfig {
  url: string
  botId: string
  workspaceId?: string
  token?: string
  evalManifestId?: string | (() => string | undefined)
  loadEvalDefinitions?: EvalDefinitionLoader
}

// ── Transformers ───────────────────────────────────────────────────────

function vortexEntryToEvalReport(entry: VortexEvalEntry): EvalReport {
  const outcomeAssertions: GraderResult[] = entry.results
    .filter((r) => r.turnIndex === OUTCOME_TURN_INDEX)
    .map((r) => ({
      assertion: r.graderName,
      pass: r.passed,
      expected: (r.evidence?.expected as string) ?? '',
      actual: (r.evidence?.actual as string) ?? '',
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
        assertion: r.graderName,
        pass: r.passed,
        expected: (r.evidence?.expected as string) ?? '',
        actual: (r.evidence?.actual as string) ?? '',
      }))
      const first = results[0]!
      return {
        turnIndex,
        userMessage: first.userMessage,
        botResponse: first.botResponse,
        assertions,
        pass: assertions.every((a) => a.pass),
        botDuration: first.botDurationMs ?? 0,
        evalDuration: first.graderDurationMs ?? 0,
      }
    })

  return {
    name: entry.evalName,
    description: entry.description || undefined,
    type: entry.evalType,
    tags: entry.tags,
    turns,
    outcomeAssertions,
    pass: entry.passed ?? false,
    duration: entry.durationMs ?? 0,
    error: entry.error ?? undefined,
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
  return graderResultsToRows(turn.assertions, {
    turnIndex: turn.turnIndex,
    userMessage: turn.userMessage,
    botResponse: turn.botResponse,
    botDurationMs: turn.botDuration,
    graderDurationMs: turn.evalDuration,
  })
}

function outcomeToResultRows(assertions: GraderResult[]): VortexResultInput[] {
  return graderResultsToRows(assertions, {
    turnIndex: OUTCOME_TURN_INDEX,
    userMessage: '',
    botResponse: '',
    botDurationMs: 0,
    graderDurationMs: 0,
  })
}

function graderResultsToRows(
  assertions: GraderResult[],
  context: Omit<VortexResultInput, 'graderName' | 'passed' | 'evidence'>
): VortexResultInput[] {
  return assertions.map((assertion) => ({
    ...context,
    graderName: assertion.assertion,
    passed: assertion.pass,
    evidence: { expected: assertion.expected, actual: assertion.actual },
  }))
}

function runMatchesWatchOptions(run: VortexEvalRun, options: EvalWatchOptions): boolean {
  if (options.runId && run.id !== options.runId) return false
  if (options.workflowId && run.metadata?.workflowId !== options.workflowId) return false
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
      aborted: false,
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
    aborted: false,
  }
}

// ── VortexEvalStore ────────────────────────────────────────────────────

export class VortexEvalStore implements EvalStore {
  private url: string
  private botId: string
  private workspaceId?: string
  private token?: string
  private _evalManifestId?: string | (() => string | undefined)
  private _loadEvalDefinitions?: EvalDefinitionLoader

  constructor(config: VortexEvalStoreConfig) {
    this.url = config.url.replace(/\/$/, '')
    this.botId = config.botId
    if (config.workspaceId) this.workspaceId = config.workspaceId
    if (config.token) this.token = config.token
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

  async createRun(runType = 'scheduled', metadata?: Record<string, unknown>): Promise<string> {
    if (!this.workspaceId) {
      throw new Error('workspaceId is required to create Vortex eval runs')
    }

    const triggerType = runType === 'manual' ? 'manual' : 'scheduled'
    const res = await this.fetch(`/v1/evals/bot/${this.botId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        evalManifestId:
          (typeof this._evalManifestId === 'function' ? this._evalManifestId() : this._evalManifestId) ?? '',
        workspaceId: this.workspaceId,
        triggerType,
        ...(metadata ? { metadata } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex create run failed: ${res.status} ${text}`)
    }

    const { id } = (await res.json()) as { id: string }
    return id
  }

  async addRunResults(runId: string, evalReport: EvalReport): Promise<void> {
    const entry = {
      evalName: evalReport.name,
      evalType: evalReport.type ?? 'capability',
      description: evalReport.description ?? '',
      tags: evalReport.tags ?? [],
      passed: evalReport.pass,
      durationMs: evalReport.duration,
      error: evalReport.error,
      results: [...evalReport.turns.flatMap(turnToResultRows), ...outcomeToResultRows(evalReport.outcomeAssertions)],
    }

    const res = await this.fetch(`/v1/evals/runs/${runId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entries: [entry] }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex ingest entries failed: ${res.status} ${text}`)
    }
  }

  async completeRun(runId: string, report: EvalRunReport): Promise<void> {
    const hasRunError = report.aborted === true || report.evals.some((e) => e.error !== undefined)
    const res = await this.fetch(`/v1/evals/runs/${runId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [],
        completed: !hasRunError,
        failed: hasRunError,
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex complete run failed: ${res.status} ${text}`)
    }
  }

  // ── Per-turn incremental lifecycle (Option B) ──
  //
  // The eval-runner workflow builds each entry up as the eval runs (rather than
  // writing it whole at the end), so the dev console can stream turn-by-turn
  // progress. This is the prod ingestion path and requires Vortex to provide:
  //   startEntry        POST  /runs/{runId}/entries                    → { entries:[{ id }] }  (passed:null, in-progress)
  //   appendTurnResults POST  /runs/{runId}/entries/{entryId}/results  (idempotent upsert by turnIndex+graderName)
  //   finalizeEntry     PATCH /runs/{runId}/entries/{entryId}          (sets the verdict)
  //   markRunComplete   POST  /runs/{runId}/complete                   (status → completed|failed)

  /** Create an in-progress entry (metadata only, no results) and return its server id. */
  async startEntry(
    runId: string,
    meta: { evalName: string; evalType?: 'capability' | 'regression'; description?: string; tags?: string[] }
  ): Promise<string> {
    const res = await this.fetch(`/v1/evals/runs/${runId}/entries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entries: [
          {
            evalName: meta.evalName,
            evalType: meta.evalType ?? 'capability',
            description: meta.description ?? '',
            tags: meta.tags ?? [],
          },
        ],
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex start entry failed: ${res.status} ${text}`)
    }

    const data = (await res.json()) as { entries?: { id: string }[]; id?: string }
    const entryId = data.entries?.[0]?.id ?? data.id
    if (!entryId) {
      throw new Error('Vortex start entry returned no entry id')
    }
    return entryId
  }

  /** Append one turn's grader results to an existing entry. */
  async appendTurnResults(runId: string, entryId: string, turn: TurnReport): Promise<void> {
    const res = await this.fetch(`/v1/evals/runs/${runId}/entries/${entryId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: turnToResultRows(turn) }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex append results failed: ${res.status} ${text}`)
    }
  }

  /** Append outcome-level grader results to an existing entry. */
  async appendOutcomeResults(runId: string, entryId: string, assertions: GraderResult[]): Promise<void> {
    if (assertions.length === 0) return

    const res = await this.fetch(`/v1/evals/runs/${runId}/entries/${entryId}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ results: outcomeToResultRows(assertions) }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex append results failed: ${res.status} ${text}`)
    }
  }

  /** Set the verdict on an entry once its eval finishes. */
  async finalizeEntry(
    runId: string,
    entryId: string,
    verdict: { passed: boolean; durationMs?: number; error?: string }
  ): Promise<void> {
    const res = await this.fetch(`/v1/evals/runs/${runId}/entries/${entryId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        passed: verdict.passed,
        ...(verdict.durationMs !== undefined ? { durationMs: verdict.durationMs } : {}),
        ...(verdict.error !== undefined ? { error: verdict.error } : {}),
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex finalize entry failed: ${res.status} ${text}`)
    }
  }

  /** Flip the run to its terminal status (replaces completeRun's empty-entries hack). */
  async markRunComplete(runId: string, opts: { failed?: boolean } = {}): Promise<void> {
    const res = await this.fetch(`/v1/evals/runs/${runId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...(opts.failed !== undefined ? { failed: opts.failed } : {}) }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex complete run failed: ${res.status} ${text}`)
    }
  }

  // ── Run results — read ─────────────────────────────────────────────

  async loadRunResult(runId: string): Promise<EvalRunReport | null> {
    const data = await this.fetchJson<VortexRunWithEntries>(`/v1/evals/runs/${runId}`)
    return vortexRunToReport(data)
  }

  async getLatestRun(): Promise<EvalRunReport | null> {
    const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(`/v1/evals/bot/${this.botId}/runs`, { limit: '1' })
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
        const initial = await this.fetchJson<{ runs: VortexEvalRun[] }>(`/v1/evals/bot/${this.botId}/runs`, {
          limit: '1',
        })
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
        const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(`/v1/evals/bot/${this.botId}/runs`, {
          limit: hasExpectedRun ? '20' : '1',
        })
        let latest: VortexEvalRun | null = null
        let raw: VortexRunWithEntries | null = null
        for (const candidate of data.runs) {
          if (options.runId && candidate.id !== options.runId) continue
          if (options.workflowId && candidate.metadata?.workflowId !== options.workflowId) {
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
      const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(`/v1/evals/bot/${this.botId}/runs`, {
        status: 'running',
        limit: '1',
      })
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
    const data = await this.fetchJson<{ runs: VortexEvalRun[] }>(`/v1/evals/bot/${this.botId}/runs`, {
      limit: String(limit),
    })

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
    const headers = new Headers(init?.headers)
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)
    return globalThis.fetch(target, { ...init, headers })
  }

  private async fetchJson<T>(path: string, params?: Record<string, string>): Promise<T> {
    const target = new URL(`${this.url}${path}`)
    if (params) {
      for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v)
    }
    const headers = new Headers()
    if (this.token) headers.set('Authorization', `Bearer ${this.token}`)

    const res = await globalThis.fetch(target, { headers })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Vortex ${res.status}: ${text}`)
    }
    return res.json() as Promise<T>
  }
}
