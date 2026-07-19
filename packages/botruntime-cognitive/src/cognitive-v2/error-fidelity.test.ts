import {
  AxiosError,
  type AxiosInstance,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'
import { describe, expect, test, vi } from 'vitest'
import { CognitiveBeta } from './index'

const INPUT = {
  model: 'auto',
  messages: [{ role: 'user' as const, content: 'hello' }],
}

describe('Cognitive v2 HTTP error fidelity', () => {
  test.each([
    {
      status: 502,
      statusText: 'Bad Gateway',
      envelope: {
        id: 'err_gateway',
        code: 502,
        type: 'Internal',
        message: 'cognitive generate failed',
      },
    },
    {
      status: 504,
      statusText: 'Gateway Timeout',
      envelope: {
        id: 'err_timeout',
        code: 504,
        type: 'OperationTimeout',
        message: 'cognitive provider timed out',
        metadata: { errorKind: 'timeout', phase: 'provider_response_body' },
      },
    },
  ])('preserves HTTP $status under Bun-compatible stack validation without retrying generation', async ({
    status,
    statusText,
    envelope,
  }) => {
    const originalCaptureStackTrace = Error.captureStackTrace
    Error.captureStackTrace = ((target: object, constructor?: Function) => {
      if (!(target instanceof Error)) throw new TypeError('First argument must be an Error object')
      originalCaptureStackTrace?.(target, constructor)
    }) as typeof Error.captureStackTrace

    try {
      const beta = new CognitiveBeta({ apiUrl: 'https://cloud.example', timeout: 1_000 })
      const axiosClient = (beta as any)._axiosClient as AxiosInstance
      const attempts = vi.fn()
      const retries = vi.fn()
      beta.on('retry', retries)

      axiosClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        attempts()
        const response: AxiosResponse = {
          data: envelope,
          status,
          statusText,
          headers: {},
          config,
        }
        throw new AxiosError(
          `Request failed with status code ${status}`,
          AxiosError.ERR_BAD_RESPONSE,
          config,
          undefined,
          response,
        )
      }

      let thrown: any
      try {
        await beta.generateText(INPUT)
      }
      catch (error) {
        thrown = error
      }

      expect(thrown?.message).toBe(envelope.message)
      expect(thrown?.message).not.toContain('First argument must be an Error object')
      expect(thrown?.code).toBe(envelope.code)
      expect(thrown?.type).toBe(envelope.type)
      expect(thrown?.metadata).toEqual(envelope.metadata)
      expect(attempts).toHaveBeenCalledOnce()
      expect(retries).not.toHaveBeenCalled()
    }
    finally {
      Error.captureStackTrace = originalCaptureStackTrace
    }
  })

  test('keeps the normalized 502 visible to the retry classifier for an idempotent catalog read', async () => {
    const originalCaptureStackTrace = Error.captureStackTrace
    Error.captureStackTrace = ((target: object, constructor?: Function) => {
      if (!(target instanceof Error)) throw new TypeError('First argument must be an Error object')
      originalCaptureStackTrace?.(target, constructor)
    }) as typeof Error.captureStackTrace

    try {
      const beta = new CognitiveBeta({ apiUrl: 'https://cloud.example', timeout: 2_000 })
      const axiosClient = (beta as any)._axiosClient as AxiosInstance
      let attempts = 0
      axiosClient.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
        attempts++
        if (attempts < 3) {
          const response: AxiosResponse = {
            data: { id: 'err_gateway', code: 502, type: 'Internal', message: 'temporary gateway failure' },
            status: 502,
            statusText: 'Bad Gateway',
            headers: {},
            config,
          }
          throw new AxiosError(
            'Request failed with status code 502',
            AxiosError.ERR_BAD_RESPONSE,
            config,
            undefined,
            response,
          )
        }
        return {
          data: { models: [] },
          status: 200,
          statusText: 'OK',
          headers: {},
          config,
        }
      }

      await expect(beta.listModels()).resolves.toEqual([])
      expect(attempts).toBe(3)
    }
    finally {
      Error.captureStackTrace = originalCaptureStackTrace
    }
  })
})
