import { describe, expect, it } from 'vitest'
import {
  DEFAULT_API_REQUEST_TIMEOUT_MS,
  DEFAULT_ACTION_REQUEST_TIMEOUT_MS,
  getClientConfig,
} from './config'

describe('client timeout', () => {
  it('keeps unrelated calls at 125 seconds and gives actions the complete host envelope', () => {
    expect(DEFAULT_API_REQUEST_TIMEOUT_MS).toBe(125_000)
    expect(DEFAULT_ACTION_REQUEST_TIMEOUT_MS).toBe(190_000)
    expect(getClientConfig({}).timeout).toBe(DEFAULT_API_REQUEST_TIMEOUT_MS)
    expect(getClientConfig({}).actionTransportTimeoutMs).toBe(DEFAULT_ACTION_REQUEST_TIMEOUT_MS)
  })

  it('keeps an explicit caller timeout', () => {
    expect(getClientConfig({ timeout: 30_000 }).timeout).toBe(30_000)
    expect(getClientConfig({ timeout: 30_000 }).actionTransportTimeoutMs).toBe(30_000)
  })

  it('preserves a dynamic invocation budget provider for request-time evaluation', () => {
    const actionTimeoutMs = () => 90_000
    expect(getClientConfig({ actionTimeoutMs }).actionTimeoutMs).toBe(actionTimeoutMs)
  })
})
