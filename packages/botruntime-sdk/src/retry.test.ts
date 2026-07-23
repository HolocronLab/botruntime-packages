import * as client from '@holocronlab/botruntime-client'
import { describe, it, expect, vi } from 'vitest'
import { retryConfig } from './retry'

const retryDelay = retryConfig.retryDelay!

const clientWithAdapter = (adapter: (config: any) => Promise<any>) => {
  const api = new client.Client({
    apiUrl: 'https://cloud.example',
    retry: {
      ...retryConfig,
      retryDelay: () => 0,
    },
  })
  ;(api as any).axiosInstance.defaults.adapter = adapter
  return api
}

const responseError = (config: any, status: number, data: unknown) => {
  const response = {
    data,
    status,
    statusText: 'Failure',
    headers: {},
    config,
  }
  return new client.axios.AxiosError(
    `Request failed with status code ${status}`,
    client.axios.AxiosError.ERR_BAD_RESPONSE,
    config,
    undefined,
    response
  )
}

const integrationExecutionEnvelope = (executionState: string, retryable: boolean) => ({
  id: 'err_integration_execution',
  code: executionState === 'outcome_unknown' ? 504 : 503,
  type: executionState === 'outcome_unknown' ? 'OperationTimeout' : 'Internal',
  message: 'integration execution failed',
  metadata: {
    errorKind: 'integration_execution',
    executionCode: executionState === 'outcome_unknown' ? 'process_crash' : 'reload',
    executionState,
    retryable,
  },
})

describe.concurrent('retryConfig', () => {
  it.each([
    {
      headers: {
        'RateLimit-Reset': '300',
      },
      expectedDelay: 300_000,
    },
    {
      headers: {
        'ratelimit-reset': '300',
      },
      expectedDelay: 300_000,
    },
    {
      headers: {
        'X-RateLimit-Reset': '300',
      },
      expectedDelay: 300_000,
    },
    {
      headers: {
        'x-ratelimit-reset': '300',
      },
      expectedDelay: 300_000,
    },
    {
      headers: {
        'Retry-After': '300',
      },
      expectedDelay: 300_000,
    },
    {
      headers: {
        'retry-after': '300',
      },
      expectedDelay: 300_000,
    },
  ])('should evaluate $headers to $expectedDelay ms', ({ headers, expectedDelay }) => {
    // Arrange
    const axiosError = { response: { headers } } as any

    // Act
    const result = retryDelay(1, axiosError)

    // Assert
    expect(result).toEqual(expectedDelay)
  })

  it('should evaluate a date string to the correct delay', () => {
    // Arrange
    const delay_seconds = 300
    const delay_ms = delay_seconds * 1000
    const futureDate = new Date(Date.now() + delay_ms)
    const axiosError = { response: { headers: { 'Retry-After': futureDate.toString() } } } as any

    // Act
    const result = retryDelay(1, axiosError)

    // Assert
    const jitter = 1000 // 1 second of jitter
    expect(result).toBeGreaterThanOrEqual(delay_ms - jitter)
    expect(result).toBeLessThanOrEqual(delay_ms + jitter)
  })

  it.each([
    { retryCount: 1, expectedDelay: 1000 },
    { retryCount: 2, expectedDelay: 2000 },
    { retryCount: 3, expectedDelay: 3000 },
  ])('should evaluate no headers with $retryCount retries to $expectedDelay ms', ({ retryCount, expectedDelay }) => {
    // Arrange
    const axiosError = { response: { headers: {} } } as any

    // Act
    const result = retryDelay(retryCount, axiosError)

    // Assert
    expect(result).toEqual(expectedDelay)
  })
})

describe('state CAS retry safety', () => {
  it('does not retry a ResourceLockedConflict write', () => {
    const error = responseError(
      {
        method: 'post',
        url: '/v1/chat/states/workflow/workflow_1/workflowState',
      },
      409,
      {
        id: 'err_state_conflict',
        code: 409,
        type: 'ResourceLockedConflict',
        message: 'state version conflict',
      }
    )

    expect(retryConfig.retryCondition!(error)).toBe(false)
  })
})

