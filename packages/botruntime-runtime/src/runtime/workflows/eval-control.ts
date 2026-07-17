import type { EvalControl } from '@holocronlab/botruntime-evals'

type EvalControlErrorKind = 'configuration' | 'auth' | 'timeout' | 'upstream'

class PlatformEvalControlError extends Error {
  readonly kind: EvalControlErrorKind

  constructor(message: string, kind: EvalControlErrorKind) {
    super(message)
    this.name = 'PlatformEvalControlError'
    this.kind = kind
  }
}

function evalControlHttpErrorKind(status: number): EvalControlErrorKind {
  if (status === 401 || status === 403) return 'auth'
  if (status === 408 || status === 504) return 'timeout'
  if (status === 400 || status === 404 || status === 413 || status === 422) return 'configuration'
  return 'upstream'
}

type EvalControlCoordinates = {
  apiUrl: string
  token: string
  runtimeBotId: string
}

export class PlatformEvalControl implements EvalControl {
  constructor(private readonly coordinates: EvalControlCoordinates) {}

  async advanceClock(input: { milliseconds: number; runDueWorkflows?: boolean }) {
    const value = await this.request({ operation: 'advance_clock', ...input })
    if (
      typeof value.virtualNow !== 'string' ||
      !Number.isFinite(Date.parse(value.virtualNow)) ||
      typeof value.releasedJobs !== 'number' ||
      !Number.isInteger(value.releasedJobs) ||
      value.releasedJobs < 0
    ) {
      throw new Error('Eval control advance_clock response is malformed.')
    }
    return { virtualNow: value.virtualNow, releasedJobs: value.releasedJobs }
  }

  async configureFaults(faults: Parameters<EvalControl['configureFaults']>[0]): Promise<void> {
    await this.request({ operation: 'configure_faults', faults })
  }

  async clearFaults(): Promise<void> {
    await this.request({ operation: 'clear_faults' })
  }

  private async request(body: Record<string, unknown>): Promise<Record<string, unknown>> {
    let response: Response
    try {
      response = await fetch(`${this.coordinates.apiUrl.replace(/\/$/, '')}/v1/evals/control`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.coordinates.token}`,
          'content-type': 'application/json',
          'x-bot-id': this.coordinates.runtimeBotId,
        },
        body: JSON.stringify(body),
      })
    } catch (error) {
      const kind: EvalControlErrorKind =
        error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError') ? 'timeout' : 'upstream'
      throw new PlatformEvalControlError('Eval control request failed.', kind)
    }
    if (!response.ok) {
      throw new PlatformEvalControlError(
        `Eval control failed with HTTP ${response.status}.`,
        evalControlHttpErrorKind(response.status)
      )
    }
    let value: unknown
    try {
      value = await response.json()
    } catch {
      throw new PlatformEvalControlError('Eval control response is malformed.', 'upstream')
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new PlatformEvalControlError('Eval control response is malformed.', 'upstream')
    }
    return value as Record<string, unknown>
  }
}
