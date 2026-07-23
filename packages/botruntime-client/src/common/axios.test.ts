import axios, { AxiosError, type AxiosResponse, type InternalAxiosRequestConfig } from 'axios'
import { describe, expect, it } from 'vitest'
import { ACTION_TIMEOUT_HEADER, createAxiosInstance } from './axios'
import {
  DEFAULT_API_REQUEST_TIMEOUT_MS,
  DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
} from './config'
import { toApiError } from './errors'
import { Client } from '../public'

const success = (config: InternalAxiosRequestConfig): AxiosResponse => ({
  data: {},
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
})

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
        actionTransportTimeoutMs: 1_000,
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

describe('action timeout capability header', () => {
  it('keeps a normal API call at 125 seconds and gives callAction the 190-second default', async () => {
    const observed: Array<{ url: string; timeout: number; header?: string }> = []
    const api = new Client({ apiUrl: 'https://cloud.example' })
    ;(api as any).axiosInstance.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      observed.push({
        url: config.url ?? '',
        timeout: config.timeout!,
        header: config.headers.get(ACTION_TIMEOUT_HEADER)?.toString(),
      })
      return {
        ...success(config),
        data: config.url === '/v1/chat/actions'
          ? { output: {}, meta: { cached: false } }
          : { conversation: { id: 'conversation-1' } },
      }
    }

    await api.getConversation({ id: 'conversation-1' })
    await api.callAction({ type: 'megaplan:getTask', input: {} })

    expect(observed).toEqual([
      {
        url: '/v1/chat/conversations/conversation-1',
        timeout: DEFAULT_API_REQUEST_TIMEOUT_MS,
        header: undefined,
      },
      {
        url: '/v1/chat/actions',
        timeout: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
        header: String(DEFAULT_ACTION_REQUEST_TIMEOUT_MS),
      },
    ])
  })

  it.each([
    {
      name: 'default transport timeout',
      clientTimeout: DEFAULT_API_REQUEST_TIMEOUT_MS,
      actionTransportTimeout: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      requestTimeout: undefined,
      expected: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      expectedTransport: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
    },
    {
      name: 'shorter configured transport timeout',
      clientTimeout: 30_000,
      actionTransportTimeout: 30_000,
      requestTimeout: undefined,
      expected: 30_000,
      expectedTransport: 30_000,
    },
    {
      name: 'shorter effective per-request timeout',
      clientTimeout: DEFAULT_API_REQUEST_TIMEOUT_MS,
      actionTransportTimeout: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      requestTimeout: 20_000,
      expected: 20_000,
      expectedTransport: 20_000,
    },
    {
      name: 'unbounded Axios transport timeout',
      clientTimeout: 0,
      actionTransportTimeout: 0,
      requestTimeout: undefined,
      expected: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      expectedTransport: 0,
    },
    {
      name: 'transport timeout above the platform ceiling',
      clientTimeout: 500_000,
      actionTransportTimeout: 500_000,
      requestTimeout: undefined,
      expected: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      expectedTransport: 500_000,
    },
  ])('advertises the bounded effective budget for $name', async ({
    clientTimeout,
    actionTransportTimeout,
    requestTimeout,
    expected,
    expectedTransport,
  }) => {
    let observed: string | undefined
    let observedTimeout: number | undefined
    const instance = createAxiosInstance({
      apiUrl: 'https://cloud.example',
      headers: {},
      withCredentials: false,
      timeout: clientTimeout,
      actionTransportTimeoutMs: actionTransportTimeout,
      debug: false,
    })

    await instance.request({
      method: 'POST',
      url: '/v1/chat/actions',
      ...(requestTimeout !== undefined ? { timeout: requestTimeout } : {}),
      adapter: async (config: InternalAxiosRequestConfig) => {
        observed = config.headers.get(ACTION_TIMEOUT_HEADER)?.toString()
        observedTimeout = config.timeout
        return success(config)
      },
    })

    expect(observed).toBe(String(expected))
    expect(observedTimeout).toBe(expectedTransport)
  })

  it('keeps older hand-built ClientConfig values compatible', async () => {
    let observed: { header?: string; timeout?: number } = {}
    const instance = createAxiosInstance({
      apiUrl: 'https://cloud.example',
      headers: {},
      withCredentials: false,
      timeout: 42_000,
      debug: false,
    })

    await instance.post('/v1/chat/actions', {}, {
      adapter: async (config: InternalAxiosRequestConfig) => {
        observed = {
          header: config.headers.get(ACTION_TIMEOUT_HEADER)?.toString(),
          timeout: config.timeout,
        }
        return success(config)
      },
    })

    expect(observed).toEqual({ header: '42000', timeout: 42_000 })
  })

  it('evaluates and clamps the invocation budget when each action is dispatched', async () => {
    let remaining = 180_000
    const observed: string[] = []
    const instance = createAxiosInstance({
      apiUrl: 'https://cloud.example',
      headers: {},
      withCredentials: false,
      timeout: DEFAULT_API_REQUEST_TIMEOUT_MS,
      actionTransportTimeoutMs: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      actionTimeoutMs: () => remaining,
      debug: false,
    })
    const adapter = async (config: InternalAxiosRequestConfig) => {
      observed.push(config.headers.get(ACTION_TIMEOUT_HEADER)?.toString() ?? '')
      return success(config)
    }

    await instance.post('/v1/chat/actions', {}, { adapter })
    remaining = 120_000
    await instance.post('/v1/chat/actions', {}, { adapter })

    expect(observed).toEqual(['180000', '120000'])
  })

  it('refreshes the rolling budget on retry without restoring the full transport timeout', async () => {
    let attempt = 0
    const remaining = [180_000, 100_000]
    const observed: Array<{ header?: string; timeout?: number }> = []
    const instance = createAxiosInstance(
      {
        apiUrl: 'https://cloud.example',
        headers: {},
        withCredentials: false,
        timeout: DEFAULT_API_REQUEST_TIMEOUT_MS,
        actionTransportTimeoutMs: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
        actionTimeoutMs: () => remaining[attempt]!,
        debug: false,
      },
      {
        retries: 1,
        retryCondition: () => true,
        retryDelay: () => 0,
      },
    )

    await instance.post('/v1/chat/actions', {}, {
      adapter: async (config: InternalAxiosRequestConfig) => {
        observed.push({
          header: config.headers.get(ACTION_TIMEOUT_HEADER)?.toString(),
          timeout: config.timeout,
        })
        attempt++
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 10))
          throw new AxiosError(
            'not started',
            AxiosError.ERR_BAD_RESPONSE,
            config,
            undefined,
            {
              ...success(config),
              status: 503,
              statusText: 'Service Unavailable',
            },
          )
        }
        return success(config)
      },
    })

    expect(observed.map(({ header }) => header)).toEqual(['180000', '100000'])
    expect(observed[0]!.timeout).toBe(DEFAULT_ACTION_REQUEST_TIMEOUT_MS)
    expect(observed[1]!.timeout).toBeLessThan(DEFAULT_ACTION_REQUEST_TIMEOUT_MS)
  })

  it('never advertises more than the effective transport timeout', async () => {
    let observed: string | undefined
    const instance = createAxiosInstance({
      apiUrl: 'https://cloud.example',
      headers: {},
      withCredentials: false,
      timeout: 40_000,
      actionTransportTimeoutMs: 40_000,
      actionTimeoutMs: () => 200_000,
      debug: false,
    })

    await instance.post('/v1/chat/actions', {}, {
      adapter: async (config: InternalAxiosRequestConfig) => {
        observed = config.headers.get(ACTION_TIMEOUT_HEADER)?.toString()
        return success(config)
      },
    })

    expect(observed).toBe('40000')
  })

  it('overrides a caller-supplied value with the derived platform budget', async () => {
    let observed: string | undefined
    const instance = createAxiosInstance({
      apiUrl: 'https://cloud.example',
      headers: { [ACTION_TIMEOUT_HEADER]: '999999' },
      withCredentials: false,
      timeout: 45_000,
      actionTransportTimeoutMs: 45_000,
      debug: false,
    })

    await instance.post('/v1/chat/actions', {}, {
      adapter: async (config: InternalAxiosRequestConfig) => {
        observed = config.headers.get(ACTION_TIMEOUT_HEADER)?.toString()
        return success(config)
      },
    })

    expect(observed).toBe('45000')
  })

  it.each([
    { method: 'GET', url: '/v1/chat/actions' },
    { method: 'POST', url: '/v1/chat/messages' },
  ])('strips the platform-owned header from $method $url', async ({ method, url }) => {
    let observed: string | undefined
    let observedTimeout: number | undefined
    const instance = createAxiosInstance({
      apiUrl: 'https://cloud.example',
      headers: { [ACTION_TIMEOUT_HEADER]: '999999' },
      withCredentials: false,
      timeout: DEFAULT_API_REQUEST_TIMEOUT_MS,
      actionTransportTimeoutMs: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      debug: false,
    })

    await instance.request({
      method,
      url,
      adapter: async (config: InternalAxiosRequestConfig) => {
        observed = config.headers.get(ACTION_TIMEOUT_HEADER)?.toString()
        observedTimeout = config.timeout
        return success(config)
      },
    })

    expect(observed).toBeUndefined()
    expect(observedTimeout).toBe(DEFAULT_API_REQUEST_TIMEOUT_MS)
  })

  it.each([
    { name: 'exhausted invocation', actionTimeoutMs: () => 0 },
    {
      name: 'throwing invocation budget callback',
      actionTimeoutMs: () => {
        throw new Error('context unavailable')
      },
    },
    { name: 'non-finite invocation budget callback', actionTimeoutMs: () => Number.NaN },
    { name: 'invalid standalone numeric budget', actionTimeoutMs: Number.NaN },
  ])('advertises zero for $name', async ({ actionTimeoutMs }) => {
    let observed: string | undefined
    const instance = createAxiosInstance({
      apiUrl: 'https://cloud.example',
      headers: {},
      withCredentials: false,
      timeout: DEFAULT_API_REQUEST_TIMEOUT_MS,
      actionTransportTimeoutMs: DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
      actionTimeoutMs,
      debug: false,
    })

    await instance.post('/v1/chat/actions', {}, {
      adapter: async (config: InternalAxiosRequestConfig) => {
        observed = config.headers.get(ACTION_TIMEOUT_HEADER)?.toString()
        return success(config)
      },
    })

    expect(observed).toBe('0')
  })
})
