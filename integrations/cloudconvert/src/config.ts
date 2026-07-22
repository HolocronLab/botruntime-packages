import { CLOUD_CONVERT_ERROR_CODE, CloudConvertError } from './errors'

export type CloudConvertConfiguration = {
  apiKey: string
}

export type NormalizedCloudConvertConfiguration = {
  apiKey: string
}

export function normalizeConfiguration(
  value: Partial<CloudConvertConfiguration>,
): NormalizedCloudConvertConfiguration {
  const apiKey = typeof value.apiKey === 'string' ? value.apiKey.trim() : ''
  if (!apiKey) {
    throw new CloudConvertError(
      CLOUD_CONVERT_ERROR_CODE.conversionFailed,
      'Некорректная конфигурация CloudConvert: не задан apiKey',
    )
  }
  return { apiKey }
}
