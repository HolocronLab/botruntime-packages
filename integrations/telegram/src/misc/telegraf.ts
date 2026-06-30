import type { Agent } from 'node:http'
import { Telegraf } from 'telegraf'
import { HttpsProxyAgent } from 'https-proxy-agent'

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
    return new Telegraf(botToken, { telegram: { agent: new HttpsProxyAgent(proxyUrl) as unknown as Agent } })
  }
  return new Telegraf(botToken)
}
