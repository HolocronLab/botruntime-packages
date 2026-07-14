import { describe, expect, it } from 'vitest'
import { normalizeCreation } from './creation-normalization'

describe('normalizeCreation', () => {
  it('normalizes catalog null requiredTags to the SDK array contract', () => {
    expect(normalizeCreation({ enabled: false, requiredTags: null })).toEqual({
      enabled: false,
      requiredTags: [],
    })
  })

  it('preserves valid required tags', () => {
    expect(normalizeCreation({ enabled: true, requiredTags: ['chat_id'] })).toEqual({
      enabled: true,
      requiredTags: ['chat_id'],
    })
  })
})
