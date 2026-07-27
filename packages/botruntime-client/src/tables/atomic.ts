import type { AxiosInstance } from 'axios'
import { toApiError } from '../common/errors'
import type { TableRowMetadata } from './reserve-key'

export type AtomicReference<T> = {
  $ref: {
    operation: string
    path: string
  }
  /** Type-only marker; never sent over the wire. */
  readonly __valueType?: T
}

export const atomicReference = <T>(operation: string, path: string): AtomicReference<T> => ({
  $ref: { operation, path },
})

type AtomicResolvable<T> = T extends AtomicReference<infer TValue>
  ? AtomicReference<TValue>
  : T extends readonly (infer TItem)[]
    ? readonly AtomicResolvable<TItem>[]
    : T extends Record<string, unknown>
      ? { [K in keyof T]: AtomicResolvable<T[K]> }
      : T | AtomicReference<T>

type AtomicResolved<T> = T extends AtomicReference<infer TValue>
  ? TValue
  : T extends readonly (infer TItem)[]
    ? AtomicResolved<TItem>[]
    : T extends Record<string, unknown>
      ? { [K in keyof T]: AtomicResolved<T[K]> }
      : T

type AtomicOperationBase<TOp extends string> = {
  id?: string
  op: TOp
  table: string
}

export type AtomicReserveKeyOperation<
  TRow extends Record<string, unknown> = Record<string, unknown>,
> = AtomicOperationBase<'reserveKey'> & {
  row: AtomicResolvable<TRow>
}

export type AtomicCreateRowsOperation<
  TRow extends Record<string, unknown> = Record<string, unknown>,
> = AtomicOperationBase<'createRows'> & {
  rows: readonly AtomicResolvable<TRow>[]
}

export type AtomicUpdateRowsOperation<
  TRow extends Record<string, unknown> = Record<string, unknown>,
> = AtomicOperationBase<'updateRows'> & {
  rows: readonly AtomicResolvable<TRow>[]
}

export type AtomicUpsertRowsOperation<
  TRow extends Record<string, unknown> = Record<string, unknown>,
> = AtomicOperationBase<'upsertRows'> & {
  rows: readonly AtomicResolvable<TRow>[]
  keyColumn?: string
}

export type AtomicDeleteRowsOperation = AtomicOperationBase<'deleteRows'> &
  (
    | { ids: readonly (number | AtomicReference<number>)[]; filter?: never }
    | { filter: Readonly<Record<string, unknown>>; ids?: never }
  )

export type AtomicTableOperation =
  | AtomicReserveKeyOperation
  | AtomicCreateRowsOperation
  | AtomicUpdateRowsOperation
  | AtomicUpsertRowsOperation
  | AtomicDeleteRowsOperation

type OperationIdentity<TOperation> = TOperation extends { id: infer TID extends string }
  ? { id: TID }
  : TOperation extends { id?: infer TID extends string }
    ? { id?: TID }
    : { id?: never }

type OperationResultBase<TOperation extends AtomicTableOperation> = {
  operationIndex: number
  op: TOperation['op']
} & OperationIdentity<TOperation>

type RowResult<TRow> = AtomicResolved<TRow> & TableRowMetadata

export type AtomicOperationResult<TOperation extends AtomicTableOperation> =
  TOperation extends AtomicReserveKeyOperation<infer TRow>
    ? OperationResultBase<TOperation> & {
        row: RowResult<TRow>
        created: boolean
      }
    : TOperation extends AtomicCreateRowsOperation<infer TRow>
      ? OperationResultBase<TOperation> & { rows: RowResult<TRow>[] }
      : TOperation extends AtomicUpdateRowsOperation<infer TRow>
        ? OperationResultBase<TOperation> & { rows: RowResult<TRow>[] }
        : TOperation extends AtomicUpsertRowsOperation<infer TRow>
          ? OperationResultBase<TOperation> & {
              inserted: RowResult<TRow>[]
              updated: RowResult<TRow>[]
            }
          : TOperation extends AtomicDeleteRowsOperation
            ? OperationResultBase<TOperation> & { deletedRows: number }
            : never

export type AtomicTablesInput<
  TOperations extends readonly AtomicTableOperation[] = readonly AtomicTableOperation[],
> = {
  idempotencyKey: string
  operations: TOperations
}

export type AtomicTablesOutput<
  TOperations extends readonly AtomicTableOperation[] = readonly AtomicTableOperation[],
> = {
  results: { [K in keyof TOperations]: AtomicOperationResult<TOperations[K]> }
}

export const atomicTables = async <
  const TOperations extends readonly AtomicTableOperation[],
>(
  axiosInstance: AxiosInstance,
  input: AtomicTablesInput<TOperations>
): Promise<AtomicTablesOutput<TOperations>> => {
  const response = await axiosInstance
    .request<AtomicTablesOutput<TOperations>>({
      method: 'post',
      url: '/v1/tables/atomic',
      headers: {
        'Idempotency-Key': input.idempotencyKey,
      },
      data: {
        operations: input.operations,
      },
    })
    .catch((error: unknown) => {
      throw toApiError(error)
    })
  return response.data
}
