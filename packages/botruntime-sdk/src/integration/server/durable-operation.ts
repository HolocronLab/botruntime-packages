import { integrationOperations } from '@holocronlab/botruntime-client'
import { InvalidPayloadError } from '@holocronlab/botruntime-client'
import type { Request, Response } from '../../serve'
import type {
  DurableOperationHandler,
  DurableOperationOutcome,
  DurableOperationPhase,
  CommonHandlerProps,
} from './types'
import type { BaseIntegration } from '../common'

const MAX_ENVELOPE_BYTES = 1024 * 1024
const MAX_TEXT_BYTES = 1024
const MAX_INPUT_BYTES = 768 * 1024
const PHASES = new Set<DurableOperationPhase>(['execute', 'reconcile', 'cancel'])
// This is the sanitized application envelope. Deliberately keep
// operationCapability and leaseGeneration out: the isolated process transport
// consumes them before application code runs.
const TOP_LEVEL_KEYS = new Set([
  'protocolVersion',
  'operationId',
  'phase',
  'attempt',
  'action',
  'idempotencyKey',
  'input',
  'deadline',
  'cancelRequestedAt',
  'capabilities',
  'checkpoint',
])

type SanitizedDurableEnvelope = {
  protocolVersion: '1'
  operationId: string
  phase: DurableOperationPhase
  attempt: number
  action: string
  idempotencyKey: string
  input: Record<string, unknown>
  deadline: string
  cancelRequestedAt: string | null
  capabilities: {
    files?: '1'
    checkpoint?: '1'
  }
  checkpoint?: integrationOperations.OperationCheckpointSnapshot
}

const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const boundedString = (value: unknown, max = MAX_TEXT_BYTES): value is string =>
  typeof value === 'string' && utf8Bytes(value) >= 1 && utf8Bytes(value) <= max

const invalid = (): never => {
  throw new InvalidPayloadError('Invalid durable operation envelope')
}

const parseCapabilities = (value: unknown): SanitizedDurableEnvelope['capabilities'] => {
  if (value === undefined) return Object.freeze({})
  if (!isRecord(value)) return invalid()
  const keys = Object.keys(value)
  if (keys.some((key) => key !== 'files' && key !== 'checkpoint')) return invalid()
  if (value.files !== undefined && value.files !== '1') return invalid()
  if (value.checkpoint !== undefined && value.checkpoint !== '1') return invalid()
  return Object.freeze({
    ...(value.files === '1' ? { files: '1' as const } : {}),
    ...(value.checkpoint === '1' ? { checkpoint: '1' as const } : {}),
  })
}

const parseEnvelope = (req: Request): SanitizedDurableEnvelope => {
  if (
    typeof req.body !== 'string'
    || utf8Bytes(req.body) > MAX_ENVELOPE_BYTES
  ) {
    return invalid()
  }
  let value: unknown
  try {
    value = JSON.parse(req.body)
  } catch {
    return invalid()
  }
  if (!isRecord(value) || Object.keys(value).some((key) => !TOP_LEVEL_KEYS.has(key))) return invalid()
  if (
    value.protocolVersion !== '1'
    || !boundedString(value.operationId)
    || !PHASES.has(value.phase as DurableOperationPhase)
    || req.headers['x-bp-type'] !== value.phase
    || !Number.isSafeInteger(value.attempt)
    || Number(value.attempt) < 1
    || !boundedString(value.action)
    || !boundedString(value.idempotencyKey, 4096)
    || !isRecord(value.input)
    || utf8Bytes(JSON.stringify(value.input)) > MAX_INPUT_BYTES
    || !boundedString(value.deadline)
    || !Number.isFinite(Date.parse(value.deadline))
    || (
      value.cancelRequestedAt !== null
      && (
        !boundedString(value.cancelRequestedAt)
        || !Number.isFinite(Date.parse(value.cancelRequestedAt))
      )
    )
  ) {
    return invalid()
  }

  const capabilities = parseCapabilities(value.capabilities)
  if (
    (capabilities.checkpoint === '1' && value.checkpoint === undefined)
    || (capabilities.checkpoint !== '1' && value.checkpoint !== undefined)
  ) {
    return invalid()
  }
  let checkpoint: integrationOperations.OperationCheckpointSnapshot | undefined
  if (value.checkpoint !== undefined) {
    try {
      checkpoint = integrationOperations.validateOperationCheckpointSnapshot(value.checkpoint)
    } catch {
      return invalid()
    }
  }

  return {
    protocolVersion: '1',
    operationId: value.operationId,
    phase: value.phase as DurableOperationPhase,
    attempt: Number(value.attempt),
    action: value.action,
    idempotencyKey: value.idempotencyKey,
    input: value.input,
    deadline: value.deadline,
    cancelRequestedAt: value.cancelRequestedAt as string | null,
    capabilities,
    ...(checkpoint ? { checkpoint } : {}),
  }
}

const validOutcome = (value: unknown): value is DurableOperationOutcome => {
  if (!isRecord(value) || typeof value.kind !== 'string') return false
  if (value.kind === 'cancelled' || value.kind === 'retry_safe') {
    return Object.keys(value).length === 1
  }
  if (value.kind === 'succeeded') {
    return Object.keys(value).length === 2 && isRecord(value.result)
  }
  if (
    value.kind === 'failed'
    || value.kind === 'still_unknown'
    || value.kind === 'outcome_unknown'
  ) {
    return (
      Object.keys(value).length === 3
      && boundedString(value.errorCode)
      && boundedString(value.errorMessage, 4096)
    )
  }
  return false
}

export const invokeDurableOperationHandler = async (
  common: CommonHandlerProps<BaseIntegration>,
  req: Request,
  handler: DurableOperationHandler<BaseIntegration>
): Promise<Response> => {
  const envelope = parseEnvelope(req)
  const transport = common.client._inner.config
  const files = envelope.capabilities.files === '1'
    ? integrationOperations.createOperationFilesClient({
        config: transport,
        operationId: envelope.operationId,
      })
    : undefined
  const checkpoint = envelope.checkpoint
    ? integrationOperations.createOperationCheckpointClient({
        config: transport,
        operationId: envelope.operationId,
        snapshot: envelope.checkpoint,
      })
    : undefined

  const outcome = await handler({
    ...common,
    phase: envelope.phase,
    operationId: envelope.operationId,
    attempt: envelope.attempt,
    action: envelope.action,
    idempotencyKey: envelope.idempotencyKey,
    input: envelope.input,
    deadline: envelope.deadline,
    cancelRequestedAt: envelope.cancelRequestedAt,
    ...(files ? { files } : {}),
    ...(checkpoint ? { checkpoint } : {}),
  })
  if (!validOutcome(outcome)) throw new InvalidPayloadError('Invalid durable operation outcome')
  return {
    status: 200,
    body: JSON.stringify(outcome),
  }
}
