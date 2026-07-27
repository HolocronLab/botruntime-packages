import type { ReserveKeyResult } from './table'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type IsExactly<T, Expected> = IsAny<T> extends true
  ? false
  : [T] extends [Expected]
    ? [Expected] extends [T]
      ? true
      : false
    : false

type Result = ReserveKeyResult<{ commandId: string; payload?: string }>

export type RuntimeReserveKeyContract = [
  Assert<IsExactly<Result['created'], boolean>>,
  Assert<IsExactly<Result['row']['id'], number>>,
  Assert<IsExactly<Result['row']['rowVersion'], number>>,
  Assert<IsExactly<Result['row']['createdAt'], string>>,
  Assert<IsExactly<Result['row']['updatedAt'], string>>,
  Assert<IsExactly<Result['row']['commandId'], string>>,
  Assert<IsExactly<Result['row']['payload'], string | undefined>>,
]
