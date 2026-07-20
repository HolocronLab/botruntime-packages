import { describe, expect, test, vi } from 'vitest'
import { Cognitive } from '@holocronlab/botruntime-cognitive'

vi.mock('./context', () => ({ getActiveConversationId: () => 'conv-ctx-1' }))
vi.mock('../../telemetry/tracing', () => ({
  span: (_name: string, _attrs: unknown, fn: (s: { setAttribute: () => void }) => unknown) =>
    fn({ setAttribute: () => {} }),
}))

import { InstrumentedCognitive } from './cognitive'

// Минимальный клиент, проходящий валидацию getExtendedClient (bp-client.ts).
function stubClient() {
  return {
    callAction: () => Promise.resolve({}),
    config: { headers: { 'x-bot-id': 'test-bot' } },
    axiosInstance: {},
    clone(): unknown {
      return this
    },
  } as never
}

const RESPONSE = {
  output: {},
  meta: {
    cached: false,
    model: { integration: 'openai', model: 'm' },
    latency: 1,
    cost: { input: 0, output: 0 },
    tokens: { input: 1, output: 1 },
  },
}

describe('InstrumentedCognitive', () => {
  test('generateContent injects active conversationId into the request input', async () => {
    const spy = vi
      .spyOn(Cognitive.prototype, 'generateContent')
      .mockResolvedValue(RESPONSE as never)
    const cog = new InstrumentedCognitive({ client: stubClient() })

    await cog.generateContent({ messages: [{ role: 'user', content: 'hi' }] } as never)

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-ctx-1' }))
  })

  test('explicitly passed conversationId wins over ambient context', async () => {
    const spy = vi
      .spyOn(Cognitive.prototype, 'generateContent')
      .mockResolvedValue(RESPONSE as never)
    const cog = new InstrumentedCognitive({ client: stubClient() })

    await cog.generateContent({
      messages: [{ role: 'user', content: 'hi' }],
      conversationId: 'conv-explicit',
    } as never)

    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 'conv-explicit' }))
  })
})
