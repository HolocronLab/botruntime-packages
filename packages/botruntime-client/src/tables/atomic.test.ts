import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'

import { Client } from '../public'
import { atomicReference } from './atomic'

describe('atomicTables', () => {
  it('sends one batch idempotency key and returns exact ordered results', async () => {
    let request: InternalAxiosRequestConfig | undefined
    const api = new Client({
      apiUrl: 'https://botruntime.example',
      botId: 'bot-42',
      token: 'machine-token',
    })
    ;(api as unknown as {
      _customAxiosInstance: {
        defaults: {
          adapter: (config: InternalAxiosRequestConfig) => Promise<AxiosResponse>
        }
      }
    })._customAxiosInstance.defaults.adapter = async (
      config: InternalAxiosRequestConfig
    ): Promise<AxiosResponse> => {
      request = config
      return {
        data: {
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
            {
              operationIndex: 1,
              op: 'createRows',
              rows: [{
                id: 8,
                rowVersion: 1,
                createdAt: '2026-07-26T00:00:00Z',
                updatedAt: '2026-07-26T00:00:00Z',
                reservationId: 7,
              }],
            },
          ],
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    const result = await api.atomicTables({
      idempotencyKey: 'batch-1',
      operations: [
        {
          id: 'reservation',
          op: 'reserveKey',
          table: 'CommandTable',
          row: { commandId: 'cmd-1' },
        },
        {
          op: 'createRows',
          table: 'AuditTable',
          rows: [{ reservationId: atomicReference<number>('reservation', '/row/id') }],
        },
      ],
    })

    expect(result.results[0].created).toBe(true)
    expect(result.results[1].rows[0]?.reservationId).toBe(7)
    expect(request).toMatchObject({
      method: 'post',
      url: '/v1/tables/atomic',
      data: JSON.stringify({
        operations: [
          {
            id: 'reservation',
            op: 'reserveKey',
            table: 'CommandTable',
            row: { commandId: 'cmd-1' },
          },
          {
            op: 'createRows',
            table: 'AuditTable',
            rows: [{
              reservationId: {
                $ref: { operation: 'reservation', path: '/row/id' },
              },
            }],
          },
        ],
      }),
    })
    expect(request?.headers.get('Idempotency-Key')).toBe('batch-1')
  })
})
