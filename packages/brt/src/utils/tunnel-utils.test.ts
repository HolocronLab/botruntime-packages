import { describe, expect, it, vi } from 'vitest'
import { connectWithBackoff } from './tunnel-utils'

describe('connectWithBackoff', () => {
  it('keeps retrying transient reconnect failures until the tunnel recovers', async () => {
    const connect = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('expected 101'))
      .mockRejectedValueOnce(new Error('expected 101'))
      .mockResolvedValue('connected')
    const sleep = vi.fn<(delay: number) => Promise<void>>(async () => {})
    let now = 0

    await expect(
      connectWithBackoff(connect, {
        timeoutMs: 10_000,
        initialDelayMs: 250,
        maxDelayMs: 1_000,
        sleep: async (delay) => {
          now += delay
          await sleep(delay)
        },
        now: () => now,
      })
    ).resolves.toBe('connected')

    expect(connect).toHaveBeenCalledTimes(3)
    expect(sleep.mock.calls).toEqual([[250], [500]])
  })

  it('fails loudly after the reconnect budget is exhausted', async () => {
    const connect = vi.fn<() => Promise<string>>().mockRejectedValue(new Error('still unavailable'))
    let now = 0

    await expect(
      connectWithBackoff(connect, {
        timeoutMs: 700,
        initialDelayMs: 250,
        maxDelayMs: 1_000,
        sleep: async (delay) => {
          now += delay
        },
        now: () => now,
      })
    ).rejects.toThrow('still unavailable')

    expect(connect).toHaveBeenCalledTimes(2)
  })
})
