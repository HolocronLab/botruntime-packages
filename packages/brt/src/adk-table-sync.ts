import * as errors from './errors'

// adk-table-sync — the brt-side WIRING around @holocronlab/botruntime-adk's
// TableManager (packages/botruntime-adk/src/tables/table-manager.ts): full,
// unconditional schema sync at deploy time, Botpress parity. TableManager
// itself owns the diff/normalization engine (createSyncPlan) and the actual
// create/update/rename/delete calls (executeSync); this module only adds the
// brt CLI concerns TableManager deliberately leaves to its caller — per-table
// logging and the interactive confirm gate on destructive changes (upstream
// UX: tables/tables-publisher.ts).
//
// The types below are a MINIMAL structural subset of botruntime-adk's real
// TableSyncPlan/TableSyncItem/TableSyncResult (declared independently, not
// imported) so this module — and its unit tests — never need the actual
// (heavy) botruntime-adk runtime. The real TableManager instance is passed in
// by the caller (deploy-command.ts) and satisfies this shape structurally.

export interface TableSyncColumnChange {
  type: string // 'add' | 'remove' | 'modify' | 'rename'
  columnName: string
  oldColumnName?: string
}

export interface TableSyncItem {
  operation: string // 'create' | 'update' | 'delete' | 'none'
  localTable?: { name: string }
  remoteTable?: { name: string }
  columnChanges?: TableSyncColumnChange[]
}

export interface TableSyncPlan {
  items: TableSyncItem[]
}

export interface TableSyncResult {
  success: TableSyncItem[]
  failed: Array<{ item: TableSyncItem; error: Error }>
  skipped: TableSyncItem[]
}

export interface TableSyncManager {
  createSyncPlan(): Promise<TableSyncPlan>
  executeSync(plan: TableSyncPlan, options: { confirmDestructive?: boolean }): Promise<TableSyncResult>
}

export type ConfirmFn = (message: string) => Promise<boolean>

// FROZEN_ERROR_MARKER matches cloudapi's literal reject message for a frozen
// table (api/internal/cloudapi/handlers_tables.go: "table is frozen: schema
// and name are locked (only deletion is allowed)"). TableManager's own
// RemoteTable shape drops the `frozen` flag the server actually returns, so
// this is the only signal available, short of a second raw listTables call,
// to tell a proactively-known-immutable table apart from a real failure.
const FROZEN_ERROR_MARKER = 'table is frozen'

const CONFIRM_HINT = '(pass -y/--confirm to accept non-interactively)'

const ALLOW_DESTRUCTIVE_FLAG = '--allow-destructive-table-changes'

export interface DestructiveTableConfirmDeps {
  // --allow-destructive-table-changes (deploy-command.ts argv), deliberately
  // SEPARATE from -y/--confirm.
  allowDestructive: boolean
  // process.stdin.isTTY — without a TTY, the underlying `prompts()` call never
  // resolves (nothing to read the answer from), so a destructive change would
  // otherwise hang the deploy forever instead of failing.
  isTTY: boolean
  // The REAL interactive prompt (CLIPrompt.confirmInteractive), which must
  // itself ignore the blanket -y bypass — see prompt-utils.ts.
  promptConfirm: ConfirmFn
}

// createDestructiveTableConfirm builds the ConfirmFn passed into syncAdkTables.
// Every confirm() call inside syncAdkTables gates a destructive change (column
// remove/modify, orphaned-table delete — see isDestructive/toDelete below), so
// this is the single choke point for all of them. The blanket -y/--confirm CLI
// flag must NOT satisfy it: CLIPrompt.confirm's built-in -y bypass exists for
// routine "are you sure you want to deploy"-style prompts, and reusing it here
// would let an unrelated -y (e.g. for the deploy-bot confirm) silently nuke
// column data or drop tables with zero visibility. Instead: an explicit
// --allow-destructive-table-changes auto-approves; absent that, a non-TTY
// session fails loud immediately (with the flag name) rather than hanging in
// `prompts()`; an interactive TTY still gets the real prompt.
export function createDestructiveTableConfirm(deps: DestructiveTableConfirmDeps): ConfirmFn {
  return async (message: string) => {
    if (deps.allowDestructive) {
      return true
    }
    if (!deps.isTTY) {
      throw new errors.BotpressCLIError(
        `${message}\nRefusing to apply a destructive table change non-interactively (no TTY to prompt). ` +
          `Pass ${ALLOW_DESTRUCTIVE_FLAG} to proceed without a prompt.`
      )
    }
    return deps.promptConfirm(message)
  }
}

function tableName(item: TableSyncItem): string {
  return item.localTable?.name ?? item.remoteTable?.name ?? '(unknown)'
}

