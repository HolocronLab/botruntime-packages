import { afterEach, describe, expect, it } from 'bun:test'
import { Telegram } from 'telegraf'

const originalPrepareStackTrace = Error.prepareStackTrace

afterEach(() => {
  Error.prepareStackTrace = originalPrepareStackTrace
})

describe('Telegram transport error fidelity', () => {
  it('keeps a network failure as a real Error under the bundle stack rewriter contract', async () => {
    Error.prepareStackTrace = (error, frames) =>
      `${Error.prototype.toString.call(error)}\n${frames.map((frame) => `    at ${frame}`).join('\n')}`

    let thrown: unknown
    try {
      await new Telegram('123:TEST', { apiRoot: 'http://127.0.0.1:1' }).sendMessage(1, 'probe')
    } catch (error) {
      thrown = error
    }

    expect(thrown).toBeInstanceOf(Error)
    expect((thrown as Error).stack).not.toContain('First argument must be an Error object')
    expect((thrown as Error).message).not.toBe('First argument must be an Error object')
  })
})
