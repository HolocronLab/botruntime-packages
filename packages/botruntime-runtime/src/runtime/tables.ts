import {
  atomicReference,
  type AtomicReference,
  type AtomicTableOperation as WireAtomicTableOperation,
} from '@holocronlab/botruntime-client'

import type {
  TableFilter,
  TableRowMetadata,
  TableRowUpdateMetadata,
  TableSystemFields,
} from '../primitives/table'
import { client } from './client'

export type AtomicTableContract<
  TInput extends Record<string, unknown> = Record<string, unknown>,
  TOutput extends Record<string, unknown> = Record<string, unknown>,
> = {
  readonly name: string
  /** Type-only fields supplied by BaseTable; absent from runtime objects. */
  readonly __tableInput?: TInput
  readonly __tableOutput?: TOutput
}

type RuntimeTable = AtomicTableContract

type TableInput<TTable extends RuntimeTable> =
  TTable extends AtomicTableContract<infer TInput, Record<string, unknown>>
    ? TInput
    : never

type TableOutput<TTable extends RuntimeTable> =
  TTable extends AtomicTableContract<Record<string, unknown>, infer TOutput>
    ? TOutput
    : never

type AtomicResolvable<T> = T extends Date
  ? T | AtomicReference<T>
  : T extends readonly (infer TItem)[]
    ? readonly AtomicResolvable<TItem>[]
    : T extends Record<string, unknown>
      ? { [K in keyof T]: AtomicResolvable<T[K]> }
      : T | AtomicReference<T>

type AtomicRuntimeOperationBase<TOp extends string, TTable extends RuntimeTable> = {
  id?: string
  op: TOp
  table: TTable
}

export type AtomicReserveKeyOperation<TTable extends RuntimeTable = RuntimeTable> =
  AtomicRuntimeOperationBase<'reserveKey', TTable> & {
    row: AtomicResolvable<TableInput<TTable>>
  }

export type AtomicCreateRowsOperation<TTable extends RuntimeTable = RuntimeTable> =
  AtomicRuntimeOperationBase<'createRows', TTable> & {
    rows: readonly AtomicResolvable<TableInput<TTable>>[]
  }

export type AtomicUpdateRowsOperation<TTable extends RuntimeTable = RuntimeTable> =
  AtomicRuntimeOperationBase<'updateRows', TTable> & {
    rows: readonly (
      AtomicResolvable<Partial<TableInput<TTable>>> & {
        id: number | AtomicReference<number>
        rowVersion: number | AtomicReference<number>
      }
    )[]
  }

export type AtomicUpsertRowsOperation<TTable extends RuntimeTable = RuntimeTable> =
  AtomicRuntimeOperationBase<'upsertRows', TTable> & {
    rows: readonly (
      AtomicResolvable<Partial<TableInput<TTable>>> & {
        id?: number | AtomicReference<number>
        rowVersion?: number | AtomicReference<number>
      }
    )[]
    keyColumn?: keyof TableOutput<TTable>
  }

export type AtomicDeleteRowsOperation<TTable extends RuntimeTable = RuntimeTable> =
  AtomicRuntimeOperationBase<'deleteRows', TTable> &
    (
      | {
          ids: readonly (number | AtomicReference<number>)[]
          filter?: never
        }
      | {
          filter: TableFilter<TableInput<TTable> & TableSystemFields>
          ids?: never
        }
    )

export type AtomicTableOperation =
  | AtomicReserveKeyOperation
  | AtomicCreateRowsOperation
  | AtomicUpdateRowsOperation
  | AtomicUpsertRowsOperation
  | AtomicDeleteRowsOperation

type ValidateAtomicOperation<TOperation> =
  TOperation extends {
    op: 'reserveKey'
    table: infer TTable extends RuntimeTable
    row: infer TRow
  }
    ? TRow extends AtomicResolvable<TableInput<TTable>>
      ? TOperation
      : never
    : TOperation extends {
          op: 'createRows'
          table: infer TTable extends RuntimeTable
          rows: infer TRows
        }
      ? TRows extends readonly AtomicResolvable<TableInput<TTable>>[]
        ? TOperation
        : never
      : TOperation extends {
            op: 'updateRows'
            table: infer TTable extends RuntimeTable
            rows: infer TRows
          }
        ? TRows extends readonly (
            AtomicResolvable<Partial<TableInput<TTable>>> &
              AtomicResolvable<TableRowUpdateMetadata>
          )[]
          ? TOperation
          : never
        : TOperation extends {
              op: 'upsertRows'
              table: infer TTable extends RuntimeTable
              rows: infer TRows
            }
          ? TRows extends readonly (
              AtomicResolvable<Partial<TableInput<TTable>>> & {
                id?: number | AtomicReference<number>
                rowVersion?: number | AtomicReference<number>
              }
            )[]
            ? TOperation
            : never
          : TOperation extends AtomicDeleteRowsOperation
            ? TOperation
            : never

type RuntimeOperationIdentity<TOperation> =
  TOperation extends { id: infer TID extends string }
    ? { id: TID }
    : TOperation extends { id?: infer TID extends string }
      ? { id?: TID }
      : { id?: never }

type RuntimeOperationBase<TOperation extends AtomicTableOperation> = {
  operationIndex: number
  op: TOperation['op']
} & RuntimeOperationIdentity<TOperation>

type RuntimeRow<TTable extends RuntimeTable> = TableRowMetadata & TableOutput<TTable>

export type AtomicOperationResult<TOperation extends AtomicTableOperation> =
  TOperation extends AtomicReserveKeyOperation<infer TTable>
    ? RuntimeOperationBase<TOperation> & {
        row: RuntimeRow<TTable>
        created: boolean
      }
    : TOperation extends AtomicCreateRowsOperation<infer TTable>
      ? RuntimeOperationBase<TOperation> & { rows: RuntimeRow<TTable>[] }
      : TOperation extends AtomicUpdateRowsOperation<infer TTable>
        ? RuntimeOperationBase<TOperation> & { rows: RuntimeRow<TTable>[] }
        : TOperation extends AtomicUpsertRowsOperation<infer TTable>
          ? RuntimeOperationBase<TOperation> & {
              inserted: RuntimeRow<TTable>[]
              updated: RuntimeRow<TTable>[]
            }
          : TOperation extends AtomicDeleteRowsOperation
            ? RuntimeOperationBase<TOperation> & { deletedRows: number }
            : never

export type AtomicTablesResult<TOperations extends readonly AtomicTableOperation[]> = {
  results: { [K in keyof TOperations]: AtomicOperationResult<TOperations[K]> }
}

async function atomic<const TOperations extends readonly AtomicTableOperation[]>(
  input: {
    idempotencyKey: string
    operations: TOperations & {
      [K in keyof TOperations]: ValidateAtomicOperation<TOperations[K]>
    }
  }
): Promise<AtomicTablesResult<TOperations>> {
  const operations = input.operations.map((operation) => ({
    ...operation,
    table: operation.table.name,
  })) as unknown as readonly WireAtomicTableOperation[]

  return await client.atomicTables({
    idempotencyKey: input.idempotencyKey,
    operations,
  }) as unknown as AtomicTablesResult<TOperations>
}

export const tables = {
  atomic,
  reference: atomicReference,
} as const
