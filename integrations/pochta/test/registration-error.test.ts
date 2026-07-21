import { describe, expect, test } from 'bun:test'
import { RuntimeError } from '@holocronlab/botruntime-sdk'

import {
  POCHTA_TRACKING_CREDENTIALS_MESSAGE,
  toPochtaRegistrationError,
} from '../src/registration-error'
import { POCHTA_ERROR_CODE, PochtaApiError } from '../src/pochta-api'

describe('Pochta registration errors', () => {
  test('maps only a classified authorization fault to a safe public RuntimeError', () => {
    const providerError = new PochtaApiError(
      500,
      'provider body contained api-user and super-secret',
      POCHTA_ERROR_CODE.authorizationFailed,
    )

    const error = toPochtaRegistrationError(providerError)

    expect(error).toBeInstanceOf(RuntimeError)
    expect(error.message).toBe(POCHTA_TRACKING_CREDENTIALS_MESSAGE)
    expect(JSON.stringify((error as RuntimeError).toJSON())).not.toContain('api-user')
    expect(JSON.stringify((error as RuntimeError).toJSON())).not.toContain('super-secret')
  })

  test('does not turn an unknown SOAP fault into a public provider message', () => {
    const providerError = new PochtaApiError(
      500,
      'provider body contained super-secret',
      POCHTA_ERROR_CODE.soapFault,
    )

    expect(toPochtaRegistrationError(providerError)).toBe(providerError)
  })
})
