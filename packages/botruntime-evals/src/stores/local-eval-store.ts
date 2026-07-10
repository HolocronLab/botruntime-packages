/**
 * LocalEvalStore — local eval store backed by bun:sqlite + disk-loaded definitions.
 *
 * Implements the EvalStore interface for the local dev environment:
 *   - Eval definitions loaded from the agent's evals/ directory
 *   - Run results persisted in the legacy-compatible SQLite path (.adk/evals/evals.db)
 *   - Runner state tracked via in-memory activeRunId
 *
 * The CLI is the single writer and reader of the SQLite database — no
 * concurrent write issues since the CLI process owns the DB.
 */

import { Database, type Statement } from 'bun:sqlite'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync } from 'fs'
import { join } from 'path'
import type { EvalDefinition } from '../definition'
import type { EvalFilter, EvalProgressEvent, EvalReport, EvalRunReport } from '../types'
import type { EvalStore, EvalSummary, EvalRunSummary, EvalReportHistoryEntry, EvalWatchOptions } from './eval-store'
import type { EvalDefinitionLoader } from './eval-definition-loader'
import { createDiskEvalLoader } from './eval-definition-loader'
import { filterEvals } from '../loader'

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

const SCHEMA_VERSION = '2'

const SCHEMA = `
CREATE TABLE IF NOT EXISTS eval_runs (
  id              TEXT PRIMARY KEY,
  timestamp       TEXT NOT NULL,
  started_at      INTEGER NOT NULL,
  passed          INTEGER NOT NULL,
  failed          INTEGER NOT NULL,
  total           INTEGER NOT NULL,
  duration        REAL NOT NULL,
  bot_duration    REAL NOT NULL DEFAULT 0,
  eval_duration   REAL NOT NULL DEFAULT 0,
  aborted         INTEGER NOT NULL DEFAULT 0,
  filter_json     TEXT,
  eval_names      TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_eval_runs_started ON eval_runs(started_at DESC);

CREATE TABLE IF NOT EXISTS eval_reports (
  run_id          TEXT NOT NULL REFERENCES eval_runs(id) ON DELETE CASCADE,
  seq             INTEGER NOT NULL,
  name            TEXT NOT NULL,
  started_at      INTEGER NOT NULL,
  pass            INTEGER NOT NULL,
  duration        REAL NOT NULL,
  type            TEXT,
  error           TEXT,
  report_json     TEXT NOT NULL,
  PRIMARY KEY (run_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_eval_reports_name_time ON eval_reports(name, started_at DESC);

CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`

interface RunRow {
  id: string
  timestamp: string
  started_at: number
  passed: number
  failed: number
  total: number
  duration: number
  bot_duration: number
  eval_duration: number
  aborted: number
  filter_json: string | null
  eval_names: string
}

interface ReportRow {
  run_id: string
  seq: number
  name: string
  started_at: number
  pass: number
  duration: number
  type: string | null
  error: string | null
  report_json: string
}

function aggregateTurnTimings(report: EvalRunReport): { botDuration: number; evalDuration: number } {
  let botDuration = 0
  let evalDuration = 0
  for (const e of report.evals) {
    for (const t of e.turns) {
      botDuration += t.botDuration
      evalDuration += t.evalDuration
    }
  }
  return { botDuration, evalDuration }
}

function toEvalSummary(e: EvalDefinition): EvalSummary {
  return {
    name: e.name,
    description: e.description,
    tags: e.tags || [],
    type: e.type || 'capability',
    turnCount: e.conversation.length,
    hasOutcome: !!e.outcome,
  }
}

export interface LocalEvalStoreConfig {
  agentPath: string
  getActiveRunId?: () => string | null
  loadEvalDefinitions?: EvalDefinitionLoader
}

export class LocalEvalStore implements EvalStore {
  private db: Database | null = null
  private dbPath: string
  private evalsDir: string
  private insertRunStmt: Statement | null = null
  private insertReportStmt: Statement | null = null
  private _getActiveRunId: () => string | null
  private _loadEvalDefinitions: EvalDefinitionLoader

