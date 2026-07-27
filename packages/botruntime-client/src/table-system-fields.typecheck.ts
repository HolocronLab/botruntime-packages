import type { FindTableRowsRequestBody } from './gen/public/operations/findTableRows'

const validFilter: FindTableRowsRequestBody = {
  filter: {
    id: { $gte: 1, $in: [1, Number.MAX_SAFE_INTEGER] },
    rowVersion: { $ne: 2 },
    createdAt: { $lt: '2026-07-26T00:00:00Z' },
    updatedAt: { $gte: '2026-07-26T00:00:00Z' },
    $or: [{ id: 1 }, { rowVersion: { $gt: 3 } }],
    userColumn: { $regex: '^kept-for-user-columns$' },
  },
  orderBy: 'rowVersion',
}
void validFilter

const invalidNumberOperator: FindTableRowsRequestBody = {
  filter: {
    // @ts-expect-error system fields reject operators outside the closed registry
    id: { $regex: '^1$' },
  },
}
void invalidNumberOperator

const invalidDateValue: FindTableRowsRequestBody = {
  filter: {
    // @ts-expect-error system date fields reject numeric values
    createdAt: { $gte: 123 },
  },
}
void invalidDateValue
