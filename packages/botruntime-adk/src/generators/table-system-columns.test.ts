import { describe, expect, it } from 'vitest'
import { TABLE_OUTPUT_SYSTEM_COLUMNS } from './table-system-columns'

describe('generated table system columns', () => {
  it('publishes the optimistic-CAS rowVersion as output metadata', () => {
    expect(TABLE_OUTPUT_SYSTEM_COLUMNS).toContain('rowVersion: number')
  })
})
