import { afterEach, expect, test } from 'bun:test'
import { Telegram } from 'telegraf'
import { makeTelegraf, TELEGRAM_REQUEST_TIMEOUT_MS } from '../src/misc/telegraf'

const originalCallApi = Telegram.prototype.callApi

afterEach(() => {
  Telegram.prototype.callApi = originalCallApi
})

test('Telegram requests carry a deadline below the 45 second integration-host budget', async () => {
  let signal: unknown
  Telegram.prototype.callApi = (async (_method, _payload, options) => {
    signal = options?.signal
    return { message_id: 42 }
  }) as typeof Telegram.prototype.callApi

  const telegram = makeTelegraf('123:TEST').telegram
  await telegram.sendDocument(1, { source: Buffer.from('docx') })

  expect(TELEGRAM_REQUEST_TIMEOUT_MS).toBeLessThan(45_000)
  expect(signal).toBeInstanceOf(AbortSignal)
  expect((signal as AbortSignal).aborted).toBe(false)
})
