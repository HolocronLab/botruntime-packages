
import crypto from 'crypto'

const codes = {
  HTTP_STATUS_BAD_REQUEST: 400,
  HTTP_STATUS_UNAUTHORIZED: 401,
  HTTP_STATUS_PAYMENT_REQUIRED: 402,
  HTTP_STATUS_FORBIDDEN: 403,
  HTTP_STATUS_NOT_FOUND: 404,
  HTTP_STATUS_METHOD_NOT_ALLOWED: 405,
  HTTP_STATUS_REQUEST_TIMEOUT: 408,
  HTTP_STATUS_CONFLICT: 409,
  HTTP_STATUS_GONE: 410,
  HTTP_STATUS_PAYLOAD_TOO_LARGE: 413,
  HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE: 415,
  HTTP_STATUS_DEPENDENCY_FAILED: 424,
  HTTP_STATUS_TOO_MANY_REQUESTS: 429,
  HTTP_STATUS_INTERNAL_SERVER_ERROR: 500,
  HTTP_STATUS_NOT_IMPLEMENTED: 501,
  HTTP_STATUS_BAD_GATEWAY: 502,
  HTTP_STATUS_SERVICE_UNAVAILABLE: 503,
  HTTP_STATUS_GATEWAY_TIMEOUT: 504,
} as const

type ErrorCode = typeof codes[keyof typeof codes]

declare const window: any
type CryptoLib = { getRandomValues(array: Uint8Array): Uint8Array }

const cryptoLibPolyfill: CryptoLib = {
  // Fallback in case crypto isn't available.
  getRandomValues: (array: Uint8Array) => new Uint8Array(array.map(() => Math.floor(Math.random() * 256))),
}

let cryptoLib: CryptoLib =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'
    ? window.crypto // Note: On browsers we need to use window.crypto instead of the imported crypto module as the latter is externalized and doesn't have getRandomValues().
    : crypto

if (!cryptoLib.getRandomValues) {
  // Use a polyfill in older environments that have a crypto implementaton missing getRandomValues()
  cryptoLib = cryptoLibPolyfill
}

abstract class BaseApiError<Code extends ErrorCode, Type extends string, Description extends string> extends Error {
  public readonly isApiError = true

  constructor(
    public readonly code: Code,
    public readonly description: Description,
    public readonly type: Type,
    public override readonly message: string,
    public readonly error?: Error,
    public readonly id?: string,
    public readonly metadata?: Record<string, unknown>,
  ) {
    super(message)

    if (!this.id) {
      this.id = BaseApiError.generateId()
    }
  }

  format() {
    return `[${this.type}] ${this.message} (Error ID: ${this.id})`
  }

  toJSON() {
    return {
      id: this.id,
      code: this.code,
      type: this.type,
      message: this.message,
      metadata: this.metadata,
    }
  }

  static generateId() {
    const prefix = this.getPrefix();
    const timestamp = new Date().toISOString().replace(/[\-:TZ]/g, "").split(".")[0] // UTC time in YYMMDDHHMMSS format

    const randomSuffixByteLength = 4
    const randomHexSuffix = Array.from(cryptoLib.getRandomValues(new Uint8Array(randomSuffixByteLength)))
      .map(x => x.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()

    return `${prefix}_${timestamp}x${randomHexSuffix}`
  }

  private static getPrefix() {
    if (typeof window !== 'undefined' && typeof window.document !== 'undefined') {
      // Browser environment
      return 'err_bwsr'
    }
    return 'err'
  }
}

const isObject = (obj: unknown): obj is object => typeof obj === 'object' && !Array.isArray(obj) && obj !== null

export const isApiError = (thrown: unknown): thrown is ApiError => {
  return thrown instanceof BaseApiError || isObject(thrown) && (thrown as ApiError).isApiError === true
}

type UnknownType = 'Unknown'

/**
 *  An unknown error occurred
 */
export class UnknownError extends BaseApiError<500, UnknownType, 'An unknown error occurred'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(500, 'An unknown error occurred', 'Unknown', message, error, id, metadata)
  }
}

type InternalType = 'Internal'

/**
 *  An internal error occurred
 */
export class InternalError extends BaseApiError<500, InternalType, 'An internal error occurred'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(500, 'An internal error occurred', 'Internal', message, error, id, metadata)
  }
}

type UnauthorizedType = 'Unauthorized'

/**
 *  The request requires to be authenticated.
 */
export class UnauthorizedError extends BaseApiError<401, UnauthorizedType, 'The request requires to be authenticated.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(401, 'The request requires to be authenticated.', 'Unauthorized', message, error, id, metadata)
  }
}

