import { describe, expect, it } from 'vitest'

import { IntegrationOperationConflictError, isRowVersionConflict } from './errors'

describe('isRowVersionConflict', () => {
  it('matches only the complete stable CAS taxonomy', () => {
    expect(
      isRowVersionConflict(
        new IntegrationOperationConflictError('stale row', 'error-1', {
          errorCode: 'TABLE_ROW_VERSION_CONFLICT',
          retryable: false,
          recovery: 'reread_and_reapply',
        })
      )
    ).toBe(true)
  })

  it.each([
    { errorCode: 'TABLE_UNIQUE_KEY_CONFLICT', retryable: false, recovery: 'change_key' },
    { errorCode: 'TABLE_ROW_VERSION_CONFLICT', retryable: true, recovery: 'reread_and_reapply' },
    { errorCode: 'TABLE_ROW_VERSION_CONFLICT', retryable: false },
  ])('does not classify another 409 as CAS: %j', (metadata) => {
    expect(
      isRowVersionConflict(new IntegrationOperationConflictError('conflict', 'error-2', metadata))
    ).toBe(false)
  })
})
