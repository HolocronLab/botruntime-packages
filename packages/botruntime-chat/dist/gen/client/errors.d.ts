declare const codes: {
    readonly HTTP_STATUS_BAD_REQUEST: 400;
    readonly HTTP_STATUS_UNAUTHORIZED: 401;
    readonly HTTP_STATUS_PAYMENT_REQUIRED: 402;
    readonly HTTP_STATUS_FORBIDDEN: 403;
    readonly HTTP_STATUS_NOT_FOUND: 404;
    readonly HTTP_STATUS_METHOD_NOT_ALLOWED: 405;
    readonly HTTP_STATUS_REQUEST_TIMEOUT: 408;
    readonly HTTP_STATUS_CONFLICT: 409;
    readonly HTTP_STATUS_GONE: 410;
    readonly HTTP_STATUS_PAYLOAD_TOO_LARGE: 413;
    readonly HTTP_STATUS_UNSUPPORTED_MEDIA_TYPE: 415;
    readonly HTTP_STATUS_DEPENDENCY_FAILED: 424;
    readonly HTTP_STATUS_TOO_MANY_REQUESTS: 429;
    readonly HTTP_STATUS_INTERNAL_SERVER_ERROR: 500;
    readonly HTTP_STATUS_NOT_IMPLEMENTED: 501;
    readonly HTTP_STATUS_BAD_GATEWAY: 502;
    readonly HTTP_STATUS_SERVICE_UNAVAILABLE: 503;
    readonly HTTP_STATUS_GATEWAY_TIMEOUT: 504;
};
type ErrorCode = typeof codes[keyof typeof codes];
declare abstract class BaseApiError<Code extends ErrorCode, Type extends string, Description extends string> extends Error {
    readonly code: Code;
    readonly description: Description;
    readonly type: Type;
    readonly message: string;
    readonly error?: Error | undefined;
    readonly id?: string | undefined;
    readonly metadata?: Record<string, unknown> | undefined;
    readonly isApiError = true;
    constructor(code: Code, description: Description, type: Type, message: string, error?: Error | undefined, id?: string | undefined, metadata?: Record<string, unknown> | undefined);
    format(): string;
    toJSON(): {
        id: string | undefined;
        code: Code;
        type: Type;
        message: string;
        metadata: Record<string, unknown> | undefined;
    };
    static generateId(): string;
    private static getPrefix;
}
export declare const isApiError: (thrown: unknown) => thrown is ApiError;
type UnknownType = 'Unknown';
/**
 *  An unknown error occurred
 */
export declare class UnknownError extends BaseApiError<500, UnknownType, 'An unknown error occurred'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type InternalType = 'Internal';
/**
 *  An internal error occurred
 */
export declare class InternalError extends BaseApiError<500, InternalType, 'An internal error occurred'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type UnauthorizedType = 'Unauthorized';
/**
 *  The request requires to be authenticated.
 */
export declare class UnauthorizedError extends BaseApiError<401, UnauthorizedType, 'The request requires to be authenticated.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type ForbiddenType = 'Forbidden';
/**
 *  The requested action can\'t be peform by this resource.
 */
export declare class ForbiddenError extends BaseApiError<403, ForbiddenType, 'The requested action can\'t be peform by this resource.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type PayloadTooLargeType = 'PayloadTooLarge';
/**
 *  The request payload is too large.
 */
export declare class PayloadTooLargeError extends BaseApiError<413, PayloadTooLargeType, 'The request payload is too large.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type InvalidPayloadType = 'InvalidPayload';
/**
 *  The request payload is invalid.
 */
export declare class InvalidPayloadError extends BaseApiError<400, InvalidPayloadType, 'The request payload is invalid.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type UnsupportedMediaTypeType = 'UnsupportedMediaType';
/**
 *  The request is invalid because the content-type is not supported.
 */
export declare class UnsupportedMediaTypeError extends BaseApiError<415, UnsupportedMediaTypeType, 'The request is invalid because the content-type is not supported.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type MethodNotFoundType = 'MethodNotFound';
/**
 *  The requested method does not exist.
 */
export declare class MethodNotFoundError extends BaseApiError<405, MethodNotFoundType, 'The requested method does not exist.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type ResourceNotFoundType = 'ResourceNotFound';
/**
 *  The requested resource does not exist.
 */
export declare class ResourceNotFoundError extends BaseApiError<404, ResourceNotFoundType, 'The requested resource does not exist.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type InvalidJsonSchemaType = 'InvalidJsonSchema';
/**
 *  The provided JSON schema is invalid.
 */
export declare class InvalidJsonSchemaError extends BaseApiError<400, InvalidJsonSchemaType, 'The provided JSON schema is invalid.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type InvalidDataFormatType = 'InvalidDataFormat';
/**
 *  The provided data doesn\'t respect the provided JSON schema.
 */
export declare class InvalidDataFormatError extends BaseApiError<400, InvalidDataFormatType, 'The provided data doesn\'t respect the provided JSON schema.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type InvalidIdentifierType = 'InvalidIdentifier';
/**
 *  The provided identifier is not valid. An identifier must start with a lowercase letter, be between 2 and 100 characters long and use only alphanumeric characters.
 */
export declare class InvalidIdentifierError extends BaseApiError<400, InvalidIdentifierType, 'The provided identifier is not valid. An identifier must start with a lowercase letter, be between 2 and 100 characters long and use only alphanumeric characters.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type RelationConflictType = 'RelationConflict';
/**
 *  The resource is related with a different resource that the one referenced in the request. This is usually caused when providing two resource identifiers that aren\'t linked together.
 */