type ForbiddenType = 'Forbidden'

/**
 *  The requested action can\'t be peform by this resource.
 */
export class ForbiddenError extends BaseApiError<403, ForbiddenType, 'The requested action can\'t be peform by this resource.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(403, 'The requested action can\'t be peform by this resource.', 'Forbidden', message, error, id, metadata)
  }
}

type PayloadTooLargeType = 'PayloadTooLarge'

/**
 *  The request payload is too large.
 */
export class PayloadTooLargeError extends BaseApiError<413, PayloadTooLargeType, 'The request payload is too large.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(413, 'The request payload is too large.', 'PayloadTooLarge', message, error, id, metadata)
  }
}

type InvalidPayloadType = 'InvalidPayload'

/**
 *  The request payload is invalid.
 */
export class InvalidPayloadError extends BaseApiError<400, InvalidPayloadType, 'The request payload is invalid.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'The request payload is invalid.', 'InvalidPayload', message, error, id, metadata)
  }
}

type UnsupportedMediaTypeType = 'UnsupportedMediaType'

/**
 *  The request is invalid because the content-type is not supported.
 */
export class UnsupportedMediaTypeError extends BaseApiError<415, UnsupportedMediaTypeType, 'The request is invalid because the content-type is not supported.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(415, 'The request is invalid because the content-type is not supported.', 'UnsupportedMediaType', message, error, id, metadata)
  }
}

type MethodNotFoundType = 'MethodNotFound'

/**
 *  The requested method does not exist.
 */
export class MethodNotFoundError extends BaseApiError<405, MethodNotFoundType, 'The requested method does not exist.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(405, 'The requested method does not exist.', 'MethodNotFound', message, error, id, metadata)
  }
}

type ResourceNotFoundType = 'ResourceNotFound'

/**
 *  The requested resource does not exist.
 */
export class ResourceNotFoundError extends BaseApiError<404, ResourceNotFoundType, 'The requested resource does not exist.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(404, 'The requested resource does not exist.', 'ResourceNotFound', message, error, id, metadata)
  }
}

type InvalidJsonSchemaType = 'InvalidJsonSchema'

/**
 *  The provided JSON schema is invalid.
 */
export class InvalidJsonSchemaError extends BaseApiError<400, InvalidJsonSchemaType, 'The provided JSON schema is invalid.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'The provided JSON schema is invalid.', 'InvalidJsonSchema', message, error, id, metadata)
  }
}

type InvalidDataFormatType = 'InvalidDataFormat'

/**
 *  The provided data doesn\'t respect the provided JSON schema.
 */
export class InvalidDataFormatError extends BaseApiError<400, InvalidDataFormatType, 'The provided data doesn\'t respect the provided JSON schema.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'The provided data doesn\'t respect the provided JSON schema.', 'InvalidDataFormat', message, error, id, metadata)
  }
}

type InvalidIdentifierType = 'InvalidIdentifier'

/**
 *  The provided identifier is not valid. An identifier must start with a lowercase letter, be between 2 and 100 characters long and use only alphanumeric characters.
 */
export class InvalidIdentifierError extends BaseApiError<400, InvalidIdentifierType, 'The provided identifier is not valid. An identifier must start with a lowercase letter, be between 2 and 100 characters long and use only alphanumeric characters.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'The provided identifier is not valid. An identifier must start with a lowercase letter, be between 2 and 100 characters long and use only alphanumeric characters.', 'InvalidIdentifier', message, error, id, metadata)
  }
}

type RelationConflictType = 'RelationConflict'

/**
 *  The resource is related with a different resource that the one referenced in the request. This is usually caused when providing two resource identifiers that aren\'t linked together.
 */
export class RelationConflictError extends BaseApiError<409, RelationConflictType, 'The resource is related with a different resource that the one referenced in the request. This is usually caused when providing two resource identifiers that aren\'t linked together.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(409, 'The resource is related with a different resource that the one referenced in the request. This is usually caused when providing two resource identifiers that aren\'t linked together.', 'RelationConflict', message, error, id, metadata)
  }
}

type ReferenceConstraintType = 'ReferenceConstraint'

/**
 *  The resource cannot be deleted because it\'s referenced by another resource
 */
export class ReferenceConstraintError extends BaseApiError<409, ReferenceConstraintType, 'The resource cannot be deleted because it\'s referenced by another resource'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(409, 'The resource cannot be deleted because it\'s referenced by another resource', 'ReferenceConstraint', message, error, id, metadata)
  }
}

