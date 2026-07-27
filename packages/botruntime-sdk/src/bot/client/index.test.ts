import type * as client from '@holocronlab/botruntime-client'
import { describe, expect, it, vi } from 'vitest'
import type { BaseBot } from '../common'
import { BotSpecificClient } from '.'

describe('BotSpecificClient integration operations', () => {
  it('proxies start, get, and cancel through the client operation hooks', async () => {
    const operation: client.IntegrationOperation = {
      operationId: 'b3872d6e-efad-4d64-a1ef-269d44e64247',
      status: 'queued',
      actionType: 'test:upload',
      attempt: 0,
      progress: 0,
      deadline: '2026-07-24T01:00:00Z',
      createdAt: '2026-07-24T00:00:00Z',
      updatedAt: '2026-07-24T00:00:00Z',
    }
    const inner = {
      startIntegrationOperation: vi.fn().mockResolvedValue(operation),
      getIntegrationOperation: vi.fn().mockResolvedValue(operation),
      cancelIntegrationOperation: vi.fn().mockResolvedValue(operation),
    } as unknown as client.Client
    const beforeStart = vi.fn(async (input) => ({
      ...input,
      idempotencyKey: `${input.idempotencyKey}-hooked`,
    }))
    const afterStart = vi.fn(async (output) => output)
    const sdk = new BotSpecificClient<BaseBot>(inner, {
      before: { startIntegrationOperation: beforeStart },
      after: { startIntegrationOperation: afterStart },
    })

    await expect(
      sdk.startIntegrationOperation({
        idempotencyKey: 'operation-1',
        type: 'test:upload',
        input: {},
      })
    ).resolves.toEqual(operation)
    await expect(sdk.getIntegrationOperation({ operationId: operation.operationId })).resolves.toEqual(operation)
    await expect(sdk.cancelIntegrationOperation({ operationId: operation.operationId })).resolves.toEqual(operation)

    expect(inner.startIntegrationOperation).toHaveBeenCalledWith({
      idempotencyKey: 'operation-1-hooked',
      type: 'test:upload',
      input: {},
    })
    expect(inner.getIntegrationOperation).toHaveBeenCalledWith({ operationId: operation.operationId })
    expect(inner.cancelIntegrationOperation).toHaveBeenCalledWith({ operationId: operation.operationId })
    expect(afterStart).toHaveBeenCalledWith(operation, {
      idempotencyKey: 'operation-1-hooked',
      type: 'test:upload',
      input: {},
    })
  })
})

describe('BotSpecificClient table consistency operations', () => {
  it('proxies reserveTableKey and atomicTables through hooks with the inner client as this', async () => {
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
    const atomicResult = {
      results: [
        {
          operationIndex: 0,
          id: 'case',
          op: 'reserveKey' as const,
          row: reservation.row,
          created: true,
        },
      ],
    }
    let inner: client.Client
    const reserveTableKey = vi.fn(function (this: client.Client) {
      expect(this).toBe(inner)
      return Promise.resolve(reservation)
    })
    const atomicTables = vi.fn(function (this: client.Client) {
      expect(this).toBe(inner)
      return Promise.resolve(atomicResult)
    })
    inner = {
      reserveTableKey,
      atomicTables,
    } as unknown as client.Client
    const beforeReserve = vi.fn(async (input) => ({
      ...input,
      idempotencyKey: `${input.idempotencyKey}-hooked`,
    }))
    const afterReserve = vi.fn(async (output) => ({
      ...output,
      created: false,
    }))
    const beforeAtomic = vi.fn(async (input) => ({
      ...input,
      idempotencyKey: `${input.idempotencyKey}-hooked`,
    }))
    const afterAtomic = vi.fn(async (output) => output)
    const sdk = new BotSpecificClient<BaseBot>(inner, {
      before: {
        reserveTableKey: beforeReserve,
        atomicTables: beforeAtomic,
      },
      after: {
        reserveTableKey: afterReserve,
        atomicTables: afterAtomic,
      },
    })

    await expect(
      sdk.reserveTableKey({
        table: 'CaseTable',
        row: { caseId: 'case-1' },
        idempotencyKey: 'reserve-1',
      })
    ).resolves.toEqual({
      ...reservation,
      created: false,
    })
    await expect(
      sdk.atomicTables({
        idempotencyKey: 'atomic-1',
        operations: [
          {
            id: 'case',
            op: 'reserveKey',
            table: 'CaseTable',
            row: { caseId: 'case-1' },
          },
        ],
      })
    ).resolves.toEqual(atomicResult)

    expect(reserveTableKey).toHaveBeenCalledWith({
      table: 'CaseTable',
      row: { caseId: 'case-1' },
      idempotencyKey: 'reserve-1-hooked',
    })
    expect(atomicTables).toHaveBeenCalledWith({
      idempotencyKey: 'atomic-1-hooked',
      operations: [
        {
          id: 'case',
          op: 'reserveKey',
          table: 'CaseTable',
          row: { caseId: 'case-1' },
        },
      ],
    })
    expect(afterReserve).toHaveBeenCalledWith(reservation, {
      table: 'CaseTable',
      row: { caseId: 'case-1' },
      idempotencyKey: 'reserve-1-hooked',
    })
    expect(afterAtomic).toHaveBeenCalledWith(atomicResult, {
      idempotencyKey: 'atomic-1-hooked',
      operations: [
        {
          id: 'case',
          op: 'reserveKey',
          table: 'CaseTable',
          row: { caseId: 'case-1' },
        },
      ],
    })
  })
})
