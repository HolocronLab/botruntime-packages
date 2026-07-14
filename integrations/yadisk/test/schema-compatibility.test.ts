import { describe, expect, test } from 'bun:test'

import { actions } from '../definitions/actions'
import { configuration } from '../definitions/configuration'

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
})
