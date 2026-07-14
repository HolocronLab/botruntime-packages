import { describe, expect, test } from 'bun:test'

import { actions } from '../definitions/actions'
import { configuration } from '../definitions/configuration'
import { events } from '../definitions/events'

describe('public catalog schema compatibility', () => {
  test('configuration, actions and events convert to JSON Schema', () => {
    expect(() => configuration.schema.toJSONSchema()).not.toThrow()
    for (const action of Object.values(actions)) {
      expect(() => action.input.schema.toJSONSchema()).not.toThrow()
      expect(() => action.output.schema.toJSONSchema()).not.toThrow()
    }
    for (const event of Object.values(events)) {
      expect(() => event.schema.toJSONSchema()).not.toThrow()
    }
  })
})
