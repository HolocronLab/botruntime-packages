import { describe, expect, it } from 'vitest'

import { findTableColumnViolations } from './table-validation.js'

function tableWithColumns(columnCount: number) {
  return {
    path: 'src/tables/wide.ts',
    definition: {
      name: 'WideTable',
      schema: {
        properties: Object.fromEntries(
          Array.from({ length: columnCount }, (_, index) => [
            `column_${index}`,
            { type: 'string' },
          ])
        ),
      },
    },
  }
}

describe('table column-count contract', () => {
  it('accepts 64 user columns', () => {
    expect(findTableColumnViolations([tableWithColumns(64)])).toEqual([])
  })

  it('rejects 65 user columns', () => {
    expect(findTableColumnViolations([tableWithColumns(65)])).toEqual([
      expect.objectContaining({
        name: 'WideTable',
        columnCount: 65,
      }),
    ])
  })
})