type ResourceLockedConflictType = 'ResourceLockedConflict'

/**
 *  The resource is current locked and cannot be operated on until the lock is released.
 */
export class ResourceLockedConflictError extends BaseApiError<409, ResourceLockedConflictType, 'The resource is current locked and cannot be operated on until the lock is released.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(409, 'The resource is current locked and cannot be operated on until the lock is released.', 'ResourceLockedConflict', message, error, id, metadata)
  }
}

type ResourceGoneType = 'ResourceGone'

/**
 *  The requested resource is no longer available.
 */
export class ResourceGoneError extends BaseApiError<410, ResourceGoneType, 'The requested resource is no longer available.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(410, 'The requested resource is no longer available.', 'ResourceGone', message, error, id, metadata)
  }
}

type ReferenceNotFoundType = 'ReferenceNotFound'

/**
 *  The provided resource reference is missing. This is usually caused when providing an invalid id inside the payload of a request.
 */
export class ReferenceNotFoundError extends BaseApiError<400, ReferenceNotFoundType, 'The provided resource reference is missing. This is usually caused when providing an invalid id inside the payload of a request.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'The provided resource reference is missing. This is usually caused when providing an invalid id inside the payload of a request.', 'ReferenceNotFound', message, error, id, metadata)
  }
}

type InvalidQueryType = 'InvalidQuery'

/**
 *  The provided query is invalid. This is usually caused when providing an invalid parameter for querying a resource.
 */
export class InvalidQueryError extends BaseApiError<400, InvalidQueryType, 'The provided query is invalid. This is usually caused when providing an invalid parameter for querying a resource.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'The provided query is invalid. This is usually caused when providing an invalid parameter for querying a resource.', 'InvalidQuery', message, error, id, metadata)
  }
}

type RuntimeType = 'Runtime'

/**
 *  An error happened during the execution of a runtime (bot or integration).
 */
export class RuntimeError extends BaseApiError<400, RuntimeType, 'An error happened during the execution of a runtime (bot or integration).'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'An error happened during the execution of a runtime (bot or integration).', 'Runtime', message, error, id, metadata)
  }
}

type AlreadyExistsType = 'AlreadyExists'

/**
 *  The record attempted to be created already exists.
 */
export class AlreadyExistsError extends BaseApiError<409, AlreadyExistsType, 'The record attempted to be created already exists.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(409, 'The record attempted to be created already exists.', 'AlreadyExists', message, error, id, metadata)
  }
}

type RateLimitedType = 'RateLimited'

/**
 *  The request has been rate limited.
 */
export class RateLimitedError extends BaseApiError<429, RateLimitedType, 'The request has been rate limited.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(429, 'The request has been rate limited.', 'RateLimited', message, error, id, metadata)
  }
}

type PaymentRequiredType = 'PaymentRequired'

/**
 *  A payment is required to perform this request.
 */
export class PaymentRequiredError extends BaseApiError<402, PaymentRequiredType, 'A payment is required to perform this request.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(402, 'A payment is required to perform this request.', 'PaymentRequired', message, error, id, metadata)
  }
}

type QuotaExceededType = 'QuotaExceeded'

/**
 *  The request exceeds the allowed quota. Quotas are a soft limit that can be increased.
 */
export class QuotaExceededError extends BaseApiError<403, QuotaExceededType, 'The request exceeds the allowed quota. Quotas are a soft limit that can be increased.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(403, 'The request exceeds the allowed quota. Quotas are a soft limit that can be increased.', 'QuotaExceeded', message, error, id, metadata)
  }
}

type LimitExceededType = 'LimitExceeded'

/**
 *  The request exceeds the allowed limit. Limits are a hard limit that cannot be increased.
 */
export class LimitExceededError extends BaseApiError<413, LimitExceededType, 'The request exceeds the allowed limit. Limits are a hard limit that cannot be increased.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(413, 'The request exceeds the allowed limit. Limits are a hard limit that cannot be increased.', 'LimitExceeded', message, error, id, metadata)
  }
}

type BreakingChangesType = 'BreakingChanges'

/**
 *  Request payload contains breaking changes which is not allowed for this resource without a version increment.
 */
export class BreakingChangesError extends BaseApiError<400, BreakingChangesType, 'Request payload contains breaking changes which is not allowed for this resource without a version increment.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(400, 'Request payload contains breaking changes which is not allowed for this resource without a version increment.', 'BreakingChanges', message, error, id, metadata)
  }
}

