import { describe, expect, it } from 'vitest'
import { AxiosError, AxiosHeaders, type InternalAxiosRequestConfig } from 'axios'
import { isApiError, UnknownError } from '../errors'
import { toApiError } from './errors'

// Debt #1 (prod incident): botruntime-client callers (callAction, Tables read/write, telegram
// sendDocument, ...) intermittently saw the masked "First argument must be an Error object"
// instead of the real transport cause. Root-caused (see PR description) to defects on the
// toApiError/errorFrom path — none require a live network or a specific engine quirk to
// trigger:
//
//   1. toApiError's no-response branch discarded err.code (e.g. ECONNRESET/ETIMEDOUT) — it
//      only survived buried in the nested `.error` cause, not in the message text a naive
//      `catch (e) { log(e.message) }` actually reads.
//   2. errorFrom (src/gen/public/errors.ts — GENERATED, ADR-0005, never hand-patched) crashes
//      outright (a genuine TypeError, not the real cause) on inputs that aren't
//      Error/string/well-formed-object: `null` ("Cannot use 'in' operator to search for 'code'
//      in null") and any object with a circular reference ("Converting circular structure to
//      JSON"). The guard lives at the OWNED boundary (this file's toApiError), so these
//      scenarios are exercised through the public toApiError, not by calling gen's errorFrom
//      directly.
//   3. toApiError branched on err.response?.data instead of err.response — a response that DID
//      arrive but carries a falsy body (egress-gateway 500/502 with data: '' or null, a live
//      scenario) was misreported as "no response", discarding the real status code.

class FakeAxiosError extends Error {
  public readonly isAxiosError = true as const
  public code?: string
  public response?: { data: unknown; status: number }

  public constructor(message: string, code?: string, response?: { data: unknown; status: number }) {
    super(message)
    this.name = 'AxiosError'
    this.code = code
    this.response = response
  }
}

describe('toApiError — no-response transport failures', () => {
  it('folds err.code into the message (ECONNRESET) so it survives a naive catch(e){ log(e.message) }', () => {
    const err = new FakeAxiosError('socket hang up', 'ECONNRESET')
    const apiErr = toApiError(err)
    expect(apiErr).toBeInstanceOf(UnknownError)
    expect(apiErr.message).toBe('Request failed with no response: ECONNRESET: socket hang up')
  })

  it('folds err.code into the message (ETIMEDOUT)', () => {
    const err = new FakeAxiosError('timeout of 5000ms exceeded', 'ETIMEDOUT')
    const apiErr = toApiError(err)
    expect(apiErr.message).toBe('Request failed with no response: ETIMEDOUT: timeout of 5000ms exceeded')
  })

  it('keeps the original error reachable as the cause (.error)', () => {
    const err = new FakeAxiosError('socket hang up', 'ECONNRESET')
    const apiErr = toApiError(err) as UnknownError
    expect(apiErr.error).toBe(err)
  })

  it('degrades gracefully when the transport error carries neither code nor message', () => {
    const err = new FakeAxiosError('')
    expect(() => toApiError(err)).not.toThrow()
    expect(toApiError(err).message).toBe('Request failed with no response')
  })

  it('never throws for a duck-typed AxiosError-shaped object that is not a real Error instance', () => {
    // axios.isAxiosError() only checks `isAxiosError === true` on a plain object (no instanceof
    // guard) — a cross-realm/deserialized error can satisfy it without extending Error.
    const err = { isAxiosError: true, message: 'weird transport failure', code: 'EWEIRD' }
    expect(() => toApiError(err)).not.toThrow()
    expect(toApiError(err).message).toContain('EWEIRD')
    expect(toApiError(err).message).toContain('weird transport failure')
  })

  it('still parses a real {code,type,id,message} envelope when a response body IS present (unaffected by this fix)', () => {
    const err = new FakeAxiosError('Request failed with status code 404', undefined, {
      data: { code: 404, type: 'ResourceNotFound', id: 'e1', message: 'not found' },
      status: 404,
    })
    const apiErr = toApiError(err)
    expect(isApiError(apiErr) && apiErr.type).toBe('ResourceNotFound')
  })

  it('preserves an owned gateway HTTP code when the generated error type has a different canonical code', () => {
    const err = new FakeAxiosError('Request failed with status code 502', undefined, {
      data: { code: 502, type: 'Internal', id: 'e502', message: 'cognitive generate failed' },
      status: 502,
    })
    const apiErr = toApiError(err)
    expect(isApiError(apiErr) && apiErr.code).toBe(502)
    expect(isApiError(apiErr) && apiErr.type).toBe('Internal')
  })
})

