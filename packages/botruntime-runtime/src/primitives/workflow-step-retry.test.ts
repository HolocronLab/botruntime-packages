import { describe, expect, it } from 'vitest'
import { axios, toApiError } from '@holocronlab/botruntime-client'
import { shouldRetryWorkflowStepError } from './workflow-step'

const integrationExecutionError = (executionState: string, retryable: boolean) => ({
  metadata: {
    errorKind: 'integration_execution',
    executionCode: 'queue_timeout',
    executionState,
    retryable,
  },
})

describe('workflow step integration execution retry policy', () => {
  it.each([
    ['outcome_unknown', false],
    ['outcome_unknown', true],
    ['not_started', false],
  ])('does not retry executionState=%s retryable=%s', (executionState, retryable) => {
    expect(shouldRetryWorkflowStepError(integrationExecutionError(executionState, retryable))).toBe(false)
  })

  it('preserves retries for explicitly retryable actions that were not started', () => {
    expect(shouldRetryWorkflowStepError(integrationExecutionError('not_started', true))).toBe(true)
  })

  it.each([
    new Error('temporary database failure'),
    { metadata: { errorKind: 'other', executionState: 'outcome_unknown', retryable: false } },
  ])('preserves the existing retry behavior for other transient failures', (error) => {
    expect(shouldRetryWorkflowStepError(error)).toBe(true)
  })

  it.each([
    { metadata: { errorKind: 'integration_execution' } },
    {
      metadata: {
        errorKind: 'integration_execution',
        executionCode: 'queue_timeout',
        executionState: 'future_state',
        retryable: true,
      },
    },
    {
      metadata: {
        errorKind: 'integration_execution',
        executionCode: 'queue_timeout',
        executionState: 'not_started',
        retryable: 'true',
      },
    },
    {
      metadata: {
        errorKind: 'integration_execution',
        executionCode: '',
        executionState: 'not_started',
        retryable: true,
      },
    },
  ])('does not retry malformed or unknown integration execution metadata', (error) => {
    expect(shouldRetryWorkflowStepError(error)).toBe(false)
  })

  it.each([
    {
      name: 'response-less transport failure',
      create: (config: any) =>
        new axios.AxiosError(
          'socket hang up',
          axios.AxiosError.ERR_NETWORK,
          config,
        ),
    },
    {
      name: 'legacy untyped HTTP failure',
      create: (config: any) =>
        new axios.AxiosError(
          'Request failed with status code 502',
          axios.AxiosError.ERR_BAD_RESPONSE,
          config,
          undefined,
          {
            data: {
              id: 'err_legacy',
              code: 502,
              type: 'Internal',
              message: 'integration action failed',
            },
            status: 502,
            statusText: 'Bad Gateway',
            headers: {},
            config,
          },
        ),
    },
  ])('maps a raw action $name to terminal outcome_unknown metadata', ({ create }) => {
    const config = {
      method: 'post',
      url: '/v1/chat/actions',
      headers: new axios.AxiosHeaders(),
    }
    const mapped = toApiError(create(config))

    expect((mapped as any).metadata).toEqual({
      errorKind: 'integration_execution',
      executionCode: 'transport_outcome_unknown',
      executionState: 'outcome_unknown',
      retryable: false,
    })
    expect(shouldRetryWorkflowStepError(mapped)).toBe(false)
  })

  it('preserves complete typed not_started metadata through client mapping', () => {
    const config = {
      method: 'post',
      url: '/v1/chat/actions',
      headers: new axios.AxiosHeaders(),
    }
    const metadata = {
      errorKind: 'integration_execution',
      executionCode: 'queue_timeout',
      executionState: 'not_started',
      retryable: true,
    }
    const raw = new axios.AxiosError(
      'Request failed with status code 503',
      axios.AxiosError.ERR_BAD_RESPONSE,
      config,
      undefined,
      {
        data: {
          id: 'err_not_started',
          code: 503,
          type: 'Internal',
          message: 'integration action was not started',
          metadata,
        },
        status: 503,
        statusText: 'Service Unavailable',
        headers: {},
        config,
      },
    )
    const mapped = toApiError(raw)

    expect((mapped as any).metadata).toEqual(metadata)
    expect(shouldRetryWorkflowStepError(mapped)).toBe(true)
  })
})
