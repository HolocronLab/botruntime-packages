import { describe, expect, it, vi } from 'vitest'

import type { BotContext } from './context/context'
import { context } from './context/context'
import { tables, type AtomicTableContract } from './tables'

describe('tables.atomic', () => {
  it('converts table objects to names and delegates one ordered batch', async () => {
    const atomicTables = vi.fn().mockResolvedValue({
      results: [
        {
          operationIndex: 0,
          id: 'reservation',
          op: 'reserveKey',
          row: {
            id: 7,
            rowVersion: 1,
            createdAt: '2026-07-26T00:00:00Z',
            updatedAt: '2026-07-26T00:00:00Z',
            commandId: 'cmd-1',
          },
          created: true,
        },
      ],
    })
    const commandTable = {
      name: 'CommandTable',
    } as AtomicTableContract<{ commandId: string }, { commandId: string }>

    const result = await context.run(
      { client: { atomicTables } } as unknown as BotContext,
      () => tables.atomic({
        idempotencyKey: 'batch-1',
        operations: [{
          id: 'reservation',
          op: 'reserveKey',
          table: commandTable,
          row: { commandId: 'cmd-1' },
        }],
      })
    )

    expect(result.results[0].created).toBe(true)
    expect(atomicTables).toHaveBeenCalledWith({
      idempotencyKey: 'batch-1',
      operations: [{
        id: 'reservation',
        op: 'reserveKey',
        table: 'CommandTable',
        row: { commandId: 'cmd-1' },
      }],
    })
  })
})
