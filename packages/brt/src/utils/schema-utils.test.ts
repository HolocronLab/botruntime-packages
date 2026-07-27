import { it, expect, describe } from 'vitest'
import * as sdk from '@holocronlab/botruntime-sdk'
import { dereferenceSchema, mapZodToJsonSchema } from './schema-utils'
import { JSONSchema7 } from 'json-schema'

describe('dereferenceSchema', () => {
  it('should do nothing if no $ref', async () => {
    const schema: JSONSchema7 = { type: 'object' }
    const result = await dereferenceSchema(schema)
    expect(result).toEqual(schema)
  })

  it('should dereference local $ref', async () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        foo: { $ref: '#/$defs/foo' },
        bar: { $ref: '#/definitions/bar' },
      },
      $defs: {
        foo: { type: 'string' },
      },
      definitions: {
        bar: { type: 'number' },
      },
    }
    const result = await dereferenceSchema(schema)
    expect(result).toEqual({
      type: 'object',
      properties: {
        foo: { type: 'string' },
        bar: { type: 'number' },
      },
      $defs: {
        foo: { type: 'string' },
      },
      definitions: {
        bar: { type: 'number' },
      },
    })
  })

  it('should ignore non-local $ref', async () => {
    const schema: JSONSchema7 = {
      type: 'object',
      properties: {
        foo: { $ref: 'TItem' },
      },
    }
    const result = await dereferenceSchema(schema)
    expect(result).toEqual(schema)
  })
})

describe('FileRef admission schema extension', () => {
  it.each([false, true])('lifts the SDK marker with legacy=%s', async (useLegacyZuiTransformer) => {
    const schema = await mapZodToJsonSchema({
      schema: sdk.z.object({
        attachments: sdk.z.array(sdk.z.object({
          fileRef: sdk.operationFileRef('resolve-current'),
        })).min(1).max(16),
      }),
    }, { useLegacyZuiTransformer })

    expect(schema).toMatchObject({
      properties: {
        attachments: {
          minItems: 1,
          maxItems: 16,
          items: {
            properties: {
              fileRef: {
                type: 'object',
                additionalProperties: false,
                'x-botruntime-fileRef': {
                  version: 'v1',
                  mode: 'resolve-current',
                },
              },
            },
          },
        },
      },
    })
    expect(JSON.stringify(schema)).not.toContain('botruntimeFileRef')
  })
})
