import { beforeEach, describe, expect, test, vi, type Mock } from 'vitest'
import { Cognitive } from './client'

vi.mock('./cognitive-v2', async (importOriginal) => {
  const actual = (await importOriginal()) as any
  return { ...actual, CognitiveBeta: vi.fn() }
})

import { CognitiveBeta } from './cognitive-v2'

const CognitiveBetaMock = CognitiveBeta as unknown as Mock
const V2_RESPONSE = {
  output: 'v2 response',
  metadata: {
    provider: 'openai',
    model: 'gpt-5',
    usage: { inputTokens: 80, inputCost: 0.001, outputTokens: 40, outputCost: 0.002 },
    cost: 0.003,
    cached: false,
    latency: 200,
    stopReason: 'stop' as const,
  },
}

class TestClient {
  callAction = vi.fn()
  getBot = vi.fn()
  getFile = vi.fn()
  axiosInstance = { defaults: { signal: new AbortController().signal } }
  config = { headers: { 'x-bot-id': 'test' } }
  clone = () => this
}

function mockV2(overrides: { generateText?: Mock; listModels?: Mock } = {}) {
  const instance = {
    generateText: overrides.generateText ?? vi.fn().mockResolvedValue(V2_RESPONSE),
    listModels: overrides.listModels ?? vi.fn().mockResolvedValue([]),
    on: vi.fn(),
  }
  CognitiveBetaMock.mockReturnValue(instance)
  return instance
}

describe('Cognitive v2-only routing', () => {
  let bp: TestClient

  beforeEach(() => {
    vi.clearAllMocks()
    bp = new TestClient()
  })

  test.each([undefined, 'best', 'openai:gpt-5', 'custom:new-model'])(
    'routes model %s directly to v2 without integration actions',
    async (model) => {
      const v2 = mockV2()
      const client = new Cognitive({ client: bp })

      const result = await client.generateContent({
        messages: [{ role: 'user', content: 'hi' }],
        ...(model ? { model: model as any } : {}),
      })

      expect(v2.generateText).toHaveBeenCalledOnce()
      expect(bp.callAction).not.toHaveBeenCalled()
      expect(result.output.choices[0]?.content).toBe('v2 response')
    }
  )

  test('forwards conversationId (provider prompt-cache stickiness)', async () => {
    const v2 = mockV2()
    const client = new Cognitive({ client: bp })

    await client.generateContent({
      messages: [{ role: 'user', content: 'hi' }],
      model: 'openai:gpt-5',
      conversationId: 'conv-1',
    })

    expect(v2.generateText).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conv-1' }),
      expect.anything()
    )
  })

  test('surfaces the primary v2 error and never invokes a legacy fallback', async () => {
    const primary = new Error('primary v2 failure')
    const v2 = mockV2({ generateText: vi.fn().mockRejectedValue(primary) })
    const client = new Cognitive({ client: bp })

    await expect(
      client.generateContent({ messages: [{ role: 'user', content: 'hi' }], model: 'openai:gpt-5' })
    ).rejects.toBe(primary)

    expect(v2.generateText).toHaveBeenCalledOnce()
    expect(bp.callAction).not.toHaveBeenCalled()
  })

  test('does not mutate input while prepending the v2 system message', async () => {
    mockV2()
    const client = new Cognitive({ client: bp })
    const input = {
      messages: [{ role: 'user' as const, content: 'hi' }],
      model: 'openai:gpt-5' as const,
      systemPrompt: 'You are helpful',
    }

    await client.generateContent(input)

    expect(input.systemPrompt).toBe('You are helpful')
    expect(input.messages).toHaveLength(1)
  })

  test('keeps request and response interceptors on the v2 path', async () => {
    const v2 = mockV2()
    const client = new Cognitive({ client: bp })
    client.interceptors.request.use((_err, req, next) =>
      next(null, { input: { ...req.input, temperature: 0.25 } })
    )
    client.interceptors.response.use((_err, response, next) =>
      next(null, { ...response, meta: { ...response.meta, cached: true } })
    )

    const result = await client.generateContent({ messages: [{ role: 'user', content: 'hi' }] })

    expect(v2.generateText.mock.calls[0]?.[0]).toMatchObject({ temperature: 0.25 })
    expect(result.meta.cached).toBe(true)
  })

  test('returns static model details without remote fetch', async () => {
    const v2 = mockV2()
    const client = new Cognitive({ client: bp })

    const details = await client.getModelDetails('openai:gpt-4o-2024-11-20')

    expect(details.integration).toBe('cognitive-v2')
    expect(v2.listModels).not.toHaveBeenCalled()
  })

  test('resolves newly advertised models and aliases from the v2 catalog', async () => {
    const v2 = mockV2({
      listModels: vi.fn().mockResolvedValue([
        {
          id: 'openai:gpt-6',
          name: 'GPT-6',
          aliases: ['openai:gpt-latest'],
          tags: [],
          input: { maxTokens: 200000, costPer1MTokens: 5 },
          output: { maxTokens: 32000, costPer1MTokens: 15 },
          lifecycle: 'production',
        },
      ]),
    })
    const client = new Cognitive({ client: bp })

    expect((await client.getModelDetails('openai:gpt-latest')).id).toBe('openai:gpt-6')
    expect(v2.listModels).toHaveBeenCalledOnce()
  })

  test('uses a permissive v2 descriptor when the catalog is temporarily unavailable', async () => {
    const v2 = mockV2({ listModels: vi.fn().mockRejectedValue(new Error('catalog unavailable')) })
    const client = new Cognitive({ client: bp })

    const details = await client.getModelDetails('custom:new-model')

    expect(details).toMatchObject({ id: 'custom:new-model', integration: 'cognitive-v2' })
    expect(v2.listModels).toHaveBeenCalledOnce()
    expect(bp.callAction).not.toHaveBeenCalled()
  })
})
