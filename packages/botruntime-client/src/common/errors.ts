import axios, { type AxiosError } from 'axios'
import * as errors from '../errors'

const CALL_ACTION_PATH = '/v1/chat/actions'
const conservativeActionMetadata = (): Readonly<Record<string, unknown>> =>
  Object.freeze({
    errorKind: 'integration_execution',
    executionCode: 'transport_outcome_unknown',
    executionState: 'outcome_unknown',
    retryable: false,
  })

// errors.errorFrom is GENERATED code (src/gen/public/errors.ts, ADR-0005) that bun run
// generate overwrites wholesale — it must never be hand-patched, so its two known
// crash-prone inputs are guarded HERE, at this owned boundary, instead:
//   - `typeof null === 'object'` slips past errorFrom's own object-shape gate into
//     `'code' in null`, which throws. normalizeForGen() pre-empts this one outright by
//     routing null through errorFrom's own `instanceof Error` branch instead.
//   - an object with a circular reference reaches JSON.stringify deep inside errorFrom and
//     throws "Converting circular structure to JSON". normalizeForGen() can't anticipate
//     every such shape, so safeErrorFrom()'s try/catch is the general backstop: errorFrom is
//     the error HANDLER, so letting a crash inside it propagate would replace the real cause
//     with an unrelated TypeError — the same masking this whole file exists to prevent.
const normalizeForGen = (err: unknown): unknown => (err === null ? new Error('null') : err)

const safeErrorFrom = (err: unknown): errors.ApiError => {
  try {
    return errors.errorFrom(normalizeForGen(err))
  }
  catch {
    return new errors.UnknownError(String(err), toErrorCause(err))
  }
}

const preserveWireCode = (apiError: errors.ApiError, envelope: unknown): errors.ApiError => {
  if (
    typeof envelope === 'object'
    && envelope !== null
    && 'code' in envelope
    && typeof envelope.code === 'number'
    && apiError.code !== envelope.code
  ) {
    // Generated Botpress classes use their canonical status (for example,
    // InternalError=500), while an owned gateway may legitimately return the
    // same type with HTTP 502. The received envelope is authoritative for
    // retry/telemetry, so retain its exact code instead of silently rewriting it.
    Object.defineProperty(apiError, 'code', { value: envelope.code, enumerable: true })
  }
  return apiError
}

// UnknownError's `error` field is typed as Error — wrap non-Error causes (e.g. the circular
// object itself) via the native `cause` option so the original value stays reachable at
// `.error.cause` instead of being discarded, without widening the field's type.
const toErrorCause = (err: unknown): Error => {
  if (err instanceof Error) return err
  if (typeof err === 'object' && err !== null && 'cause' in err && err.cause instanceof Error) return err.cause
  return new Error(String(err), { cause: err })
}

const isCallActionError = (err: AxiosError): boolean => {
  if (err.config?.method?.toLowerCase() !== 'post' || !err.config.url) {
    return false
  }

  try {
    return new URL(err.config.url, 'https://botruntime.invalid').pathname === CALL_ACTION_PATH
  }
  catch {
    return false
  }
}

const validIntegrationExecutionMetadata = (
  envelope: unknown,
): Readonly<Record<string, unknown>> | undefined => {
  if (typeof envelope !== 'object' || envelope === null) {
    return undefined
  }
  const metadata = (envelope as { metadata?: unknown }).metadata
  if (typeof metadata !== 'object' || metadata === null) {
    return undefined
  }
  const execution = metadata as {
    errorKind?: unknown
    executionCode?: unknown
    executionState?: unknown
    retryable?: unknown
  }
  if (
    execution.errorKind !== 'integration_execution'
    || typeof execution.executionCode !== 'string'
    || execution.executionCode.length === 0
    || (
      execution.executionState !== 'not_started'
      && execution.executionState !== 'outcome_unknown'
    )
    || typeof execution.retryable !== 'boolean'
  ) {
    return undefined
  }
  return Object.freeze({
    errorKind: 'integration_execution',
    executionCode: execution.executionCode,
    executionState: execution.executionState,
    retryable: execution.retryable,
  })
}

const attachActionExecutionMetadata = (
  apiError: Error,
  transportError: AxiosError,
): Error => {
  if (!isCallActionError(transportError)) {
    return apiError
  }

  // A response-less or legacy/untyped action failure may already have crossed
  // the provider boundary. Make that ambiguity explicit so downstream durable
  // retries cannot replay it. Only the server's complete fixed metadata may
  // prove that execution did not start.
  const metadata =
    validIntegrationExecutionMetadata(transportError.response?.data)
    ?? conservativeActionMetadata()
  Object.defineProperty(apiError, 'metadata', {
    value: metadata,
    enumerable: true,
    configurable: true,
  })
  return apiError
}

// A transport failure (ECONNRESET/ETIMEDOUT/DNS/socket-closed/...) has no confirmed response;
// the request may still have reached the server. Branch on err.response, not
// err.response.data: an egress-gateway 500/502 with a falsy body (data: '' or null, a live
// scenario) DOES have a response, and reporting it as "no response" is self-contradictory and
// destroys the diagnostic value of the real status code. The no-response branch is its own
// case so err.code/err.message land in the surfaced message (previously buried in the nested
// `.error` cause, unreadable by a naive `catch (e) { log(e.message) }` — the prod-observed
// masking of the real transport cause).
export const toApiError = (err: unknown): Error => {
  if (axios.isAxiosError(err)) {
    let apiError: Error
    if (err.response) {
      if (err.response.data) {
        apiError = preserveWireCode(safeErrorFrom(err.response.data), err.response.data)
      }
      else {
        apiError = new errors.UnknownError(`Request failed with status ${err.response.status} and empty body`, err)
      }
    }
    else {
      apiError = transportError(err)
    }
    return attachActionExecutionMetadata(apiError, err)
  }
  return safeErrorFrom(err)
}

const transportError = (err: AxiosError): errors.UnknownError => {
  const detail = [err.code, err.message].filter(Boolean).join(': ')
  // axios.isAxiosError() duck-types on `isAxiosError === true` (no instanceof guard), so a
  // cross-realm/deserialized object can reach here without actually extending Error.
  const cause = err instanceof Error ? err : new Error(detail || 'no response received')
  return new errors.UnknownError(detail ? `Request failed with no response: ${detail}` : 'Request failed with no response', cause)
}
