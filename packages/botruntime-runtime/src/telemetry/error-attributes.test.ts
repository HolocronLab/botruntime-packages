import { describe, expect, it } from 'vitest'
import { errorTraceAttributes } from './span-helpers'

describe('error trace attributes', () => {
  it('keeps developer-grade exception diagnostics with stable fallbacks', () => {
    const error = Object.assign(new TypeError("Cannot read properties of undefined (reading 'imageUrl')"), {
      code: 'BLOC_ITEM_INVALID',
    })
    error.stack = 'TypeError: invalid bloc item\n    at Chat.transformMessage (src/runtime/chat/chat.ts:381:52)'

    expect(errorTraceAttributes(error)).toEqual({
      'error.name': 'TypeError',
      'error.code': 'BLOC_ITEM_INVALID',
      'error.message': "Cannot read properties of undefined (reading 'imageUrl')",
      'error.stack': 'TypeError: invalid bloc item\n    at Chat.transformMessage (src/runtime/chat/chat.ts:381:52)',
    })
    expect(errorTraceAttributes('plain failure')).toEqual({
      'error.name': 'Error',
      'error.code': 'Error',
      'error.message': 'plain failure',
    })
  })

  it('bounds diagnostic fields without dropping the exception category', () => {
    const error = new RangeError('x'.repeat(20_000))
    error.stack = 's'.repeat(100_000)

    const attributes = errorTraceAttributes(error)

    expect(attributes['error.name']).toBe('RangeError')
    expect(attributes['error.code']).toBe('RangeError')
    expect((attributes['error.message'] as string).length).toBe(8_192)
    expect((attributes['error.stack'] as string).length).toBe(32_768)
  })

  it('uses the cloud byte limits for multibyte diagnostics', () => {
    const error = new Error('я'.repeat(8_192))
    error.stack = 'ё'.repeat(32_768)

    const attributes = errorTraceAttributes(error)

    expect(new TextEncoder().encode(attributes['error.message'] as string)).toHaveLength(8_192)
    expect(new TextEncoder().encode(attributes['error.stack'] as string)).toHaveLength(32_768)
  })
})
