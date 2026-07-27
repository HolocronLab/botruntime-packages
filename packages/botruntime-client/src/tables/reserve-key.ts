import type { AxiosInstance } from 'axios'
import { toApiError } from '../common/errors'

export type TableRowMetadata = {
  id: number
  rowVersion: number
  createdAt: string
  updatedAt: string
}

export type ReserveTableKeyInput<TRow extends Record<string, unknown> = Record<string, unknown>> = {
  table: string
  row: TRow
  idempotencyKey: string
}

export type ReserveTableKeyOutput<TRow extends Record<string, unknown> = Record<string, unknown>> = {
  row: TRow & TableRowMetadata
  created: boolean
}

export const reserveTableKey = async <TRow extends Record<string, unknown>>(
  axiosInstance: AxiosInstance,
  input: ReserveTableKeyInput<TRow>,
): Promise<ReserveTableKeyOutput<TRow>> => {
  const response = await axiosInstance
    .request<ReserveTableKeyOutput<TRow>>({
      method: 'post',
      url: `/v1/tables/${encodeURIComponent(input.table)}/rows/reserve`,
      headers: {
        'Idempotency-Key': input.idempotencyKey,
      },
      data: {
        row: input.row,
      },
    })
    .catch((error: unknown) => {
      throw toApiError(error)
    })
  return response.data
}
