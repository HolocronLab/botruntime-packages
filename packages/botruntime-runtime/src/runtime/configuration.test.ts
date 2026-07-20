import { afterEach, describe, expect, it } from 'vitest'
import { configuration } from './configuration'
import { context } from './context/context'

describe('runtime configuration boundary', () => {
  afterEach(() => {
    context.clearDefaultContext()
    delete process.env.ADK_CONFIGURATION
  })

  it('does not read the removed ADK_CONFIGURATION compatibility env', () => {
    process.env.ADK_CONFIGURATION = JSON.stringify({ paymentReturnUrl: 'https://stale.example' })

    expect((configuration as Record<string, unknown>).paymentReturnUrl).toBeUndefined()
    expect(Object.keys(configuration)).toEqual([])
  })

  it('reads canonical configuration from context', () => {
    context.setDefaultContext({ configuration: { paymentReturnUrl: 'https://example.com' } })

    expect((configuration as Record<string, unknown>).paymentReturnUrl).toBe('https://example.com')
    expect(Object.keys(configuration)).toEqual(['paymentReturnUrl'])
  })
})
