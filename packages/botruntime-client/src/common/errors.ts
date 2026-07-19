import axios, { type AxiosError } from 'axios'
import * as errors from '../errors'

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

// A transport failure (ECONNRESET/ETIMEDOUT/DNS/socket-closed/...) never reaches the server, so
// err.response is absent — branch on err.response, not err.response.data: an egress-gateway
// 500/502 with a falsy body (data: '' or null, a live scenario) DOES have a response, and
// reporting it as "no response" is self-contradictory and destroys the diagnostic value of the
// real status code. The no-response branch is its own case so err.code/err.message land in the
// surfaced message (previously buried in the nested `.error` cause, unreadable by a naive
// `catch (e) { log(e.message) }` — the prod-observed masking of the real transport cause).
export const toApiError = (err: unknown): Error => {
  if (axios.isAxiosError(err)) {
    if (err.response) {
      if (err.response.data) {
        return preserveWireCode(safeErrorFrom(err.response.data), err.response.data)
      }
      return new errors.UnknownError(`Request failed with status ${err.response.status} and empty body`, err)
    }
    return transportError(err)
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
