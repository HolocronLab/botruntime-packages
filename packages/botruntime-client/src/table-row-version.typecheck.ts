import type { CreateTableRowsResponse } from './gen/public/operations/createTableRows'
import type { FindTableRowsResponse } from './gen/public/operations/findTableRows'
import type { GetTableRowResponse } from './gen/public/operations/getTableRow'
import type {
  UpdateTableRowsRequestBody,
  UpdateTableRowsResponse,
} from './gen/public/operations/updateTableRows'
import type { UpsertTableRowsResponse } from './gen/public/operations/upsertTableRows'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type IsExactlyNumber<T> = IsAny<T> extends true
  ? false
  : [T] extends [number]
    ? [number] extends [T]
      ? true
      : false
    : false
type IsExactlyOptionalNumber<T> = IsAny<T> extends true
  ? false
  : [T] extends [number | undefined]
    ? [number | undefined] extends [T]
      ? true
      : false
    : false

type GetRow = GetTableRowResponse['row']
type FindRow = FindTableRowsResponse['rows'][number]
type CreateRow = CreateTableRowsResponse['rows'][number]
type UpdateRow = UpdateTableRowsResponse['rows'][number]
type UpsertInsertedRow = UpsertTableRowsResponse['inserted'][number]
type UpsertUpdatedRow = UpsertTableRowsResponse['updated'][number]
type UpdateInputRow = UpdateTableRowsRequestBody['rows'][number]

export type ClientTableRowVersionContract = [
  Assert<IsExactlyNumber<GetRow['rowVersion']>>,
  Assert<IsExactlyNumber<FindRow['rowVersion']>>,
  Assert<IsExactlyNumber<CreateRow['rowVersion']>>,
  Assert<IsExactlyNumber<UpdateRow['rowVersion']>>,
  Assert<IsExactlyNumber<UpsertInsertedRow['rowVersion']>>,
  Assert<IsExactlyNumber<UpsertUpdatedRow['rowVersion']>>,
  Assert<IsExactlyOptionalNumber<UpdateInputRow['rowVersion']>>,
]
