import type { Response } from '../../serve'

export type DeliveryOutcome = 'failed' | 'outcome_unknown'
export type DeliveryPhase = 'protected_download' | 'provider_send' | 'ack'

/**
 * A delivery failure safe to expose to the runtime host.
 *
 * Use `failed` only before provider dispatch or after a definitive provider
 * rejection. Use `outcome_unknown` after dispatch when no ACK was observed;
 * callers MUST NOT automatically retry that outcome. `operation`, `code`, and
 * `message` must contain sanitized metadata and never provider credentials or
 * untrusted response bodies.
 */
type DeliveryOutcomeErrorProps = {
  outcome: DeliveryOutcome
  phase: DeliveryPhase
  operation: string
  code: string
  message: string
  cause?: unknown
}

export class DeliveryOutcomeError extends Error {
  public readonly __IS_DELIVERY_OUTCOME_ERROR__ = true as const
  public readonly outcome: DeliveryOutcome
  public readonly phase: DeliveryPhase
  public readonly operation: string
  public readonly code: string

  public constructor(props: DeliveryOutcomeErrorProps) {
    super(props.message, props.cause === undefined ? undefined : { cause: props.cause })
    this.name = 'DeliveryOutcomeError'
    this.outcome = props.outcome
    this.phase = props.phase
    this.operation = props.operation
    this.code = props.code
  }
}

export const isDeliveryOutcomeError = (value: unknown): value is DeliveryOutcomeError => {
  if (value instanceof DeliveryOutcomeError) return true
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return (
    candidate.__IS_DELIVERY_OUTCOME_ERROR__ === true &&
    (candidate.outcome === 'failed' || candidate.outcome === 'outcome_unknown') &&
    (candidate.phase === 'protected_download' || candidate.phase === 'provider_send' || candidate.phase === 'ack') &&
    typeof candidate.operation === 'string' &&
    typeof candidate.code === 'string' &&
    typeof candidate.message === 'string'
  )
}

export const deliveryOutcomeResponse = (error: DeliveryOutcomeError): Response => ({
  status: error.outcome === 'outcome_unknown' ? 504 : 422,
  headers: {
    'x-botruntime-delivery-status': error.outcome,
    'x-botruntime-delivery-phase': error.phase,
    'x-botruntime-delivery-operation': error.operation,
    'x-botruntime-delivery-code': error.code,
  },
  body: JSON.stringify({ code: error.code, message: error.message }),
})
