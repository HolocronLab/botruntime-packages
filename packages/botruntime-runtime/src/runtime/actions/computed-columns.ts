import { z } from '@holocronlab/botruntime-sdk'
import { BaseAction } from '../../primitives/action'
import { adk } from '../adk'
import { orderRecomputeColumns } from './order-recompute-columns'
import { context } from '../../runtime'

export const tablesRecomputeRows = new BaseAction({
  name: 'tablesRecomputeRows', // skynet/packages/tables-api/src/services/computed/compute-stale-rows.ts
  input: z.object({
    tableId: z.string(),
    botId: z.string(),
    schema: z.any(),
    requests: z.array(
      z.object({
        row: z.record(z.any()),
        columnsToRecompute: z.array(z.string()),
      })
    ),
  }),
  output: z.object({
    isFinished: z.boolean(),
    rows: z.array(z.any()),
  }),
  handler: async ({ input, client }) => {
    const { tableId, requests } = input
    const { table: remoteTable } = await client._inner.getTable({ table: tableId })
    const table = adk.project.tables.find((x) => x.name === remoteTable.name)

    async function computeRow(
      row: Record<string, unknown>,
      columnsToRecompute: string[]
    ): Promise<Record<string, unknown>> {
      const newRow: Record<string, unknown> = { id: row.id }
      const recompute = orderRecomputeColumns(
        columnsToRecompute,
        new Set((row.stale as string[]) ?? []),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (table?.columns || {}) as any
      )

      for (const colName of recompute) {
        const col = table?.columns[colName]
        if (!col || !col.computed) {
          newRow[colName] = { status: 'error', error: 'Column not found or not computed' }
          continue
        }

        const value = await col.value(row)
        row[colName] = value // Update the original row for dependency computations

        newRow[colName] = {
          status: 'computed',
          value,
        }
      }

      return newRow
    }

    const MIN_REMAINING_TIME_MS = 5000
    const BUFFER_TIME_MS = 5000

    let recomputed: Record<string, unknown>[] = []
    let isFinished = true

    const remainingTime = context.get('runtime').getRemainingExecutionTimeInMs()

    if (remainingTime && remainingTime < MIN_REMAINING_TIME_MS) {
      return { isFinished: false, rows: [] }
    }

    const timeoutPromise = new Promise<void>((resolve) => {
      setTimeout(() => {
        isFinished = false
        resolve()
      }, remainingTime - BUFFER_TIME_MS)
    })

    const allRowsPromise = Promise.all(
      requests.map(async (r) => {
        const computedRow = await computeRow(r.row, r.columnsToRecompute)
        recomputed.push(computedRow)
      })
    )

    await Promise.race([timeoutPromise, allRowsPromise])

    return { isFinished, rows: recomputed }
  },
})
