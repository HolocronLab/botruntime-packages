import type { Client } from '@holocronlab/botruntime-client'
import { BotSpecificClient, z } from '@holocronlab/botruntime-sdk'
import { describe, expect, it, vi } from 'vitest'

import { BaseTable } from '../primitives/table'
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

  it('executes reserveKey and atomic through the real bot-specific client facade', async () => {
    const reservation = {
      row: {
        id: 7,
        rowVersion: 1,
        createdAt: '2026-07-27T00:00:00Z',
        updatedAt: '2026-07-27T00:00:00Z',
        caseId: 'case-1',
      },
      created: true,
    }
    const reserveTableKey = vi.fn().mockResolvedValue(reservation)
    const atomicTables = vi.fn().mockResolvedValue({
      results: [
        {
          operationIndex: 0,
          id: 'reservation',
          op: 'reserveKey',
          ...reservation,
        },
      ],
    })
    const inner = {
      reserveTableKey,
      atomicTables,
    } as unknown as Client
    const botClient = new BotSpecificClient(inner)
    const caseTable = new BaseTable({
      name: 'CaseTable',
      columns: { caseId: z.string() },
      keyColumn: { name: 'caseId', unique: true },
    })

    await context.run(
      { client: botClient } as unknown as BotContext,
      async () => {
        await expect(
          caseTable.reserveKey({
            row: { caseId: 'case-1' },
            idempotencyKey: 'reserve-1',
          })
        ).resolves.toEqual(reservation)
        await expect(
          tables.atomic({
            idempotencyKey: 'atomic-1',
            operations: [
              {
                id: 'reservation',
                op: 'reserveKey',
                table: caseTable,
                row: { caseId: 'case-1' },
              },
            ],
          })
        ).resolves.toMatchObject({
          results: [{ created: true }],
        })
      }
    )

    expect(reserveTableKey).toHaveBeenCalledWith({
      table: 'CaseTable',
      row: { caseId: 'case-1' },
      idempotencyKey: 'reserve-1',
    })
    expect(atomicTables).toHaveBeenCalledWith({
      idempotencyKey: 'atomic-1',
      operations: [
        {
          id: 'reservation',
          op: 'reserveKey',
          table: 'CaseTable',
          row: { caseId: 'case-1' },
        },
      ],
    })
  })
})
