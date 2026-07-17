import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'
import { createAxiosInstance } from './axios'
import { toApiError } from './errors'

describe('Axios error fidelity', () => {
  it('preserves the primary API envelope when the engine requires an Error stack target', async () => {
    const originalCaptureStackTrace = Error.captureStackTrace
    Error.captureStackTrace = ((target: object, constructor?: Function) => {
      if (!(target instanceof Error)) throw new TypeError('First argument must be an Error object')
      originalCaptureStackTrace?.(target, constructor)
    }) as typeof Error.captureStackTrace

    try {
      const instance = createAxiosInstance({
        apiUrl: 'https://cloud.example',
        headers: {},
        withCredentials: false,
        timeout: 1_000,
        debug: false,
      })
      const envelope = {
        id: 'err_primary',
        code: 404,
        type: 'ResourceNotFound',
        message: 'bot not found in workspace',
      }

      let thrown: unknown
      try {
        await instance.request({
          method: 'POST',
          url: '/v1/chat/events',
          adapter: async (config: InternalAxiosRequestConfig) => {
            const response: AxiosResponse = {
              data: envelope,
              status: 404,
              statusText: 'Not Found',
              headers: {},
              config,
            }
            throw new AxiosError(
              'Request failed with status code 404',
              AxiosError.ERR_BAD_REQUEST,
              config,
              undefined,
              response,
            )
          },
        })
      }
      catch (error) {
        thrown = error
      }

      expect(axios.isAxiosError(thrown)).toBe(true)
      expect(thrown).not.toBeInstanceOf(Error)
      const apiError = toApiError(thrown)
      expect(apiError.message).toBe('bot not found in workspace')
      expect(apiError.message).not.toContain('First argument must be an Error object')
    }
    finally {
      Error.captureStackTrace = originalCaptureStackTrace
    }
  })
})
