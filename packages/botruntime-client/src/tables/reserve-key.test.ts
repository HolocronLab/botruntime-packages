import type { AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'

import { Client } from '../public'

describe('reserveTableKey', () => {
  it('sends the exact idempotent wire contract and returns the winner branch', async () => {
    let request: InternalAxiosRequestConfig | undefined
    const api = new Client({
      apiUrl: 'https://botruntime.example',
      botId: 'bot-42',
      token: 'machine-token',
    })
    ;(api as any)._customAxiosInstance.defaults.adapter = async (
      config: InternalAxiosRequestConfig
    ): Promise<AxiosResponse> => {
      request = config
      return {
        data: {
          row: {
            id: 7,
            rowVersion: 3,
            createdAt: '2026-07-26T00:00:00Z',
            updatedAt: '2026-07-26T00:00:00Z',
            commandId: 'cmd-1',
            payload: 'winner',
          },
          created: false,
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    await expect(
      api.reserveTableKey({
        table: 'Command/Table',
        row: { commandId: 'cmd-1', payload: 'loser' },
        idempotencyKey: 'reserve-command-1',
      })
    ).resolves.toMatchObject({
      created: false,
      row: {
        id: 7,
        rowVersion: 3,
        commandId: 'cmd-1',
        payload: 'winner',
      },
    })

    expect(request).toMatchObject({
      method: 'post',
      url: '/v1/tables/Command%2FTable/rows/reserve',
      data: JSON.stringify({
        row: { commandId: 'cmd-1', payload: 'loser' },
      }),
    })
    expect(request?.headers.get('Idempotency-Key')).toBe('reserve-command-1')
    expect(request?.headers.get('x-bot-id')).toBe('bot-42')
    expect(request?.headers.get('Authorization')).toBe('Bearer machine-token')
  })
})