type OperationTimeoutType = 'OperationTimeout'

/**
 *  The operation timed out.
 */
export class OperationTimeoutError extends BaseApiError<504, OperationTimeoutType, 'The operation timed out.'> {
  constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) {
    super(504, 'The operation timed out.', 'OperationTimeout', message, error, id, metadata)
  }
}

export type ErrorType =
  | 'Unknown'
  | 'Internal'
  | 'Unauthorized'
  | 'Forbidden'
  | 'PayloadTooLarge'
  | 'InvalidPayload'
  | 'UnsupportedMediaType'
  | 'MethodNotFound'
  | 'ResourceNotFound'
  | 'InvalidJsonSchema'
  | 'InvalidDataFormat'
  | 'InvalidIdentifier'
  | 'RelationConflict'
  | 'ReferenceConstraint'
  | 'ResourceLockedConflict'
  | 'ResourceGone'
  | 'ReferenceNotFound'
  | 'InvalidQuery'
  | 'Runtime'
  | 'AlreadyExists'
  | 'RateLimited'
  | 'PaymentRequired'
  | 'QuotaExceeded'
  | 'LimitExceeded'
  | 'BreakingChanges'
  | 'OperationTimeout'

export type ApiError =
  | UnknownError
  | InternalError
  | UnauthorizedError
  | ForbiddenError
  | PayloadTooLargeError
  | InvalidPayloadError
  | UnsupportedMediaTypeError
  | MethodNotFoundError
  | ResourceNotFoundError
  | InvalidJsonSchemaError
  | InvalidDataFormatError
  | InvalidIdentifierError
  | RelationConflictError
  | ReferenceConstraintError
  | ResourceLockedConflictError
  | ResourceGoneError
  | ReferenceNotFoundError
  | InvalidQueryError
  | RuntimeError
  | AlreadyExistsError
  | RateLimitedError
  | PaymentRequiredError
  | QuotaExceededError
  | LimitExceededError
  | BreakingChangesError
  | OperationTimeoutError

const errorTypes: { [type: string]: new (message: string, error?: Error, id?: string, metadata?: Record<string, unknown>) => ApiError } = {
  Unknown: UnknownError,
  Internal: InternalError,
  Unauthorized: UnauthorizedError,
  Forbidden: ForbiddenError,
  PayloadTooLarge: PayloadTooLargeError,
  InvalidPayload: InvalidPayloadError,
  UnsupportedMediaType: UnsupportedMediaTypeError,
  MethodNotFound: MethodNotFoundError,
  ResourceNotFound: ResourceNotFoundError,
  InvalidJsonSchema: InvalidJsonSchemaError,
  InvalidDataFormat: InvalidDataFormatError,
  InvalidIdentifier: InvalidIdentifierError,
  RelationConflict: RelationConflictError,
  ReferenceConstraint: ReferenceConstraintError,
  ResourceLockedConflict: ResourceLockedConflictError,
  ResourceGone: ResourceGoneError,
  ReferenceNotFound: ReferenceNotFoundError,
  InvalidQuery: InvalidQueryError,
  Runtime: RuntimeError,
  AlreadyExists: AlreadyExistsError,
  RateLimited: RateLimitedError,
  PaymentRequired: PaymentRequiredError,
  QuotaExceeded: QuotaExceededError,
  LimitExceeded: LimitExceededError,
  BreakingChanges: BreakingChangesError,
  OperationTimeout: OperationTimeoutError,
}

export const errorFrom = (err: unknown): ApiError => {
  if (isApiError(err)) {
    return err
  }
  else if (err instanceof Error) {
    return new UnknownError(err.message, err)
  }
  else if (typeof err === 'string') {
    return new UnknownError(err)
  }
  else {
    return getApiErrorFromObject(err)
  }
}

function getApiErrorFromObject(err: any) {
  // Check if it's an deserialized API error object
  if (typeof err === 'object' && 'code' in err && 'type' in err && 'id' in err && 'message' in err && typeof err.type === 'string' && typeof err.message === 'string') {
    const ErrorClass = errorTypes[err.type]
    if (!ErrorClass) {
      return new UnknownError(`An unclassified API error occurred: ${err.message} (Type: ${err.type}, Code: ${err.code})`)
    }

    return new ErrorClass(err.message, undefined, <string>err.id || 'UNKNOWN', err.metadata) // If error ID was not received do not pass undefined to generate a new one, flag it as UNKNOWN so we can fix the issue.
  }

  return new UnknownError('An invalid error occurred: ' + JSON.stringify(err))
}
