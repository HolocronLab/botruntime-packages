import * as client from '@holocronlab/botruntime-client'

const CALL_ACTION_PATH = '/v1/chat/actions'

const isCallActionRequest = (err: client.axios.AxiosError): boolean => {
  if (err.config?.method?.toLowerCase() !== 'post' || !err.config.url) {
    return false
  }

  try {
    return new URL(err.config.url, 'https://botruntime.invalid').pathname === CALL_ACTION_PATH
  } catch {
    return false
  }
}

const isExplicitlyRetryableActionResponse = (err: client.axios.AxiosError): boolean => {
  if (!err.response || typeof err.response.data !== 'object' || err.response.data === null) {
    return false
  }

  const metadata = (err.response.data as { metadata?: unknown }).metadata
  if (typeof metadata !== 'object' || metadata === null) {
    return false
  }

  const execution = metadata as {
    errorKind?: unknown
    executionCode?: unknown
    executionState?: unknown
    retryable?: unknown
  }
  return (
    execution.errorKind === 'integration_execution'
    && typeof execution.executionCode === 'string'
    && execution.executionCode.length > 0
    && execution.executionState === 'not_started'
    && execution.retryable === true
  )
}

export const retryConfig: client.RetryConfig = {
  retries: 3,
  retryCondition: (err) => {
    // Action POSTs can have provider-side effects. A missing response is
    // ambiguous, as are legacy 502s, so only Cloud's fixed not_started
    // metadata is sufficient proof that replay cannot duplicate the action.
    if (isCallActionRequest(err)) {
      return isExplicitlyRetryableActionResponse(err)
    }

    return (
      client.axiosRetry.isNetworkOrIdempotentRequestError(err) ||
      [429, 502].includes(err.response?.status ?? 0)
    )
  },
  retryDelay: (retryCount, axiosError) => {
    const retryAfterSeconds = _getRetryAfterSeconds(axiosError.response?.headers ?? {})
    return (retryAfterSeconds ?? retryCount) * 1000
  },
}

const _getRetryAfterSeconds = (headers: client.axios.RawAxiosResponseHeaders) => {
  const headerNames = [
    // Standard rate limiting headers:
    'RateLimit-Reset',
    'X-RateLimit-Reset',
    'Retry-After',

    // Lowercase variants:
    'ratelimit-reset',
    'x-ratelimit-reset',
    'retry-after',
  ] as const

  for (const headerName of headerNames) {
    const headerValue: unknown = headers[headerName]

    if (headerValue === undefined) {
      continue
    }

    return _parseHeaderToSeconds(String(headerValue))
  }

  return
}

const _parseHeaderToSeconds = (headerValue: string): number | undefined => {
  // NOTE: retry-after can be either a number of seconds or a date string:
  const secondsDiff = _isDateString(headerValue)
    ? _parseDateToSeconds(headerValue)
    : headerValue.length > 0
      ? parseInt(headerValue, 10)
      : undefined

  return secondsDiff === undefined || isNaN(secondsDiff) ? undefined : secondsDiff
}

const _isDateString = (headerValue: string): boolean => headerValue.includes(' ')

const _parseDateToSeconds = (headerValue: string): number | undefined => {
  const futureDate = _parseDateString(headerValue)
  if (!futureDate) {
    return
  }

  const currentDate = new Date()
  return Math.max(0, Math.floor((futureDate.getTime() - currentDate.getTime()) / 1000))
}

const _parseDateString = (headerValue: string): Date | undefined => {
  const date = new Date(headerValue)
  return isNaN(date.getTime()) ? undefined : date
}