export declare class RelationConflictError extends BaseApiError<409, RelationConflictType, 'The resource is related with a different resource that the one referenced in the request. This is usually caused when providing two resource identifiers that aren\'t linked together.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type ReferenceConstraintType = 'ReferenceConstraint';
/**
 *  The resource cannot be deleted because it\'s referenced by another resource
 */
export declare class ReferenceConstraintError extends BaseApiError<409, ReferenceConstraintType, 'The resource cannot be deleted because it\'s referenced by another resource'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type ResourceLockedConflictType = 'ResourceLockedConflict';
/**
 *  The resource is current locked and cannot be operated on until the lock is released.
 */
export declare class ResourceLockedConflictError extends BaseApiError<409, ResourceLockedConflictType, 'The resource is current locked and cannot be operated on until the lock is released.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type ResourceGoneType = 'ResourceGone';
/**
 *  The requested resource is no longer available.
 */
export declare class ResourceGoneError extends BaseApiError<410, ResourceGoneType, 'The requested resource is no longer available.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type ReferenceNotFoundType = 'ReferenceNotFound';
/**
 *  The provided resource reference is missing. This is usually caused when providing an invalid id inside the payload of a request.
 */
export declare class ReferenceNotFoundError extends BaseApiError<400, ReferenceNotFoundType, 'The provided resource reference is missing. This is usually caused when providing an invalid id inside the payload of a request.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type InvalidQueryType = 'InvalidQuery';
/**
 *  The provided query is invalid. This is usually caused when providing an invalid parameter for querying a resource.
 */
export declare class InvalidQueryError extends BaseApiError<400, InvalidQueryType, 'The provided query is invalid. This is usually caused when providing an invalid parameter for querying a resource.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type RuntimeType = 'Runtime';
/**
 *  An error happened during the execution of a runtime (bot or integration).
 */
export declare class RuntimeError extends BaseApiError<400, RuntimeType, 'An error happened during the execution of a runtime (bot or integration).'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type AlreadyExistsType = 'AlreadyExists';
/**
 *  The record attempted to be created already exists.
 */
export declare class AlreadyExistsError extends BaseApiError<409, AlreadyExistsType, 'The record attempted to be created already exists.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type RateLimitedType = 'RateLimited';
/**
 *  The request has been rate limited.
 */
export declare class RateLimitedError extends BaseApiError<429, RateLimitedType, 'The request has been rate limited.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type PaymentRequiredType = 'PaymentRequired';
/**
 *  A payment is required to perform this request.
 */
export declare class PaymentRequiredError extends BaseApiError<402, PaymentRequiredType, 'A payment is required to perform this request.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type QuotaExceededType = 'QuotaExceeded';
/**
 *  The request exceeds the allowed quota. Quotas are a soft limit that can be increased.
 */
export declare class QuotaExceededError extends BaseApiError<403, QuotaExceededType, 'The request exceeds the allowed quota. Quotas are a soft limit that can be increased.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type LimitExceededType = 'LimitExceeded';
/**
 *  The request exceeds the allowed limit. Limits are a hard limit that cannot be increased.
 */
export declare class LimitExceededError extends BaseApiError<413, LimitExceededType, 'The request exceeds the allowed limit. Limits are a hard limit that cannot be increased.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type BreakingChangesType = 'BreakingChanges';
/**
 *  Request payload contains breaking changes which is not allowed for this resource without a version increment.
 */
export declare class BreakingChangesError extends BaseApiError<400, BreakingChangesType, 'Request payload contains breaking changes which is not allowed for this resource without a version increment.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
type OperationTimeoutType = 'OperationTimeout';
/**
 *  The operation timed out.
 */
export declare class OperationTimeoutError extends BaseApiError<504, OperationTimeoutType, 'The operation timed out.'> {
    constructor(message: string, error?: Error, id?: string, metadata?: Record<string, unknown>);
}
export type ErrorType = 'Unknown' | 'Internal' | 'Unauthorized' | 'Forbidden' | 'PayloadTooLarge' | 'InvalidPayload' | 'UnsupportedMediaType' | 'MethodNotFound' | 'ResourceNotFound' | 'InvalidJsonSchema' | 'InvalidDataFormat' | 'InvalidIdentifier' | 'RelationConflict' | 'ReferenceConstraint' | 'ResourceLockedConflict' | 'ResourceGone' | 'ReferenceNotFound' | 'InvalidQuery' | 'Runtime' | 'AlreadyExists' | 'RateLimited' | 'PaymentRequired' | 'QuotaExceeded' | 'LimitExceeded' | 'BreakingChanges' | 'OperationTimeout';
export type ApiError = UnknownError | InternalError | UnauthorizedError | ForbiddenError | PayloadTooLargeError | InvalidPayloadError | UnsupportedMediaTypeError | MethodNotFoundError | ResourceNotFoundError | InvalidJsonSchemaError | InvalidDataFormatError | InvalidIdentifierError | RelationConflictError | ReferenceConstraintError | ResourceLockedConflictError | ResourceGoneError | ReferenceNotFoundError | InvalidQueryError | RuntimeError | AlreadyExistsError | RateLimitedError | PaymentRequiredError | QuotaExceededError | LimitExceededError | BreakingChangesError | OperationTimeoutError;
export declare const errorFrom: (err: unknown) => ApiError;
export {};
