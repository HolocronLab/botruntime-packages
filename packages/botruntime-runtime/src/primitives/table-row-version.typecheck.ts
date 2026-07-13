import type { TableRowMetadata, TableRowUpdateMetadata } from './table-row-metadata'

type Assert<T extends true> = T
type IsExactlyNumber<T> = [T] extends [number] ? ([number] extends [T] ? true : false) : false
type IsExactlyOptionalNumber<T> = [T] extends [number | undefined]
  ? [number | undefined] extends [T]
    ? true
    : false
  : false

export type RuntimeTableRowVersionContract = [
  Assert<IsExactlyNumber<TableRowMetadata['rowVersion']>>,
  Assert<IsExactlyOptionalNumber<TableRowUpdateMetadata['rowVersion']>>,
]
