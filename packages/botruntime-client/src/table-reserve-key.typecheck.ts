import type { Client } from './public'
import type { ReserveTableKeyOutput } from './tables/reserve-key'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type IsExactly<T, Expected> = IsAny<T> extends true
  ? false
  : [T] extends [Expected]
    ? [Expected] extends [T]
      ? true
      : false
    : false

type Row = { commandId: string; payload?: string }
type Result = ReserveTableKeyOutput<Row>

declare const client: Client
const call = client.reserveTableKey<Row>({
  table: 'CommandTable',
  row: { commandId: 'cmd-1' },
  idempotencyKey: 'reserve-1',
})
type ClientResult = Awaited<typeof call>

export type ClientReserveKeyContract = [
  Assert<IsExactly<Result['created'], boolean>>,
  Assert<IsExactly<Result['row']['id'], number>>,
  Assert<IsExactly<Result['row']['rowVersion'], number>>,
  Assert<IsExactly<Result['row']['createdAt'], string>>,
  Assert<IsExactly<Result['row']['updatedAt'], string>>,
  Assert<IsExactly<Result['row']['commandId'], string>>,
  Assert<IsExactly<Result['row']['payload'], string | undefined>>,
  Assert<IsExactly<ClientResult, Result>>,
]