function describeColumnChange(c: TableSyncColumnChange): string {
  if (c.type === 'remove') return `remove column "${c.columnName}"`
  if (c.type === 'modify') return `change the type of column "${c.columnName}"`
  return `${c.type} column "${c.columnName}"`
}

function isDestructive(c: TableSyncColumnChange): boolean {
  return c.type === 'remove' || c.type === 'modify'
}

// syncAdkTables drives a full TableManager sync (createSyncPlan -> confirm
// gates -> executeSync) and logs one line per table: created / updated / up
// to date / skipped-frozen / skipped (declined). Idempotent by construction:
// TableManager classifies an unchanged table as operation 'none', which this
// function logs as "up to date" and passes through to executeSync unchanged —
// executeSync itself no-ops 'none' items (no network call), so a repeat
// deploy against unchanged schemas issues zero createTable/updateTable calls.
export async function syncAdkTables(manager: TableSyncManager, confirm: ConfirmFn, log: (line: string) => void): Promise<void> {
  const plan = await manager.createSyncPlan()

  if (plan.items.length === 0) {
    log('tables: none declared')
    return
  }

  // Gate destructive column changes (remove / type change) bundled inside an
  // Update item BEFORE executing: TableManager applies them as part of a
  // single updateTable call with no confirm knob of its own. Declined items
  // are dropped from the plan (skip that table, keep syncing the rest) rather
  // than aborting the whole deploy.
  const approved: TableSyncItem[] = []
  let declined = 0
  for (const item of plan.items) {
    if (item.operation === 'update') {
      const destructive = (item.columnChanges ?? []).filter(isDestructive)
      if (destructive.length > 0) {
        const name = tableName(item)
        const ok = await confirm(
          `table "${name}": ${destructive.map(describeColumnChange).join(', ')} — this is a destructive ` +
            `schema change (data loss). Continue? ${CONFIRM_HINT}`
        )
        if (!ok) {
          log(`  ${name}: skipped (declined destructive change)`)
          declined++
          continue
        }
      }
    }
    approved.push(item)
  }

  if (approved.length === 0) {
    log('tables synchronized (0 created, 0 updated, 0 up to date)')
    return
  }

  // A table dropped from the local declaration is a Delete item; TableManager
  // itself skips deletes unless confirmDestructive is set (upstream
  // TablesPublisher never deletes at all — this fork adds it, gated).
  const toDelete = approved.filter((i) => i.operation === 'delete')
  const confirmDestructive =
    toDelete.length > 0
      ? await confirm(
          `table(s) ${toDelete.map(tableName).join(', ')} are no longer declared locally — DELETE them and ` +
            `ALL their rows? ${CONFIRM_HINT}`
        )
      : false

  const result = await manager.executeSync({ items: approved }, { confirmDestructive })

  let created = 0
  let updated = 0
  let upToDate = 0
  let deleted = 0
  let skippedFrozen = 0
  let skippedNotDeleted = 0
  let failed = 0

  for (const item of approved) {
    const name = tableName(item)

    const failure = result.failed.find((f) => f.item === item)
    if (failure) {
      if (failure.error.message.includes(FROZEN_ERROR_MARKER)) {
        log(`  ${name}: skipped (frozen)`)
        skippedFrozen++
      } else {
        log(`  ${name}: FAILED — ${failure.error.message}`)
        failed++
      }
      continue
    }

    if (result.skipped.includes(item)) {
      log(`  ${name}: skipped (not deleted; declared removed locally — ${CONFIRM_HINT})`)
      skippedNotDeleted++
      continue
    }

    switch (item.operation) {
      case 'none':
        log(`  ${name}: up to date`)
        upToDate++
        break
      case 'create':
        log(`  ${name}: created`)
        created++
        break
      case 'update':
        log(`  ${name}: updated`)
        updated++
        break
      case 'delete':
        log(`  ${name}: deleted`)
        deleted++
        break
    }
  }

  const parts = [`${created} created`, `${updated} updated`, `${upToDate} up to date`]
  if (deleted > 0) parts.push(`${deleted} deleted`)
  if (skippedFrozen > 0) parts.push(`${skippedFrozen} skipped-frozen`)
  if (declined > 0) parts.push(`${declined} declined`)
  if (skippedNotDeleted > 0) parts.push(`${skippedNotDeleted} skipped-not-deleted`)
  if (failed > 0) parts.push(`${failed} failed`)
  log(`tables synchronized (${parts.join(', ')})`)

  if (failed > 0) {
    throw new errors.BotpressCLIError(`table sync: ${failed} table(s) failed`)
  }
}
