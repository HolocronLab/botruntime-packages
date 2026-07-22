import { RuntimeError } from '@holocronlab/botruntime-sdk'

export const CLOUD_CONVERT_ERROR_CODE = {
  fetchFailed: 'fetch_failed',
  sourceMismatch: 'source_mismatch',
  sourceTooLarge: 'source_too_large',
  unsupportedFormat: 'unsupported_format',
  conversionFailed: 'conversion_failed',
  timeout: 'timeout',
} as const

export type CloudConvertErrorCode =
  typeof CLOUD_CONVERT_ERROR_CODE[keyof typeof CLOUD_CONVERT_ERROR_CODE]

export class CloudConvertError extends Error {
  constructor(
    readonly code: CloudConvertErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(oneLine(message), options)
    this.name = 'CloudConvertError'
  }
}

export function normalizeCloudConvertError(error: unknown): CloudConvertError {
  if (error instanceof CloudConvertError) return error
  return new CloudConvertError(
    CLOUD_CONVERT_ERROR_CODE.conversionFailed,
    'CloudConvert завершил конвертацию с непредвиденной ошибкой',
    error instanceof Error ? { cause: error } : undefined,
  )
}

export function toRuntimeError(error: CloudConvertError): RuntimeError {
  return new RuntimeError(
    `[${error.code}] ${error.message}`,
    error,
    undefined,
    { code: error.code },
  )
}

export function oneLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim()
}
