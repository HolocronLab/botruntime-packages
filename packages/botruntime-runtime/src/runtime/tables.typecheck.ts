import { tables, type AtomicTableContract } from './tables'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type IsExactly<T, Expected> = IsAny<T> extends true
  ? false
  : [T] extends [Expected]
    ? [Expected] extends [T]
      ? true
      : false
    : false

declare const CommandTable: AtomicTableContract<
  { commandId: string; payload?: string },
  { commandId: string; payload?: string }
>
declare const AuditTable: AtomicTableContract<
  { reservationId: number; note: string },
  { reservationId: number; note: string }
>

const call = tables.atomic({
  idempotencyKey: 'batch-1',
  operations: [
    {
      id: 'reservation',
      op: 'reserveKey',
      table: CommandTable,
      row: { commandId: 'cmd-1' },
    },
    {
      op: 'createRows',
      table: AuditTable,
      rows: [{
        reservationId: tables.reference<number>('reservation', '/row/id'),
        note: 'created',
      }],
    },
  ],
})
type Result = Awaited<typeof call>

export type RuntimeAtomicContract = [
  Assert<IsExactly<Result['results'][0]['created'], boolean>>,
  Assert<IsExactly<Result['results'][0]['row']['commandId'], string>>,
  Assert<IsExactly<Result['results'][0]['row']['payload'], string | undefined>>,
  Assert<IsExactly<Result['results'][1]['rows'][number]['reservationId'], number>>,
]

void tables.atomic({
  idempotencyKey: 'batch-invalid',
  // @ts-expect-error reservation rows require commandId
  operations: [{ op: 'reserveKey', table: CommandTable, row: { payload: 'missing' } }],
})
