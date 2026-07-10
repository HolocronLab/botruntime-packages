import { describe, expect, it } from 'vitest'
import { jsonEqual, sortKeysDeep } from './json-utils.js'

describe('dependency JSON utilities', () => {
  it('sorts own __proto__ keys without mutating or inheriting from them', () => {
    const input = JSON.parse('{"z":1,"__proto__":{"polluted":true},"nested":{"__proto__":"value","a":2}}')

    const sorted = sortKeysDeep(input)

    expect(Object.prototype.hasOwnProperty.call(sorted, '__proto__')).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(sorted.nested, '__proto__')).toBe(true)
    expect(Object.getPrototypeOf(sorted)).toBe(Object.prototype)
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined()
    expect(JSON.stringify(sorted)).toBe(
      '{"__proto__":{"polluted":true},"nested":{"__proto__":"value","a":2},"z":1}'
    )
    expect(jsonEqual(sorted, input)).toBe(true)
  })
})
