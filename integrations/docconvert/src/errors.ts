import { RuntimeError } from '@holocronlab/botruntime-sdk'

export const DOC_CONVERT_ERROR_CODE = {
  fetchFailed: 'fetch_failed',
  sourceMismatch: 'source_mismatch',
  sourceTooLarge: 'source_too_large',
  unsupportedFormat: 'unsupported_format',
  conversionFailed: 'conversion_failed',
  timeout: 'timeout',
} as const

export type DocConvertErrorCode = typeof DOC_CONVERT_ERROR_CODE[keyof typeof DOC_CONVERT_ERROR_CODE]

export class DocConvertError extends Error {
  constructor(
    readonly code: DocConvertErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(oneLine(message), options)
    this.name = 'DocConvertError'
  }
}

export function normalizeDocConvertError(error: unknown): DocConvertError {
  if (error instanceof DocConvertError) return error
  return new DocConvertError(
    DOC_CONVERT_ERROR_CODE.conversionFailed,
    'Движок конвертации завершился с непредвиденной ошибкой',
    error instanceof Error ? { cause: error } : undefined,
  )
}

export function toRuntimeError(error: DocConvertError): RuntimeError {
  // Botruntime SDK reserves top-level `code` for HTTP 400. The domain code is
  // duplicated in metadata and in a stable message prefix: current Botforge
  // deliberately strips arbitrary metadata at its public action boundary.
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