  constructor(config: LocalEvalStoreConfig) {
    this.evalsDir = join(config.agentPath, '.adk', 'evals')
    this.dbPath = join(this.evalsDir, 'evals.db')
    this._getActiveRunId = config.getActiveRunId ?? (() => null)
    this._loadEvalDefinitions = config.loadEvalDefinitions ?? createDiskEvalLoader(join(config.agentPath, 'evals'))
  }

  // ── Eval definitions (from disk) ───────────────────────────────────

  async listEvals(filter?: EvalFilter): Promise<EvalSummary[]> {
    const allEvals = await this._loadEvalDefinitions()
    const evals = filter ? filterEvals(allEvals, filter) : allEvals
    return evals.map(toEvalSummary)
  }

  async getEval(name: string): Promise<EvalDefinition | null> {
    const allEvals = await this._loadEvalDefinitions()
    return allEvals.find((e) => e.name === name) ?? null
  }

  // ── Run lifecycle — write ───────────────────────────────────────────

  async createRun(_runType?: 'manual' | 'scheduled'): Promise<string> {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 26)
  }

  async addRunResults(_runId: string, _evalReport: EvalReport): Promise<void> {
    // Local store writes atomically in completeRun — no incremental inserts.
  }

  async completeRun(_runId: string, report: EvalRunReport): Promise<void> {
    const db = this.getDb()
    if (!db) return

    db.run('BEGIN')
    try {
      this.insertRunReport(report)
      db.run('COMMIT')
    } catch (err) {
      db.run('ROLLBACK')
      console.error(`[local-eval-store] completeRun transaction failed (run ${report.id}): ${errText(err)}`)
      throw err
    }
  }

  // ── Run results — read ─────────────────────────────────────────────

  async loadRunResult(runId: string): Promise<EvalRunReport | null> {
    const db = this.getDb()
    if (!db) return null

    const runRow = db.prepare<RunRow, [string]>('SELECT * FROM eval_runs WHERE id = ?').get(runId)
    if (!runRow) return null

    const reportRows = db
      .prepare<ReportRow, [string]>('SELECT * FROM eval_reports WHERE run_id = ? ORDER BY seq')
      .all(runRow.id)

    return this.assembleRun(runRow, reportRows)
  }

  async getLatestRun(): Promise<EvalRunReport | null> {
    const db = this.getDb()
    if (!db) return null

    const runRow = db.prepare<RunRow, []>('SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT 1').get()
    if (!runRow) return null

    const reportRows = db
      .prepare<ReportRow, [string]>('SELECT * FROM eval_reports WHERE run_id = ? ORDER BY seq')
      .all(runRow.id)

    return this.assembleRun(runRow, reportRows)
  }

  async listRunSummaries(opts?: { limit?: number; since?: number }): Promise<EvalRunSummary[]> {
    const db = this.getDb()
    if (!db) return []

    const limit = opts?.limit ?? 50
    const sinceTs = opts?.since

    const rows: RunRow[] =
      sinceTs !== undefined
        ? db
            .prepare<RunRow, [number, number]>(
              'SELECT * FROM eval_runs WHERE started_at >= ? ORDER BY started_at DESC LIMIT ?'
            )
            .all(sinceTs, limit)
        : db.prepare<RunRow, [number]>('SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT ?').all(limit)

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      passed: r.passed,
      failed: r.failed,
      total: r.total,
      duration: r.duration,
      botDuration: r.bot_duration,
      evalDuration: r.eval_duration,
      filter: r.filter_json ? (JSON.parse(r.filter_json) as EvalFilter) : undefined,
      evalNames: JSON.parse(r.eval_names) as string[],
      aborted: r.aborted === 1,
    }))
  }

  async listEvalReportsByName(
    evalName: string,
    opts?: { limit?: number; since?: number }
  ): Promise<EvalReportHistoryEntry[]> {
    const db = this.getDb()
    if (!db) return []

    const limit = opts?.limit ?? 20
    const sinceTs = opts?.since

    type JoinedRow = ReportRow & {
      run_timestamp: string
      run_total: number
      run_filter_json: string | null
    }

    const baseSql = `
      SELECT er.*,
             r.timestamp    AS run_timestamp,
             r.total        AS run_total,
             r.filter_json  AS run_filter_json
      FROM eval_reports er
      JOIN eval_runs r ON r.id = er.run_id
      WHERE er.name = ?
    `

    const rows: JoinedRow[] =
      sinceTs !== undefined
        ? db
            .prepare<JoinedRow, [string, number, number]>(
              `${baseSql} AND er.started_at >= ? ORDER BY er.started_at DESC LIMIT ?`
            )
            .all(evalName, sinceTs, limit)
        : db.prepare<JoinedRow, [string, number]>(`${baseSql} ORDER BY er.started_at DESC LIMIT ?`).all(evalName, limit)

    return rows.map((row) => ({
      runId: row.run_id,
      timestamp: row.run_timestamp,
      report: JSON.parse(row.report_json) as EvalReport,
      totalEvalsInRun: row.run_total,
      filter: row.run_filter_json ? (JSON.parse(row.run_filter_json) as EvalFilter) : undefined,
    }))
  }

  async listEvalReportsBulk(opts?: {
    perEval?: number
    since?: number
  }): Promise<Record<string, EvalReportHistoryEntry[]>> {
    const db = this.getDb()
    if (!db) return {}

    const perEval = opts?.perEval ?? 20
    const sinceTs = opts?.since

    type JoinedRow = ReportRow & {
      run_timestamp: string
      run_total: number
      run_filter_json: string | null
    }

    const sinceClause = sinceTs !== undefined ? 'WHERE er.started_at >= ?' : ''
    const sql = `
      WITH ranked AS (
        SELECT er.*, ROW_NUMBER() OVER (PARTITION BY name ORDER BY started_at DESC) AS rn
        FROM eval_reports er
        ${sinceClause}
      )
      SELECT ranked.run_id, ranked.name, ranked.started_at, ranked.pass,
             ranked.duration, ranked.type, ranked.error, ranked.report_json,
             r.timestamp   AS run_timestamp,
             r.total       AS run_total,
             r.filter_json AS run_filter_json
      FROM ranked
      JOIN eval_runs r ON r.id = ranked.run_id
      WHERE ranked.rn <= ?
      ORDER BY ranked.name, ranked.started_at DESC
    `

    const rows: JoinedRow[] =
      sinceTs !== undefined
        ? db.prepare<JoinedRow, [number, number]>(sql).all(sinceTs, perEval)
        : db.prepare<JoinedRow, [number]>(sql).all(perEval)

    const out: Record<string, EvalReportHistoryEntry[]> = {}
    for (const row of rows) {
      const entry: EvalReportHistoryEntry = {
        runId: row.run_id,
        timestamp: row.run_timestamp,
        report: JSON.parse(row.report_json) as EvalReport,
        totalEvalsInRun: row.run_total,
        filter: row.run_filter_json ? (JSON.parse(row.run_filter_json) as EvalFilter) : undefined,
      }
      const arr = out[row.name]
      if (arr) arr.push(entry)
      else out[row.name] = [entry]
    }
    return out
  }

  // ── Live run tracking ──────────────────────────────────────────────

  async *watchRun(_signal?: AbortSignal, _options?: EvalWatchOptions): AsyncIterable<EvalProgressEvent> {
    // Local runs push progress events directly via SSE (handleRunEvals owns
    // the stream). This method satisfies the interface but is not the
    // primary consumption path for local runs.
  }

  // ── Runner state ───────────────────────────────────────────────────

  async getRunnerState(): Promise<{ running: boolean; runId: string | null }> {
    const runId = this._getActiveRunId()
    return { running: runId !== null, runId }
  }

  // ── Extra (not on EvalStore interface) ──────────────────────────────

  async listRunResults(limit = 50, sinceTs?: number): Promise<EvalRunReport[]> {
    const db = this.getDb()
    if (!db) return []

    let runRows: RunRow[]
    if (sinceTs !== undefined) {
      runRows = db
        .prepare<RunRow, [number, number]>(
          'SELECT * FROM eval_runs WHERE started_at >= ? ORDER BY started_at DESC LIMIT ?'
        )
        .all(sinceTs, limit)
    } else {
      runRows = db.prepare<RunRow, [number]>('SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT ?').all(limit)
    }

    if (runRows.length === 0) return []

    const ids = runRows.map((r) => r.id)
    const placeholders = ids.map(() => '?').join(',')
    const reportRows = db
      .prepare<ReportRow, string[]>(`SELECT * FROM eval_reports WHERE run_id IN (${placeholders}) ORDER BY seq`)
      .all(...ids)

    const byRun = new Map<string, ReportRow[]>()
    for (const row of reportRows) {
      const arr = byRun.get(row.run_id)
      if (arr) arr.push(row)
      else byRun.set(row.run_id, [row])
    }

    return runRows.map((row) => this.assembleRun(row, byRun.get(row.id) ?? []))
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  close(): void {
    try {
      this.db?.close()
    } catch {
      // silent
    }
    this.db = null
    this.insertRunStmt = null
    this.insertReportStmt = null
  }

  getDbPath(): string {
    return this.dbPath
  }

  // ── SQLite internals ───────────────────────────────────────────────

  private getDb(): Database | null {
    if (this.db) return this.db

    mkdirSync(this.evalsDir, { recursive: true })

    try {
      this.db = new Database(this.dbPath)
      this.db.run('PRAGMA journal_mode=WAL')
      this.db.run('PRAGMA synchronous=NORMAL')
      this.db.run('PRAGMA busy_timeout=5000')
      this.db.run('PRAGMA foreign_keys=ON')
      this.db.run(SCHEMA)

      this.setMeta('schema_version', SCHEMA_VERSION)

      this.insertRunStmt = this.db.prepare(`
        INSERT OR REPLACE INTO eval_runs (
          id, timestamp, started_at, passed, failed, total, duration,
          bot_duration, eval_duration, aborted, filter_json, eval_names
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      this.insertReportStmt = this.db.prepare(`
        INSERT OR REPLACE INTO eval_reports (
          run_id, seq, name, started_at, pass, duration, type, error, report_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)

      this.importLegacyJsonRunsIfNeeded()

      return this.db
    } catch (err) {
      console.warn('[local-eval-store] Failed to initialize database:', err)
      try {
        this.db?.close()
      } catch {
        // best effort
      }
      try {
        if (existsSync(this.dbPath)) {
          renameSync(this.dbPath, `${this.dbPath}.corrupt-${Date.now()}`)
        }
      } catch {
        // best effort
      }
      this.db = null
      this.insertRunStmt = null
      this.insertReportStmt = null
      return null
    }
  }

  private getMeta(key: string): string | null {
    const db = this.db
    if (!db) return null
    const row = db.prepare<{ value: string }, [string]>('SELECT value FROM schema_meta WHERE key = ?').get(key)
    return row?.value ?? null
  }

  private setMeta(key: string, value: string): void {
    const db = this.db
    if (!db) return
    db.prepare('INSERT OR REPLACE INTO schema_meta (key, value) VALUES (?, ?)').run(key, value)
  }

  private importLegacyJsonRunsIfNeeded(): void {
    const db = this.db
    if (!db) return
    if (this.getMeta('imported_legacy') === '1') return

    const legacyDir = join(this.evalsDir, 'runs')
    if (!existsSync(legacyDir)) {
      this.setMeta('imported_legacy', '1')
      return
    }

    let files: string[] = []
    try {
      files = readdirSync(legacyDir).filter((f) => f.endsWith('.json'))
    } catch (err) {
      console.warn('[local-eval-store] Could not read legacy runs dir:', err)
      return
    }

    if (files.length === 0) {
      this.setMeta('imported_legacy', '1')
      return
    }

    let imported = 0
    let skipped = 0
    db.run('BEGIN')
    try {
      for (const file of files) {
        db.run('SAVEPOINT import_file')
        try {
          const raw = readFileSync(join(legacyDir, file), 'utf-8')
          const report = JSON.parse(raw) as EvalRunReport
          this.insertRunReport(report)
          db.run('RELEASE import_file')
          imported++
        } catch (err) {
          db.run('ROLLBACK TO import_file')
          db.run('RELEASE import_file')
          skipped++
          console.warn(`[local-eval-store] Skipping unreadable legacy run ${file}:`, err)
        }
      }
      this.setMeta('imported_legacy', '1')
      db.run('COMMIT')
    } catch (err) {
      db.run('ROLLBACK')
      console.warn('[local-eval-store] Legacy import failed, will retry on next start:', err)
      return
    }

    try {
      renameSync(legacyDir, join(this.evalsDir, 'runs.json-migrated'))
    } catch (err) {
      console.warn('[local-eval-store] Could not rename legacy runs dir:', err)
    }

    console.log(
      `[local-eval-store] Imported ${imported} legacy eval run${imported === 1 ? '' : 's'}` +
        (skipped > 0 ? ` (${skipped} skipped)` : '')
    )
  }

  private insertRunReport(report: EvalRunReport): void {
    if (!this.insertRunStmt || !this.insertReportStmt) return

    const startedAt = Date.parse(report.timestamp)
    const { botDuration, evalDuration } = aggregateTurnTimings(report)

    this.insertRunStmt.run(
      report.id,
      report.timestamp,
      Number.isNaN(startedAt) ? 0 : startedAt,
      report.passed,
      report.failed,
      report.total,
      report.duration,
      botDuration,
      evalDuration,
      report.aborted ? 1 : 0,
      report.filter ? JSON.stringify(report.filter) : null,
      JSON.stringify(report.evals.map((e) => e.name))
    )

    for (let i = 0; i < report.evals.length; i++) {
      const evalReport = report.evals[i]!
      this.insertReportStmt.run(
        report.id,
        i,
        evalReport.name,
        Number.isNaN(startedAt) ? 0 : startedAt,
        evalReport.pass ? 1 : 0,
        evalReport.duration,
        evalReport.type ?? null,
        evalReport.error ?? null,
        JSON.stringify(evalReport)
      )
    }
  }

  private assembleRun(runRow: RunRow, reportRows: ReportRow[]): EvalRunReport {
    const evals = reportRows.map((r) => JSON.parse(r.report_json) as EvalReport)
    const report: EvalRunReport = {
      id: runRow.id,
      timestamp: runRow.timestamp,
      evals,
      passed: runRow.passed,
      failed: runRow.failed,
      total: runRow.total,
      duration: runRow.duration,
    }
    if (runRow.filter_json) {
      report.filter = JSON.parse(runRow.filter_json) as EvalFilter
    }
    if (runRow.aborted === 1) {
      report.aborted = true
    }
    return report
  }
}

// ── Module-level singleton per agentPath ─────────────────────────────

const stores = new Map<string, LocalEvalStore>()

export function getLocalEvalStore(agentPath: string, getActiveRunId?: () => string | null): LocalEvalStore {
  let store = stores.get(agentPath)
  if (!store) {
    store = new LocalEvalStore({ agentPath, getActiveRunId })
    stores.set(agentPath, store)
  }
  return store
}

export function closeLocalEvalStores(agentPath?: string): void {
  if (agentPath) {
    stores.get(agentPath)?.close()
    stores.delete(agentPath)
    return
  }
  for (const store of stores.values()) store.close()
  stores.clear()
}
