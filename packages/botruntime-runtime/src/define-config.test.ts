import { describe, expect, it } from 'vitest'
import { defineConfig } from './define-config'

describe('defineConfig maxExecutionTime', () => {
  it('accepts an integer execution timeout in seconds', () => {
    expect(defineConfig({ maxExecutionTime: 300 }).maxExecutionTime).toBe(300)
  })

  it.each([0, -1, 1.5, 3601])('rejects an invalid execution timeout: %p', (maxExecutionTime) => {
    expect(() => defineConfig({ maxExecutionTime })).toThrow(/maxExecutionTime/i)
  })
})
