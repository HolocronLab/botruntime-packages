import * as axios from 'axios'
import axiosRetry from 'axios-retry'
import * as consts from './consts'
import * as interceptors from './debug-interceptors'
import * as types from './types'

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

export const createAxiosInstance = (
  config: types.ClientConfig,
  retry?: types.RetryConfig,
): axios.AxiosInstance => {
  const axiosConfig = createAxios(config)
  const axiosInstance = axios.default.create(axiosConfig)

  if (config.debug) {
    interceptors.addDebugInterceptors(axiosInstance)
  }
  if (retry) {
    axiosRetry(axiosInstance, retry)
  }
  preserveAxiosError(axiosInstance)

  return axiosInstance
}

const preserveAxiosError = (instance: axios.AxiosInstance): void => {
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
