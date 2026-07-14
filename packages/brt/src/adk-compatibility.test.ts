import { describe, expect, it } from 'vitest'
import { assertAdkCompatibility } from './adk-compatibility'

describe('assertAdkCompatibility', () => {
  it('fails with an update instruction for an incompatible CLI', () => {
    expect(() => assertAdkCompatibility('0.5.4', '>=0.5.8 <0.6.0')).toThrow(/update.*brt|requires.*brt/i)
  })

  it('accepts a compatible CLI', () => {
    expect(() => assertAdkCompatibility('0.5.8', '>=0.5.8 <0.6.0')).not.toThrow()
  })

  it('fails loudly when an ADK has no compatibility metadata', () => {
    expect(() => assertAdkCompatibility('0.5.8', undefined)).toThrow(/compatibility metadata|update/i)
  })
})
