import type { AxiosInstance } from 'axios'
import { toApiError } from '../common/errors'

export type TableUniqueKeyState =
  | 'disabled'
  | 'enabling'
  | 'enabled'
  | 'disabling'
  | 'error'

export type TableUniqueKeyContract = {
  name: string
  keyColumn?: string | null
  keyColumnUnique?: boolean
  keyColumnUniqueState?: TableUniqueKeyState
  keyColumnUniqueOperationId?: string | null
  keyColumnUniqueAttempts?: number
  keyColumnUniqueLastErrorCode?: string | null
  uniqueGeneration?: number
  schemaGeneration?: number
}

export type TransitionTableUniqueKeyInput = {
  table: string
  enabled: boolean
}

export type TransitionTableUniqueKeyOutput<
  TTable extends TableUniqueKeyContract = TableUniqueKeyContract,
> = {
  table: TTable
}

export const transitionTableUniqueKey = async <
  TTable extends TableUniqueKeyContract = TableUniqueKeyContract,
>(
  axiosInstance: AxiosInstance,
  input: TransitionTableUniqueKeyInput
): Promise<TransitionTableUniqueKeyOutput<TTable>> => {
  const response = await axiosInstance
    .request<TransitionTableUniqueKeyOutput<TTable>>({
      method: 'put',
      url: `/v1/tables/${encodeURIComponent(input.table)}/unique-key`,
      data: {
        enabled: input.enabled,
      },
    })
    .catch((error: unknown) => {
      throw toApiError(error)
    })
  return response.data
}
