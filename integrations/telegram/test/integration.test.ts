import { describe, expect, it } from 'bun:test'
import { axios as runtimeAxios } from '@holocronlab/botruntime-client'
import * as mod from '../src/index'

// The host loads the bundle and calls module.exports.handler with the dispatch.ts envelope. These
// tests drive the SAME code through the SAME (subset) envelope the host sends, proving the
// host<->SDK adapter, the faithful op dispatch, and the two gaps are wired.

const cfg = Buffer.from(JSON.stringify({ botToken: 'x' })).toString('base64')
// EXACTLY the headers dispatch.ts integrationContextHeaders() always sends — NO x-bot-user-id /
// x-integration-alias / x-webhook-id (the adapter must fill those, else the SDK 500s).
const hostHeaders = {
  'x-bot-id': 'b1',
  'x-integration-id': 'telegram',
  'x-bp-configuration-type': 'integration',
  'x-bp-configuration': cfg,
}

const call = (op: string, body: string, extra: Record<string, string> = {}) =>
  (mod.handler as (req: unknown) => Promise<{ status?: number; body?: string } | void>)({
    method: 'POST',
    path: '/',
    query: '',
    headers: { ...hostHeaders, 'x-bp-operation': op, ...extra },
    body,
  })

describe('loader contract', () => {
  it('exports a handler function and a default with .handler (extractHandler probes both)', () => {
    expect(typeof mod.handler).toBe('function')
    expect(typeof (mod.default as { handler?: unknown }).handler).toBe('function')
    expect((mod.default as { handler?: unknown }).handler).toBe(mod.handler)
  })
})

describe('host<->SDK envelope adapter', () => {
  it('ping succeeds even though the host omits x-bot-user-id/alias/webhook-id', async () => {
    const res = await call('ping', '{}')
    expect(res && res.status).toBe(200)
  })

  it('swallows ignorable updates (channel post) as 200, never a silent failure', async () => {
    const res = await call('webhook_received', JSON.stringify({ channel_post: { text: 'x' } }))
    expect(res && res.status).toBe(200)
  })

  it('ignores bot-authored messages as 200', async () => {
    const res = await call(
      'webhook_received',
      JSON.stringify({ message: { from: { is_bot: true, id: 1 }, chat: { id: 1, type: 'private' }, message_id: 1, text: 'hi' } })
    )
    expect(res && res.status).toBe(200)
  })

  it('re-nests the flat provider request so a real text reaches the env-configured @holocronlab/botruntime-client', async () => {
    const prev = process.env.BP_TOKEN
    const prevApiUrl = process.env.BP_API_URL
    const axios = runtimeAxios.default
    const originalAdapter = axios.defaults.adapter
    const requests: Array<{ url: string; authorization: string | null }> = []
    axios.defaults.adapter = async (config) => {
      const url = new URL(config.url ?? '', config.baseURL)
      requests.push({
        url: url.toString(),
        authorization: runtimeAxios.AxiosHeaders.from(config.headers).get('authorization')?.toString() ?? null,
      })
      const response = {
        config,
        data: { error: 'missing or invalid Authorization bearer' },
        headers: {},
        request: {},
        status: 401,
        statusText: 'Unauthorized',
      }
      throw new runtimeAxios.AxiosError('Request failed with status code 401', 'ERR_BAD_REQUEST', config, {}, response)
    }
    // A deterministic 401 proves the adapter bridged the envelope all the way into the real SDK ->
    // webhook handler -> env-configured client call, without production network or local sockets.
    // The handler wraps the client ApiError so the SDK preserves the honest 4xx.
    delete process.env.BP_TOKEN
    process.env.BP_API_URL = 'https://botruntime.test'
    try {
      const res = await call(
        'webhook_received',
        JSON.stringify({
          message: { from: { is_bot: false, id: 7, first_name: 'Ann' }, chat: { id: 7, type: 'private' }, message_id: 5, text: 'привет' },
        })
      )
      expect(res && res.status).toBe(400)
      expect(res && res.body).toMatch(/authenticat|authoriz/i)
      expect(requests).toHaveLength(1)
      expect(requests[0]?.url).toStartWith('https://botruntime.test/')
      expect(requests[0]?.authorization).toBeNull()
    } finally {
      axios.defaults.adapter = originalAdapter
      if (prev === undefined) delete process.env.BP_TOKEN
      else process.env.BP_TOKEN = prev
      if (prevApiUrl === undefined) delete process.env.BP_API_URL
      else process.env.BP_API_URL = prevApiUrl
    }
  })
})

describe('gaps wired on the integration', () => {
  const channels = (mod.default as unknown as { channels: { channel: { messages: Record<string, unknown> } } }).channels
  const actions = (mod.default as unknown as { actions: Record<string, unknown> }).actions

  it('exposes the request_contact outbound channel message', () => {
    expect(typeof channels.channel.messages.contactRequest).toBe('function')
  })

  it('keeps the faithful channel + typing-indicator surface', () => {
    for (const t of ['text', 'image', 'audio', 'video', 'file', 'location', 'card', 'carousel', 'dropdown', 'choice', 'bloc']) {
      expect(typeof channels.channel.messages[t]).toBe('function')
    }
    expect(typeof actions.startTypingIndicator).toBe('function')
    expect(typeof actions.stopTypingIndicator).toBe('function')
  })
})
