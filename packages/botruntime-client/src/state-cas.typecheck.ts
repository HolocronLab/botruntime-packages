import type {
  GetOrSetStateResponse as PublicGetOrSetStateResponse,
} from './gen/public/operations/getOrSetState'
import type { GetStateResponse as PublicGetStateResponse } from './gen/public/operations/getState'
import type {
  PatchStateRequestBody as PublicPatchStateRequestBody,
  PatchStateResponse as PublicPatchStateResponse,
} from './gen/public/operations/patchState'
import type {
  SetStateRequestBody as PublicSetStateRequestBody,
  SetStateResponse as PublicSetStateResponse,
} from './gen/public/operations/setState'
import type {
  SetStateExpiryResponse as PublicSetStateExpiryResponse,
} from './gen/public/operations/setStateExpiry'
import type {
  GetOrSetStateResponse as RuntimeGetOrSetStateResponse,
} from './gen/runtime/operations/getOrSetState'
import type { GetStateResponse as RuntimeGetStateResponse } from './gen/runtime/operations/getState'
import type {
  PatchStateRequestBody as RuntimePatchStateRequestBody,
  PatchStateResponse as RuntimePatchStateResponse,
} from './gen/runtime/operations/patchState'
import type {
  SetStateRequestBody as RuntimeSetStateRequestBody,
  SetStateResponse as RuntimeSetStateResponse,
} from './gen/runtime/operations/setState'
import type {
  SetStateExpiryResponse as RuntimeSetStateExpiryResponse,
} from './gen/runtime/operations/setStateExpiry'

type Assert<T extends true> = T
type IsAny<T> = 0 extends 1 & T ? true : false
type IsExactlyOptionalNumber<T> = IsAny<T> extends true
  ? false
  : [T] extends [number | undefined]
    ? [number | undefined] extends [T]
      ? true
      : false
    : false

export type ClientStateCasContract = [
  Assert<IsExactlyOptionalNumber<PublicGetStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<PublicGetOrSetStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<PublicSetStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<PublicPatchStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<PublicSetStateExpiryResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<RuntimeGetStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<RuntimeGetOrSetStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<RuntimeSetStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<RuntimePatchStateResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<RuntimeSetStateExpiryResponse['state']['version']>>,
  Assert<IsExactlyOptionalNumber<PublicSetStateRequestBody['expectedVersion']>>,
  Assert<IsExactlyOptionalNumber<PublicPatchStateRequestBody['expectedVersion']>>,
  Assert<IsExactlyOptionalNumber<RuntimeSetStateRequestBody['expectedVersion']>>,
  Assert<IsExactlyOptionalNumber<RuntimePatchStateRequestBody['expectedVersion']>>,
]
