import { describe, expect, it, vi } from 'vitest'
import {
  createDestructiveTableConfirm,
  syncAdkTables,
  type TableSyncItem,
  type TableSyncManager,
  type TableSyncResult,
} from './adk-table-sync'

function fakeManager(items: TableSyncItem[], result: Partial<TableSyncResult> = {}): {
  manager: TableSyncManager
  executeSync: ReturnType<typeof vi.fn>
} {
  const executeSync = vi.fn().mockResolvedValue({
    success: result.success ?? items,
    failed: result.failed ?? [],
    skipped: result.skipped ?? [],
  } satisfies TableSyncResult)
  const manager: TableSyncManager = {
    createSyncPlan: vi.fn().mockResolvedValue({ items }),
    executeSync,
  }
  return { manager, executeSync }
}

function collectLog(): { log: (line: string) => void; lines: string[] } {
  const lines: string[] = []
  return { log: (line: string) => lines.push(line), lines }
}

describe('syncAdkTables', () => {
  it('creates a table that does not exist remotely', async () => {
    const item: TableSyncItem = { operation: 'create', localTable: { name: 'Leads' } }
    const { manager, executeSync } = fakeManager([item])
    const confirm = vi.fn()
    const { log, lines } = collectLog()

    await syncAdkTables(manager, confirm, log)

    expect(executeSync).toHaveBeenCalledWith({ items: [item] }, { confirmDestructive: false })
    expect(confirm).not.toHaveBeenCalled()
    expect(lines).toContain('  Leads: created')
    expect(lines.at(-1)).toBe('tables synchronized (1 created, 0 updated, 0 up to date)')
  })

  it('updates an existing table whose schema lags (non-destructive add)', async () => {
    const item: TableSyncItem = {
      operation: 'update',
      localTable: { name: 'Leads' },
      remoteTable: { name: 'Leads' },
      columnChanges: [{ type: 'add', columnName: 'phone' }],
    }
    const { manager, executeSync } = fakeManager([item])
    const confirm = vi.fn()
    const { log, lines } = collectLog()

    await syncAdkTables(manager, confirm, log)

    // additive changes are not destructive — no confirm needed.
    expect(confirm).not.toHaveBeenCalled()
    expect(executeSync).toHaveBeenCalledWith({ items: [item] }, { confirmDestructive: false })
    expect(lines).toContain('  Leads: updated')
  })

  it('idempotency: a matching schema issues zero sync calls and prints up to date', async () => {
    const item: TableSyncItem = { operation: 'none', localTable: { name: 'Leads' }, remoteTable: { name: 'Leads' } }
    const { manager, executeSync } = fakeManager([item])
    const confirm = vi.fn()
    const { log, lines } = collectLog()

    await syncAdkTables(manager, confirm, log)

    expect(confirm).not.toHaveBeenCalled()
    // executeSync is still invoked once (TableManager itself no-ops 'none'
    // items internally — no createTable/updateTable call results from it),
    // but never with a create/update operation.
    expect(executeSync).toHaveBeenCalledTimes(1)
    expect(executeSync.mock.calls[0]![0].items).toEqual([item])
    expect(lines).toContain('  Leads: up to date')
    expect(lines.at(-1)).toBe('tables synchronized (0 created, 0 updated, 1 up to date)')
  })

  it('a repeat run over an all-none plan never regresses to created/updated', async () => {
    const items: TableSyncItem[] = [
      { operation: 'none', localTable: { name: 'A' }, remoteTable: { name: 'A' } },
      { operation: 'none', localTable: { name: 'B' }, remoteTable: { name: 'B' } },
    ]
    const { manager } = fakeManager(items)
    const { log, lines } = collectLog()

    await syncAdkTables(manager, vi.fn(), log)

    expect(lines.filter((l) => l.includes('created') && !l.startsWith('tables synchronized'))).toHaveLength(0)
    expect(lines.filter((l) => l.includes('updated') && !l.startsWith('tables synchronized'))).toHaveLength(0)
    expect(lines.at(-1)).toBe('tables synchronized (0 created, 0 updated, 2 up to date)')
  })

  it('gates a destructive column change (remove) behind confirm and applies it when accepted', async () => {
    const item: TableSyncItem = {
      operation: 'update',
      localTable: { name: 'Leads' },
      remoteTable: { name: 'Leads' },
      columnChanges: [{ type: 'remove', columnName: 'oldField' }],
    }
    const { manager, executeSync } = fakeManager([item])
    const confirm = vi.fn().mockResolvedValue(true)
    const { log, lines } = collectLog()

    await syncAdkTables(manager, confirm, log)

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('remove column "oldField"'))
    expect(executeSync).toHaveBeenCalledWith({ items: [item] }, { confirmDestructive: false })
    expect(lines).toContain('  Leads: updated')
  })

  it('drops a destructive column change when the confirm is declined, without touching the server', async () => {
    const item: TableSyncItem = {
      operation: 'update',
      localTable: { name: 'Leads' },
      remoteTable: { name: 'Leads' },
      columnChanges: [{ type: 'modify', columnName: 'age' }],
    }
    const { manager, executeSync } = fakeManager([item])
    const confirm = vi.fn().mockResolvedValue(false)
    const { log, lines } = collectLog()

    await syncAdkTables(manager, confirm, log)

    expect(executeSync).not.toHaveBeenCalled()
    expect(lines).toContain('  Leads: skipped (declined destructive change)')
    expect(lines.at(-1)).toBe('tables synchronized (0 created, 0 updated, 0 up to date)')
  })

  it('gates table delete behind confirm and skips it (via TableManager) when declined', async () => {
    const item: TableSyncItem = { operation: 'delete', remoteTable: { name: 'Orphan' } }
    const { manager, executeSync } = fakeManager([item], { skipped: [item], success: [] })
    const confirm = vi.fn().mockResolvedValue(false)
    const { log, lines } = collectLog()

    await syncAdkTables(manager, confirm, log)

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('DELETE them'))
    expect(executeSync).toHaveBeenCalledWith({ items: [item] }, { confirmDestructive: false })
    expect(lines.some((l) => l.includes('Orphan: skipped (not deleted'))).toBe(true)
  })

  it('deletes an orphaned table when confirmed', async () => {
    const item: TableSyncItem = { operation: 'delete', remoteTable: { name: 'Orphan' } }
    const { manager, executeSync } = fakeManager([item])
    const confirm = vi.fn().mockResolvedValue(true)
    const { log, lines } = collectLog()

    await syncAdkTables(manager, confirm, log)

    expect(executeSync).toHaveBeenCalledWith({ items: [item] }, { confirmDestructive: true })
    expect(lines).toContain('  Orphan: deleted')
  })

  it('reports a frozen-table update rejection as skipped-frozen, not a failure', async () => {
    const item: TableSyncItem = {
      operation: 'update',
      localTable: { name: 'Locked' },
      remoteTable: { name: 'Locked' },
      columnChanges: [{ type: 'add', columnName: 'x' }],
    }
    const frozenError = new Error('table is frozen: schema and name are locked (only deletion is allowed)')
    const { manager } = fakeManager([item], { success: [], failed: [{ item, error: frozenError }] })
    const { log, lines } = collectLog()

    await expect(syncAdkTables(manager, vi.fn(), log)).resolves.toBeUndefined()

    expect(lines).toContain('  Locked: skipped (frozen)')
    expect(lines.at(-1)).toBe('tables synchronized (0 created, 0 updated, 0 up to date, 1 skipped-frozen)')
  })

  it('fails loud when the server rejects a table sync for a reason other than frozen', async () => {
    const item: TableSyncItem = { operation: 'create', localTable: { name: 'Broken' } }
    const serverError = new Error('HTTP 500 internal error')
    const { manager } = fakeManager([item], { success: [], failed: [{ item, error: serverError }] })
    const { log } = collectLog()

    await expect(syncAdkTables(manager, vi.fn(), log)).rejects.toThrow(/1 table\(s\) failed/)
  })

  it('logs "none declared" and performs no sync call when the plan is empty', async () => {
    const { manager, executeSync } = fakeManager([])
    const { log, lines } = collectLog()

    await syncAdkTables(manager, vi.fn(), log)

    expect(executeSync).not.toHaveBeenCalled()
    expect(lines).toEqual(['tables: none declared'])
  })
})

