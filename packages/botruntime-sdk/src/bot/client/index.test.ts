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
