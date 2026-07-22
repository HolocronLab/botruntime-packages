import { describe, expect, it } from 'vitest'
import { getClientConfig } from './config'

describe('client timeout', () => {
  it('waits beyond the 120-second Cloud host-call deadline by default', () => {
    expect(getClientConfig({}).timeout).toBe(125_000)
  })

  it('keeps an explicit caller timeout', () => {
    expect(getClientConfig({ timeout: 30_000 }).timeout).toBe(30_000)
  })
})
