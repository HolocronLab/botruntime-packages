import { afterEach, describe, expect, test } from 'bun:test'
import type { IntegrationLogger } from '@holocronlab/botruntime-sdk'
import { findByAddress } from '../src/actions'
import { onRegister } from '../src/setup'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

function loggerWith(logs: string[]): IntegrationLogger {
  return {
    forBot: () => ({
      info(message: string) {
        logs.push(message)
      },
    }),
  } as unknown as IntegrationLogger
}

test('findByAddress не пишет адрес или токен в лог', async () => {
  const logs: string[] = []
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        data: { last: 10, status: 1 },
        request: {
          address: 'Москва, секретный адрес, 1',
          coords: null,
          court_fs: null,
          court_ms: null,
        },
      }),
      { status: 200 },
    )) as unknown as typeof fetch

  await findByAddress(
    { apiToken: 'secret-token' },
    'Москва, секретный адрес, 1',
    loggerWith(logs),
  )

  expect(logs).toEqual(['Территориальная подсудность: суды определены по адресу'])
  expect(logs.join('\n')).not.toContain('секретный адрес')
  expect(logs.join('\n')).not.toContain('secret-token')
})

describe('register', () => {
  test('проверяет токен через account endpoint', async () => {
    const urls: string[] = []
    const logs: string[] = []
    globalThis.fetch = (async (input) => {
      urls.push(String(input))
      return new Response(
        JSON.stringify({
          name: 'Иван',
          email: 'ivan@example.test',
          blocking: 0,
          balance: null,
          tariff: 'free',
          price: null,
          count_last: 50,
          count_max: 50,
        }),
        { status: 200 },
      )
    }) as typeof fetch

    await onRegister({ apiToken: 'token' }, loggerWith(logs))

    expect(new URL(urls[0]!).pathname).toBe('/v1/account')
    expect(logs).toEqual(['Территориальная подсудность: токен принят, интеграция подключена'])
  })

  test('невалидный токен отклоняет подключение', async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: { status: 0, error: 'Токен недействителен' } }), {
        status: 200,
      })) as unknown as typeof fetch

    await expect(onRegister({ apiToken: 'bad' }, loggerWith([]))).rejects.toThrow(/токен не прошёл проверку/)
  })
})
