import type { Agent } from 'node:http'
import { Telegraf, Telegram } from 'telegraf'
import { HttpsProxyAgent } from 'https-proxy-agent'

// runtime-host abandons an integration operation after 45 seconds. Telegraf's
// node-fetch default is 500 seconds, which leaves a request alive after the host
// has already returned 500; a later network failure then escapes as an
// uncaughtException. Keep the provider deadline strictly inside the host budget.
export const TELEGRAM_REQUEST_TIMEOUT_MS = 30_000

// telegraf ходит к api.telegram.org своим node-http клиентом — мимо globalThis.fetch-обёртки хоста,
// которая заворачивает egress. С RU-хоста Telegram режется, поэтому без шлюза getFile/sendMessage →
// ECONNREFUSED. Когда host выставил EGRESS_PROXY_URL и telegram в allowlist — даём telegraf
// proxy-agent на шлюз; иначе (dev/прямой доступ) — обычный клиент.
export function makeTelegraf(botToken: string): Telegraf {
  const proxyUrl = process.env.EGRESS_PROXY_URL
  const hosts = (process.env.EGRESS_PROXY_HOSTS || '').split(',').map((s) => s.trim())
  if (proxyUrl && hosts.includes('api.telegram.org')) {
    // HttpsProxyAgent — это http.Agent в рантайме (туннелит https через CONNECT), но его тип
    // структурно не совпадает с telegraf-ожидаемым Agent → каст.
    return withTelegramRequestDeadline(
      new Telegraf(botToken, { telegram: { agent: new HttpsProxyAgent(proxyUrl) as unknown as Agent } })
    )
  }
  return withTelegramRequestDeadline(new Telegraf(botToken))
}

function withTelegramRequestDeadline(telegraf: Telegraf): Telegraf {
  const callApi = telegraf.telegram.callApi.bind(telegraf.telegram)
  type CallApiOptions = Parameters<Telegram['callApi']>[2]
  type TelegrafAbortSignal = NonNullable<CallApiOptions>['signal']
  telegraf.telegram.callApi = ((method, payload, options) =>
    callApi(method, payload, {
      ...options,
      signal:
        options?.signal ??
        (AbortSignal.timeout(TELEGRAM_REQUEST_TIMEOUT_MS) as unknown as TelegrafAbortSignal),
    })) as Telegram['callApi']
  return telegraf
}
