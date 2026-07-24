import { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'
import { IntegrationOperationConflictError, isApiError } from '../errors'
import { Client } from '../public'
import type { IntegrationOperation } from '.'

const operation: IntegrationOperation = {
  operationId: 'b3872d6e-efad-4d64-a1ef-269d44e64247',
  status: 'queued',
  actionType: 'yadisk:uploadDocument',
  attempt: 0,
  progress: 0,
  deadline: '2026-07-24T01:00:00Z',
  createdAt: '2026-07-24T00:00:00Z',
  updatedAt: '2026-07-24T00:00:00Z',
}

const abandoned: IntegrationOperation = {
  ...operation,
  status: 'abandoned',
}

void abandoned

const success = (
  config: InternalAxiosRequestConfig,
  status = 200
): AxiosResponse<IntegrationOperation> => ({
  data: operation,
  status,
  statusText: status === 202 ? 'Accepted' : 'OK',
  headers: {},
  config,
})

describe('integration operation client', () => {
  it('sends the exact start/get/cancel wire contract and preserves operation responses', async () => {
    const requests: InternalAxiosRequestConfig[] = []
    const api = new Client({
      apiUrl: 'https://botruntime.example',
      botId: 'bot-42',
      token: 'machine-token',
    })
    ;(api as any)._customAxiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      requests.push(config)
      return success(config, config.url === '/v1/chat/integration-operations' ? 202 : 200)
    }

    await expect(
      api.startIntegrationOperation({
        idempotencyKey: 'claim-document-42',
        type: 'yadisk:uploadDocument',
        input: { fileRef: { id: 'file-42' } },
        resourceKey: 'disk:/claims/42/document.pdf',
        timeoutSeconds: 600,
      })
    ).resolves.toEqual(operation)
    await expect(api.getIntegrationOperation({ operationId: 'op/with spaces' })).resolves.toEqual(operation)
    await expect(api.cancelIntegrationOperation({ operationId: 'op/with spaces' })).resolves.toEqual(operation)

    expect(requests).toHaveLength(3)
    expect(requests[0]).toMatchObject({
      method: 'post',
      url: '/v1/chat/integration-operations',
      data: JSON.stringify({
        type: 'yadisk:uploadDocument',
        input: { fileRef: { id: 'file-42' } },
        resourceKey: 'disk:/claims/42/document.pdf',
        timeoutSeconds: 600,
      }),
    })
    expect(requests[0]!.headers.get('Idempotency-Key')).toBe('claim-document-42')
    expect(requests[0]!.headers.get('x-bot-id')).toBe('bot-42')
    expect(requests[0]!.headers.get('Authorization')).toBe('Bearer machine-token')

    expect(requests[1]).toMatchObject({
      method: 'get',
      url: '/v1/chat/integration-operations/op%2Fwith%20spaces',
      data: undefined,
    })
    expect(requests[2]).toMatchObject({
      method: 'post',
      url: '/v1/chat/integration-operations/op%2Fwith%20spaces/cancel',
      data: undefined,
    })
  })

  it('omits optional resource and timeout fields from the start body', async () => {
    let request: InternalAxiosRequestConfig | undefined
    const api = new Client({ apiUrl: 'https://botruntime.example', botId: 'bot-42' })
    ;(api as any)._customAxiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      request = config
      return success(config, 202)
    }

    await api.startIntegrationOperation({
      idempotencyKey: 'default-deadline',
      type: 'yadisk:uploadDocument',
      input: {},
    })

    expect(request?.data).toBe(JSON.stringify({
      type: 'yadisk:uploadDocument',
      input: {},
    }))
  })

  it('maps the 409 idempotency envelope through the public API error contract', async () => {
    const api = new Client({ apiUrl: 'https://botruntime.example', botId: 'bot-42' })
    ;(api as any)._customAxiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const response: AxiosResponse = {
        data: {
          id: 'conflict-id',
          code: 409,
          type: 'Conflict',
          message: 'idempotency key was already used for a different operation',
          metadata: {
            errorCode: 'IDEMPOTENCY_KEY_CONFLICT',
          },
        },
        status: 409,
        statusText: 'Conflict',
        headers: {},
        config,
      }
      throw new AxiosError(
        'Request failed with status code 409',
        AxiosError.ERR_BAD_REQUEST,
        config,
        undefined,
        response
      )
    }

    const conflict = await api.startIntegrationOperation({
      idempotencyKey: 'claim-document-42',
      type: 'yadisk:uploadDocument',
      input: { fileRef: { id: 'different-file' } },
    }).catch((error: unknown) => error)
    expect(conflict).toBeInstanceOf(IntegrationOperationConflictError)
    expect(conflict).toMatchObject({
      code: 409,
      type: 'Conflict',
      id: 'conflict-id',
      message: 'idempotency key was already used for a different operation',
      metadata: {
        errorCode: 'IDEMPOTENCY_KEY_CONFLICT',
      },
    })
    expect(isApiError(conflict)).toBe(true)
    expect((conflict as IntegrationOperationConflictError).toJSON()).toEqual({
      id: 'conflict-id',
      code: 409,
      type: 'Conflict',
      message: 'idempotency key was already used for a different operation',
      metadata: {
        errorCode: 'IDEMPOTENCY_KEY_CONFLICT',
      },
    })
  })
})
