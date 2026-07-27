import {
  AxiosError,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { describe, expect, it } from 'vitest'

import { Client } from './index'

describe('transitionTableUniqueKey', () => {
  it('sends the control-plane transition contract and returns authoritative state', async () => {
    let request: InternalAxiosRequestConfig | undefined
    const api = new Client({
      apiUrl: 'https://botruntime.example',
      workspaceId: 'workspace-2',
      botId: '35',
      token: 'workspace-admin-token',
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
          table: {
            id: 'AgentEventTable',
            name: 'AgentEventTable',
            factor: 1,
            frozen: false,
            keyColumn: 'eventKey',
            keyColumnUnique: true,
            keyColumnUniqueState: 'enabled',
            schema: { type: 'object', properties: {} },
            tags: {},
            isComputeEnabled: true,
            createdAt: '2026-07-27T00:00:00Z',
            updatedAt: '2026-07-27T00:00:00Z',
          },
        },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    }

    await expect(
      api.transitionTableUniqueKey({
        table: 'AgentEvent/Table',
        enabled: true,
      })
    ).resolves.toMatchObject({
      table: {
        name: 'AgentEventTable',
        keyColumn: 'eventKey',
        keyColumnUnique: true,
        keyColumnUniqueState: 'enabled',
      },
    })

    expect(request).toMatchObject({
      method: 'put',
      url: '/v1/tables/AgentEvent%2FTable/unique-key',
      data: JSON.stringify({ enabled: true }),
    })
    expect(request?.headers.get('x-workspace-id')).toBe('workspace-2')
    expect(request?.headers.get('x-bot-id')).toBe('35')
    expect(request?.headers.get('Authorization')).toBe('Bearer workspace-admin-token')
  })

  it('preserves the 409 unique-state recovery contract', async () => {
    const api = new Client({
      apiUrl: 'https://botruntime.example',
      workspaceId: 'workspace-2',
      botId: '35',
      token: 'workspace-admin-token',
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
      throw new AxiosError(
        'Request failed with status code 409',
        AxiosError.ERR_BAD_RESPONSE,
        config,
        undefined,
        {
          data: {
            code: 409,
            type: 'ResourceLockedConflict',
            id: 'unique-state-conflict',
            message: 'table unique-key transition is already in progress',
            metadata: {
              errorCode: 'TABLE_UNIQUE_STATE_CONFLICT',
              retryable: false,
              recovery: 'wait_for_terminal_state',
            },
          },
          status: 409,
          statusText: 'Conflict',
          headers: {},
          config,
        }
      )
    }

    await expect(
      api.transitionTableUniqueKey({
        table: 'AgentEventTable',
        enabled: true,
      })
    ).rejects.toMatchObject({
      code: 409,
      type: 'ResourceLockedConflict',
      id: 'unique-state-conflict',
      metadata: {
        errorCode: 'TABLE_UNIQUE_STATE_CONFLICT',
        retryable: false,
        recovery: 'wait_for_terminal_state',
      },
    })
  })
})
