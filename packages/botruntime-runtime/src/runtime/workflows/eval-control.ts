import type { EvalControl } from '@holocronlab/botruntime-evals'

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
    const response = await fetch(`${this.coordinates.apiUrl.replace(/\/$/, '')}/v1/evals/control`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.coordinates.token}`,
        'content-type': 'application/json',
        'x-bot-id': this.coordinates.runtimeBotId,
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`Eval control failed with HTTP ${response.status}.`)
    const value = (await response.json()) as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Eval control response is malformed.')
    }
    return value as Record<string, unknown>
  }
}
