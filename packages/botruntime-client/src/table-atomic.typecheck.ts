import type { Client } from './public'
import { atomicReference } from './tables/atomic'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type IsExactly<T, Expected> = IsAny<T> extends true
  ? false
  : [T] extends [Expected]
    ? [Expected] extends [T]
      ? true
      : false
    : false

declare const client: Client
const call = client.atomicTables({
  idempotencyKey: 'batch-1',
  operations: [
    {
      id: 'reservation',
      op: 'reserveKey',
      table: 'CommandTable',
      row: { commandId: 'cmd-1', payload: 'winner' },
    },
    {
      op: 'createRows',
      table: 'AuditTable',
      rows: [{ reservationId: atomicReference<number>('reservation', '/row/id') }],
    },
  ],
})
type Result = Awaited<typeof call>

export type ClientAtomicContract = [
  Assert<IsExactly<Result['results'][0]['created'], boolean>>,
  Assert<IsExactly<Result['results'][0]['row']['commandId'], 'cmd-1'>>,
  Assert<IsExactly<Result['results'][0]['row']['id'], number>>,
  Assert<IsExactly<Result['results'][1]['rows'][number]['reservationId'], number>>,
]
