import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios'
import * as common from '../common'
import { IntegrationOperationConflictError } from '../errors'

export type IntegrationOperationStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancel_requested'
  | 'cancelled'
  | 'outcome_unknown'
  | 'abandoned'

export type IntegrationOperation = {
  operationId: string
  status: IntegrationOperationStatus
  actionType: string
  attempt: number
  progress: number
  progressMessage?: string
  deadline: string
  result?: Record<string, unknown>
  error?: {
    code: string
    message: string
  }
  createdAt: string
  updatedAt: string
  startedAt?: string
  finishedAt?: string
}

export type StartIntegrationOperationInput = {
  idempotencyKey: string
  type: string
  input: Record<string, unknown>
  timeoutSeconds?: number
}

export type GetIntegrationOperationInput = {
  operationId: string
}

export type CancelIntegrationOperationInput = {
  operationId: string
}

const request = async (
  transport: AxiosInstance,
  config: AxiosRequestConfig
): Promise<IntegrationOperation> => {
  try {
    return await transport.request<IntegrationOperation>(config).then((response) => response.data)
  } catch (error) {
    const conflict = integrationOperationConflictFrom(error)
    if (conflict) {
      throw conflict
    }
    throw common.errors.toApiError(error)
  }
}

const errorCause = (error: unknown): Error | undefined => {
  if (error instanceof Error) {
    return error
  }
  if (
    typeof error === 'object'
    && error !== null
    && 'cause' in error
    && error.cause instanceof Error
  ) {
    return error.cause
  }
  return undefined
}

const integrationOperationConflictFrom = (error: unknown): IntegrationOperationConflictError | undefined => {
  if (!axios.isAxiosError(error) || error.response?.status !== 409) {
    return undefined
  }
  const envelope: unknown = error.response.data
  if (
    typeof envelope !== 'object'
    || envelope === null
    || !('code' in envelope)
    || envelope.code !== 409
    || !('type' in envelope)
    || envelope.type !== 'Conflict'
    || !('id' in envelope)
    || typeof envelope.id !== 'string'
    || !('message' in envelope)
    || typeof envelope.message !== 'string'
  ) {
    return undefined
  }
  const metadata =
    'metadata' in envelope
    && typeof envelope.metadata === 'object'
    && envelope.metadata !== null
    && !Array.isArray(envelope.metadata)
      ? envelope.metadata as Record<string, unknown>
      : undefined
  return new IntegrationOperationConflictError(envelope.message, envelope.id, metadata, errorCause(error))
}

export const start = async (
  transport: AxiosInstance,
  { idempotencyKey, type, input, timeoutSeconds }: StartIntegrationOperationInput
): Promise<IntegrationOperation> =>
  request(transport, {
    method: 'POST',
    url: '/v1/chat/integration-operations',
    headers: {
      'Idempotency-Key': idempotencyKey,
    },
    data: {
      type,
      input,
      ...(timeoutSeconds === undefined ? {} : { timeoutSeconds }),
    },
  })

export const get = async (
  transport: AxiosInstance,
  { operationId }: GetIntegrationOperationInput
): Promise<IntegrationOperation> =>
  request(transport, {
    method: 'GET',
    url: `/v1/chat/integration-operations/${encodeURIComponent(operationId)}`,
  })

export const cancel = async (
  transport: AxiosInstance,
  { operationId }: CancelIntegrationOperationInput
): Promise<IntegrationOperation> =>
  request(transport, {
    method: 'POST',
    url: `/v1/chat/integration-operations/${encodeURIComponent(operationId)}/cancel`,
  })
