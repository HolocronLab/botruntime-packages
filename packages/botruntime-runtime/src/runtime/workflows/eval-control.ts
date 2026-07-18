import {
  DurableEvalEffectRetryError,
  type DurableEvalEffects,
  type EvalControl,
} from '@holocronlab/botruntime-evals'

type EvalControlErrorKind = 'configuration' | 'auth' | 'timeout' | 'upstream'

class PlatformEvalEffectError extends Error {
  readonly kind: EvalControlErrorKind

  constructor(message: string, kind: EvalControlErrorKind) {
    super(message)
    this.name = 'PlatformEvalEffectError'
    this.kind = kind
  }
}

class PlatformEvalEffectRetryError extends DurableEvalEffectRetryError {
  readonly kind: EvalControlErrorKind

  constructor(message: string, kind: EvalControlErrorKind, options?: ErrorOptions) {
    super(message, options)
    this.name = 'PlatformEvalEffectRetryError'
    this.kind = kind
  }
}

function evalControlHttpErrorKind(status: number): EvalControlErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 400 || status === 404 || status === 409 || status === 413 || status === 422) return 'configuration'
  return 'upstream'
}

type EvalControlCoordinates = {
  apiUrl: string
  token: string
  runtimeBotId: string
}

export class PlatformEvalEffects implements EvalControl, DurableEvalEffects {
  constructor(private readonly coordinates: EvalControlCoordinates) {}

  async advanceClock(input: { milliseconds: number; runDueWorkflows?: boolean }, effectId?: string) {
    const value = await this.request('/v1/evals/control', { operation: 'advance_clock', ...input }, effectId)
    if (
      typeof value.virtualNow !== 'string' ||
      !Number.isFinite(Date.parse(value.virtualNow)) ||
      typeof value.releasedJobs !== 'number' ||
      !Number.isInteger(value.releasedJobs) ||
      value.releasedJobs < 0
    ) {
      throw new PlatformEvalEffectRetryError('Eval control acknowledgement is malformed.', 'upstream')
    }
    return { virtualNow: value.virtualNow, releasedJobs: value.releasedJobs }
  }

  async configureFaults(faults: Parameters<EvalControl['configureFaults']>[0], effectId?: string): Promise<void> {
    await this.request('/v1/evals/control', { operation: 'configure_faults', faults }, effectId)
  }

  async clearFaults(effectId?: string): Promise<void> {
    await this.request('/v1/evals/control', { operation: 'clear_faults' }, effectId)
  }

  async createTableRows(input: Parameters<DurableEvalEffects['createTableRows']>[0]) {
    const value = await this.request(
      `/v1/tables/${encodeURIComponent(input.table)}/rows`,
      { rows: input.rows, waitComputed: true },
      input.effectId
    )
    if (
      !Array.isArray(value.rows) ||
      value.rows.length !== input.rows.length ||
      value.rows.some(
        (row) =>
          !row ||
          typeof row !== 'object' ||
          !Number.isInteger((row as { id?: unknown }).id) ||
          Number((row as { id: number }).id) <= 0
      ) ||
      (value.errors !== undefined &&
        (!Array.isArray(value.errors) || value.errors.some((error) => typeof error !== 'string')))
    ) {
      throw new PlatformEvalEffectRetryError('Durable table effect acknowledgement is malformed.', 'upstream')
    }
    return value as unknown as Awaited<ReturnType<DurableEvalEffects['createTableRows']>>
  }

  async createEvent(input: Parameters<DurableEvalEffects['createEvent']>[0]): Promise<void> {
    await this.request(
      '/v1/chat/events',
      {
        type: input.type,
        userId: input.userId,
        payload: input.payload,
        conversationId: input.conversationId,
      },
      input.effectId
    )
  }

  private async request(path: string, body: Record<string, unknown>, effectId?: string): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await fetch(`${this.coordinates.apiUrl.replace(/\/$/, '')}${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.coordinates.token}`,
          'content-type': 'application/json',
          'x-bot-id': this.coordinates.runtimeBotId,
          ...(effectId ? { 'idempotency-key': effectId } : {}),
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      const kind: EvalControlErrorKind =
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError') ? 'timeout' : 'upstream'
      throw new PlatformEvalEffectRetryError('Platform eval effect acknowledgement is unknown.', kind, { cause: error })
    }
    if (!response.ok) {
      if (response.status === 408 || response.status === 429 || response.status >= 500) {
        throw new PlatformEvalEffectRetryError(
          `Platform eval effect acknowledgement is unknown after HTTP ${response.status}.`,
          evalControlHttpErrorKind(response.status)
        )
      }
      throw new PlatformEvalEffectError(
        `Platform eval effect failed with HTTP ${response.status}.`,
        evalControlHttpErrorKind(response.status)
      )
    }
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new PlatformEvalEffectRetryError('Platform eval effect acknowledgement is malformed.', 'upstream')
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new PlatformEvalEffectRetryError('Platform eval effect acknowledgement is malformed.', 'upstream')
    }
    return value as Record<string, unknown>
  }
}
