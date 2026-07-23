import * as axios from 'axios'
import axiosRetry from 'axios-retry'
import * as consts from './consts'
import { DEFAULT_ACTION_REQUEST_TIMEOUT_MS } from './config'
import * as interceptors from './debug-interceptors'
import * as types from './types'

export const ACTION_TIMEOUT_HEADER = 'x-bp-action-timeout-ms'
const CALL_ACTION_PATH = '/v1/chat/actions'
const ACTION_TIMEOUT_APPLIED = 'botruntime-action-timeout-applied'

type ActionRequestConfig = axios.InternalAxiosRequestConfig & {
  [ACTION_TIMEOUT_APPLIED]?: true
}

const createAxios = (config: types.ClientConfig): axios.AxiosRequestConfig => ({
  baseURL: config.apiUrl,
  headers: config.headers,
  withCredentials: config.withCredentials,
  timeout: config.timeout,
  maxBodyLength: consts.maxBodyLength,
  maxContentLength: consts.maxContentLength,
  httpAgent: consts.httpAgent,
  httpsAgent: consts.httpsAgent,
})

const isCallActionRequest = (request: axios.InternalAxiosRequestConfig): boolean => {
  if (request.method?.toLowerCase() !== 'post' || !request.url) {
    return false
  }

  try {
    return new URL(request.url, 'https://botruntime.invalid').pathname === CALL_ACTION_PATH
  } catch {
    return false
  }
}

const boundedTransportTimeout = (timeout: unknown): number => {
  // Axios uses zero to mean no transport timeout. Such a client can safely
  // advertise the platform ceiling, but invalid or sub-millisecond values
  // cannot support an honest positive millisecond budget and fail closed.
  if (timeout === 0) {
    return DEFAULT_ACTION_REQUEST_TIMEOUT_MS
  }
  if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout < 1) {
    return 0
  }
  return Math.min(Math.floor(timeout), DEFAULT_ACTION_REQUEST_TIMEOUT_MS)
}

const boundedActionTimeout = (value: number | (() => number) | undefined): number => {
  if (value === undefined) {
    return DEFAULT_ACTION_REQUEST_TIMEOUT_MS
  }

  let resolved: number
  try {
    resolved = typeof value === 'function' ? value() : value
  } catch {
    return 0
  }
  if (!Number.isFinite(resolved) || resolved < 1) {
    return 0
  }
  return Math.min(Math.floor(resolved), DEFAULT_ACTION_REQUEST_TIMEOUT_MS)
}

const installActionTimeoutHeader = (
  instance: axios.AxiosInstance,
  config: types.ClientConfig,
): void => {
  instance.interceptors.request.use((request) => {
    const actionRequest = request as ActionRequestConfig
    const headers = axios.AxiosHeaders.from(request.headers)
    // This is a platform-owned capability signal. Ignore a caller-supplied
    // value and never leak it onto non-action endpoints.
    headers.delete(ACTION_TIMEOUT_HEADER)
    request.headers = headers

    if (!isCallActionRequest(request)) {
      return request
    }

    if (!actionRequest[ACTION_TIMEOUT_APPLIED]) {
      // Generated calls inherit the ordinary instance timeout. Replace that
      // inherited value with the action-specific transport budget, while
      // preserving a lower-level caller's explicit per-request override.
      if (request.timeout === config.timeout) {
        request.timeout = config.actionTransportTimeoutMs ?? config.timeout
      }
      actionRequest[ACTION_TIMEOUT_APPLIED] = true
    }

    const transportTimeout = boundedTransportTimeout(request.timeout)
    const actionTimeout = boundedActionTimeout(config.actionTimeoutMs)
    // Relative milliseconds are deliberate: unlike an absolute timestamp,
    // this remains correct across client/server clock skew. It is a bounded
    // upper limit, not permission to truncate a handler after it has started.
    headers.set(ACTION_TIMEOUT_HEADER, String(Math.min(transportTimeout, actionTimeout)))
    return request
  })
}

export const createAxiosInstance = (
  config: types.ClientConfig,
  retry?: types.RetryConfig,
): axios.AxiosInstance => {
  const axiosConfig = createAxios(config)
  const axiosInstance = axios.default.create(axiosConfig)

  if (config.debug) {
    interceptors.addDebugInterceptors(axiosInstance)
  }
  installActionTimeoutHeader(axiosInstance, config)
  if (retry) {
    axiosRetry(axiosInstance, retry)
  }
  installAxiosErrorFidelity(axiosInstance)

  return axiosInstance
}

export const installAxiosErrorFidelity = (instance: axios.AxiosInstance): void => {
  instance.interceptors.response.use(undefined, (error: unknown) => {
    if (!axios.isAxiosError(error) || !(error instanceof Error)) return Promise.reject(error)

    // Axios 1.7.8+ calls Error.captureStackTrace with a plain object after the
    // interceptor chain, but only when the rejection is still an Error. Bun rejects
    // that target and masks the API response, so this interceptor must stay after
    // retry and deliberately reject an Axios-compatible non-Error snapshot.
    return Promise.reject({
      isAxiosError: true,
      name: error.name,
      message: error.message,
      code: error.code,
      config: error.config,
      request: error.request,
      response: error.response,
      status: error.status,
      stack: error.stack,
      // Preserve the real transport Error for UnknownError/debugging paths.
      cause: error,
    } satisfies Partial<axios.AxiosError> & { isAxiosError: true; cause: Error })
  })
}
