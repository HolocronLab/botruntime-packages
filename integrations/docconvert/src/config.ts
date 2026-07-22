import { DOC_CONVERT_ERROR_CODE, DocConvertError } from './errors'

export type DocConvertConfiguration = {
  serviceUrl: string
  authToken?: string
}

export type NormalizedDocConvertConfiguration = {
  serviceUrl: string
  authToken?: string
}

export function normalizeConfiguration(value: Partial<DocConvertConfiguration>): NormalizedDocConvertConfiguration {
  if (typeof value.serviceUrl !== 'string' || !value.serviceUrl.trim()) {
    throw configurationError('не задан serviceUrl')
  }
  let parsed: URL
  try {
    parsed = new URL(value.serviceUrl.trim())
  } catch {
    throw configurationError('serviceUrl не является URL')
  }
  if (parsed.protocol !== 'https:') throw configurationError('serviceUrl должен использовать HTTPS')
  if (parsed.username || parsed.password) throw configurationError('serviceUrl не должен содержать учётные данные')
  if (parsed.search || parsed.hash) throw configurationError('serviceUrl не должен содержать query или fragment')

  const authToken = typeof value.authToken === 'string' && value.authToken.trim()
    ? value.authToken.trim()
    : undefined
  return {
    serviceUrl: parsed.toString().replace(/\/+$/, ''),
    authToken,
  }
}

function configurationError(message: string): DocConvertError {
  return new DocConvertError(
    DOC_CONVERT_ERROR_CODE.conversionFailed,
    `Некорректная конфигурация docconvert: ${message}`,
  )
}