// createDestructiveTableConfirm — the confirm() wired into syncAdkTables at the
// deploy-command.ts call site. Every confirm() call inside syncAdkTables is,
// by construction, for a destructive change (column remove/modify or an
// orphaned-table delete), so this is the ONE gate all of them pass through.
describe('createDestructiveTableConfirm', () => {
  it('never satisfies a destructive confirm via the blanket -y/--confirm flag: without --allow-destructive-table-changes and without a TTY, it fails loud instead of hanging in a prompt', async () => {
    const promptConfirm = vi.fn()
    const confirm = createDestructiveTableConfirm({ allowDestructive: false, isTTY: false, promptConfirm })

    await expect(confirm('table "Leads": remove column "ssn" — this is a destructive change')).rejects.toThrow(
      /allow-destructive-table-changes/
    )
    expect(promptConfirm).not.toHaveBeenCalled()
  })

  it('in a TTY session, falls through to the REAL interactive prompt (not auto-approved by -y)', async () => {
    const promptConfirm = vi.fn().mockResolvedValue(true)
    const confirm = createDestructiveTableConfirm({ allowDestructive: false, isTTY: true, promptConfirm })

    await expect(confirm('destructive?')).resolves.toBe(true)
    expect(promptConfirm).toHaveBeenCalledWith('destructive?')
  })

  it('propagates a declined interactive prompt (TTY, no --allow-destructive-table-changes)', async () => {
    const promptConfirm = vi.fn().mockResolvedValue(false)
    const confirm = createDestructiveTableConfirm({ allowDestructive: false, isTTY: true, promptConfirm })

    await expect(confirm('destructive?')).resolves.toBe(false)
  })

  it('with --allow-destructive-table-changes, auto-approves without prompting (even without a TTY)', async () => {
    const promptConfirm = vi.fn()
    const confirm = createDestructiveTableConfirm({ allowDestructive: true, isTTY: false, promptConfirm })

    await expect(confirm('destructive?')).resolves.toBe(true)
    expect(promptConfirm).not.toHaveBeenCalled()
  })
})
