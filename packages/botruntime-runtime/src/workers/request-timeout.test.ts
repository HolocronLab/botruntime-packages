import { describe, expect, it } from 'vitest'

import {
  DEFAULT_DEV_REQUEST_TIMEOUT_MS,
  MAX_DEV_REQUEST_TIMEOUT_MS,
  getConfiguredDevRequestTimeoutMs,
} from './request-timeout'

describe('getConfiguredDevRequestTimeoutMs', () => {
  it('uses the platform invocation ceiling even when the environment asks for longer', () => {
    expect(getConfiguredDevRequestTimeoutMs('600000')).toBe(MAX_DEV_REQUEST_TIMEOUT_MS)
  })

  it('keeps valid shorter timeouts and falls back for invalid values', () => {
    expect(getConfiguredDevRequestTimeoutMs('45000')).toBe(45_000)
    expect(getConfiguredDevRequestTimeoutMs('invalid')).toBe(DEFAULT_DEV_REQUEST_TIMEOUT_MS)
  })
})
