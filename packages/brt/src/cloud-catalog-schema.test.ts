import { describe, expect, it } from 'vitest'
import { toCatalogSchema } from './cloud-catalog-schema'

describe('toCatalogSchema', () => {
  it('passes an already-catalog-shaped schema through unchanged', () => {
    const schema = { fields: { token: { type: 'string', required: true, secret: true } } }
    expect(toCatalogSchema(schema)).toBe(schema)
  })

  it('converts a JSON Schema properties/required shape into fields, marking required and secret', () => {
    const jsonSchema = {
      properties: {
        token: { type: 'string', format: 'password' },
        channel: { type: 'string' },
      },
      required: ['channel'],
    }

    expect(toCatalogSchema(jsonSchema)).toEqual({
      fields: {
        token: { type: 'string', required: false, secret: true },
        channel: { type: 'string', required: true, secret: false },
      },
    })
  })

  it('detects secret markers via x-secret, x-botpress-secret, and x-zui.secret', () => {
    const jsonSchema = {
      properties: {
        a: { type: 'string', 'x-secret': true },
        b: { type: 'string', 'x-botpress-secret': true },
        c: { type: 'string', 'x-zui': { secret: true } },
      },
    }
    const result = toCatalogSchema(jsonSchema) as { fields: Record<string, { secret: boolean }> }
    expect(result.fields['a']!.secret).toBe(true)
    expect(result.fields['b']!.secret).toBe(true)
    expect(result.fields['c']!.secret).toBe(true)
  })

  it('defaults a missing type to "string"', () => {
    const result = toCatalogSchema({ properties: { a: {} } }) as { fields: Record<string, { type: string }> }
    expect(result.fields['a']!.type).toBe('string')
  })

  it('returns undefined for non-schema input', () => {
    expect(toCatalogSchema(undefined)).toBeUndefined()
    expect(toCatalogSchema(null)).toBeUndefined()
    expect(toCatalogSchema('nope')).toBeUndefined()
    expect(toCatalogSchema({})).toBeUndefined()
  })
})
