import { AxiosError } from 'axios'
import {
  errorFrom as generatedErrorFrom,
  isApiError as isGeneratedApiError,
  type ApiError as GeneratedApiError,
} from './gen/public/errors'
import { UpsertFileResponse } from './gen/public/operations/upsertFile'

export * from './gen/public/errors'

export class IntegrationOperationConflictError extends Error {
  public readonly isApiError = true as const
  public readonly code = 409 as const
  public readonly type = 'Conflict' as const
  public readonly description = 'The integration operation conflicts with an existing operation.' as const

  public constructor(
    message: string,
    public readonly id: string,
    public readonly metadata?: Record<string, unknown>,
    public readonly error?: Error
  ) {
    super(message, error ? { cause: error } : undefined)
    this.name = 'IntegrationOperationConflictError'
  }

  public format() {
    return `[${this.type}] ${this.message} (Error ID: ${this.id})`
  }

  public toJSON() {
    return {
      id: this.id,
      code: this.code,
      type: this.type,
      message: this.message,
      metadata: this.metadata,
    }
  }
}

export type ApiError = GeneratedApiError | IntegrationOperationConflictError

export const isApiError = (thrown: unknown): thrown is ApiError =>
  thrown instanceof IntegrationOperationConflictError || isGeneratedApiError(thrown)

export const errorFrom = (error: unknown): ApiError =>
  error instanceof IntegrationOperationConflictError ? error : generatedErrorFrom(error)

export class UploadFileError extends Error {
  public constructor(
    message: string,
    public readonly innerError?: AxiosError,
    public readonly file?: UpsertFileResponse['file']
  ) {
    super(message)
    this.name = 'FileUploadError'
  }
}
