import { describe, expect, test } from 'bun:test'

import { actions } from '../definitions/actions'
import { configuration } from '../definitions/configuration'
import definition from '../integration.definition'

describe('public catalog schema compatibility', () => {
  test('configuration converts to JSON Schema', () => {
    expect(() => configuration.schema.toJSONSchema()).not.toThrow()
  })

  for (const [name, action] of Object.entries(actions)) {
    test(`${name} input and output convert to JSON Schema`, () => {
      expect(() => action.input.schema.toJSONSchema()).not.toThrow()
      expect(() => action.output.schema.toJSONSchema()).not.toThrow()
    })
  }

  test('relative paths keep traversal and absolute-scheme guards', () => {
    const schema = actions.createCaseFolder.input.schema
    expect(schema.safeParse({ path: 'lead-1/case-2' }).success).toBe(true)
    expect(schema.safeParse({ path: 'app:/outside' }).success).toBe(false)
    expect(schema.safeParse({ path: '../outside' }).success).toBe(false)
    expect(schema.safeParse({ path: 'lead-1/ .. /outside' }).success).toBe(false)
  })

  test('v0.3.1 exposes only the native durable upload capability', () => {
    expect(definition.version).toBe('0.3.1')
    expect(definition.maxConcurrency).toBe(4)
    expect(actions.uploadDocument.attributes).toEqual({
      'botruntime.durableOperation': 'v1',
    })
    expect(actions.uploadDocument.input.schema.safeParse({
      path: 'lead-1/document.pdf',
      fileRef: {
        id: 'file-1',
        size: 3,
        contentType: 'application/pdf',
        filename: 'document.pdf',
        checksum: 'a'.repeat(64),
      },
    }).success).toBe(true)
    expect(actions.uploadDocument.input.schema.safeParse({
      path: 'lead-1/document.pdf',
      contentBase64: 'YQ==',
    }).success).toBe(false)
    expect('downloadDocument' in actions).toBe(false)
  })
})