describe('toApiError — response present but body is falsy (finding 2: egress-gateway 500/502 with empty body)', () => {
  it('500 with an empty-string body: message carries the real status, not "no response"', () => {
    const err = new FakeAxiosError('Request failed with status code 500', 'ERR_BAD_RESPONSE', {
      data: '',
      status: 500,
    })
    const apiErr = toApiError(err)
    expect(apiErr.message).toContain('500')
    expect(apiErr.message).not.toContain('no response')
  })

  it('502 with a null body: message carries the real status, not "no response"', () => {
    const err = new FakeAxiosError('Request failed with status code 502', 'ERR_BAD_RESPONSE', {
      data: null,
      status: 502,
    })
    const apiErr = toApiError(err)
    expect(apiErr.message).toContain('502')
    expect(apiErr.message).not.toContain('no response')
  })

  it('a genuine no-response transport failure (no err.response at all) still reports "no response"', () => {
    const err = new FakeAxiosError('socket hang up', 'ECONNRESET')
    expect(toApiError(err).message).toContain('no response')
  })
})

describe('toApiError — errorFrom crash-proofing lives at the owned boundary (finding 1); gen code (src/gen/public/errors.ts) stays pristine', () => {
  it('does not throw when the thrown value is null (no axios envelope at all)', () => {
    expect(() => toApiError(null)).not.toThrow()
    expect(toApiError(null)).toBeInstanceOf(UnknownError)
  })

  it('does not throw when the thrown value is undefined', () => {
    expect(() => toApiError(undefined)).not.toThrow()
  })

  it('does not throw when the axios response body is an object with a circular reference', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const err = new FakeAxiosError('weird body', undefined, { data: circular, status: 200 })
    expect(() => toApiError(err)).not.toThrow()
    expect(toApiError(err)).toBeInstanceOf(UnknownError)
  })

  it('preserves the original circular object as the cause — not discarded, not silently swapped', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const apiErr = toApiError(circular) as UnknownError
    expect(apiErr.error?.cause).toBe(circular)
  })
})

describe('toApiError — action execution outcome safety', () => {
  const actionConfig = {
    method: 'post',
    url: '/v1/chat/actions',
    headers: new AxiosHeaders(),
  } as InternalAxiosRequestConfig

  const fallbackMetadata = {
    errorKind: 'integration_execution',
    executionCode: 'transport_outcome_unknown',
    executionState: 'outcome_unknown',
    retryable: false,
  }

  it('maps a response-less action failure to a fresh frozen conservative outcome', () => {
    const first = toApiError(
      new AxiosError('socket hang up', AxiosError.ERR_NETWORK, actionConfig),
    ) as UnknownError
    const second = toApiError(
      new AxiosError('socket hang up', AxiosError.ERR_NETWORK, actionConfig),
    ) as UnknownError

    expect(first.metadata).toEqual(fallbackMetadata)
    expect(Object.isFrozen(first.metadata)).toBe(true)
    expect(first.metadata).not.toBe(second.metadata)
  })

  it('maps a legacy untyped action response to the conservative outcome', () => {
    const response = {
      data: {
        id: 'err_legacy',
        code: 502,
        type: 'Internal',
        message: 'integration action failed',
      },
      status: 502,
      statusText: 'Bad Gateway',
      headers: {},
      config: actionConfig,
    }
    const mapped = toApiError(
      new AxiosError(
        'Request failed with status code 502',
        AxiosError.ERR_BAD_RESPONSE,
        actionConfig,
        undefined,
        response,
      ),
    ) as UnknownError

    expect(mapped.metadata).toEqual(fallbackMetadata)
  })

  it('preserves complete fixed not_started metadata', () => {
    const metadata = {
      errorKind: 'integration_execution',
      executionCode: 'queue_timeout',
      executionState: 'not_started',
      retryable: true,
    }
    const response = {
      data: {
        id: 'err_not_started',
        code: 503,
        type: 'Internal',
        message: 'integration action was not started',
        metadata,
      },
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
      config: actionConfig,
    }
    const mapped = toApiError(
      new AxiosError(
        'Request failed with status code 503',
        AxiosError.ERR_BAD_RESPONSE,
        actionConfig,
        undefined,
        response,
      ),
    ) as UnknownError

    expect(mapped.metadata).toEqual(metadata)
    expect(mapped.metadata).not.toBe(metadata)
    expect(Object.isFrozen(mapped.metadata)).toBe(true)
  })

  it('fails closed when action response metadata is incomplete', () => {
    const response = {
      data: {
        id: 'err_malformed',
        code: 503,
        type: 'Internal',
        message: 'integration action was not started',
        metadata: {
          errorKind: 'integration_execution',
          executionState: 'not_started',
          retryable: true,
        },
      },
      status: 503,
      statusText: 'Service Unavailable',
      headers: {},
      config: actionConfig,
    }
    const mapped = toApiError(
      new AxiosError(
        'Request failed with status code 503',
        AxiosError.ERR_BAD_RESPONSE,
        actionConfig,
        undefined,
        response,
      ),
    ) as UnknownError

    expect(mapped.metadata).toEqual(fallbackMetadata)
  })
})