describe('action retry safety', () => {
  it.each([
    {
      name: 'network failure without an HTTP response',
      error: (config: any) =>
        new client.axios.AxiosError(
          'socket hang up',
          client.axios.AxiosError.ERR_NETWORK,
          config
        ),
    },
    {
      name: 'client timeout without an HTTP response',
      error: (config: any) =>
        new client.axios.AxiosError(
          'timeout exceeded',
          client.axios.AxiosError.ECONNABORTED,
          config
        ),
    },
    {
      name: 'legacy 502 with no execution metadata',
      error: (config: any) =>
        responseError(config, 502, {
          id: 'err_gateway',
          code: 502,
          type: 'Internal',
          message: 'integration action failed',
        }),
    },
    {
      name: '502 outcome_unknown response',
      error: (config: any) =>
        responseError(config, 502, integrationExecutionEnvelope('outcome_unknown', false)),
    },
    {
      name: '504 outcome_unknown response',
      error: (config: any) =>
        responseError(config, 504, integrationExecutionEnvelope('outcome_unknown', false)),
    },
    {
      name: 'outcome_unknown response even if malformed metadata claims retryable',
      error: (config: any) =>
        responseError(config, 504, integrationExecutionEnvelope('outcome_unknown', true)),
    },
    {
      name: 'explicit retryable=false response',
      error: (config: any) =>
        responseError(config, 503, integrationExecutionEnvelope('not_started', false)),
    },
    {
      name: 'not_started metadata without integration error kind',
      error: (config: any) =>
        responseError(config, 503, {
          ...integrationExecutionEnvelope('not_started', true),
          metadata: {
            errorKind: 'other',
            executionCode: 'queue_timeout',
            executionState: 'not_started',
            retryable: true,
          },
        }),
    },
    {
      name: 'not_started metadata without an execution code',
      error: (config: any) =>
        responseError(config, 503, {
          ...integrationExecutionEnvelope('not_started', true),
          metadata: {
            errorKind: 'integration_execution',
            executionState: 'not_started',
            retryable: true,
          },
        }),
    },
    {
      name: 'not_started metadata with an empty execution code',
      error: (config: any) =>
        responseError(config, 503, {
          ...integrationExecutionEnvelope('not_started', true),
          metadata: {
            errorKind: 'integration_execution',
            executionCode: '',
            executionState: 'not_started',
            retryable: true,
          },
        }),
    },
  ])('makes exactly one action attempt for $name', async ({ error }) => {
    const attempts = vi.fn()
    const api = clientWithAdapter(async (config) => {
      attempts()
      throw error(config)
    })

    await expect(api.callAction({ type: 'megaplan:createDeal', input: {} })).rejects.toBeDefined()
    expect(attempts).toHaveBeenCalledOnce()
  })

  it('retries exactly once after an explicit not_started retryable response', async () => {
    const attempts = vi.fn()
    const api = clientWithAdapter(async (config) => {
      attempts()
      if (attempts.mock.calls.length === 1) {
        throw responseError(config, 503, integrationExecutionEnvelope('not_started', true))
      }
      return {
        data: { output: { id: 'deal-1' }, meta: { cached: false } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    })

    await expect(api.callAction({ type: 'megaplan:createDeal', input: {} })).resolves.toEqual({
      output: { id: 'deal-1' },
      meta: { cached: false },
    })
    expect(attempts).toHaveBeenCalledTimes(2)
  })

  it('preserves network retry behavior for an idempotent read', async () => {
    const attempts = vi.fn()
    const api = clientWithAdapter(async (config) => {
      attempts()
      if (attempts.mock.calls.length === 1) {
        throw new client.axios.AxiosError(
          'socket hang up',
          client.axios.AxiosError.ERR_NETWORK,
          config
        )
      }
      return {
        data: { conversation: { id: 'conversation-1' } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      }
    })

    await expect(api.getConversation({ id: 'conversation-1' })).resolves.toEqual({
      conversation: { id: 'conversation-1' },
    })
    expect(attempts).toHaveBeenCalledTimes(2)
  })
})
