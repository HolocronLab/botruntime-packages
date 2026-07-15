import { afterEach, describe, expect, test } from 'bun:test'

import { handler } from '../src/index'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('register handler result', () => {
  test('returns the successful SDK result after credential verification', async () => {
    const requests: Request[] = []
    const fetchMock = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requests.push(new Request(input, init))
      return Response.json({ type: 'error', description: 'payment not found' }, { status: 404 })
    }
    globalThis.fetch = Object.assign(fetchMock, { preconnect: originalFetch.preconnect })

    const configuration = Buffer.from(JSON.stringify({ shopId: 'shop-1', secretKey: 'secret-1' })).toString('base64')
    const result = await handler({
      method: 'POST',
      path: '/',
      query: '',
      headers: {
        'content-type': 'application/json',
        'x-bp-operation': 'register',
        'x-bp-configuration-type': 'inline',
        'x-bp-configuration': configuration,
        'x-bot-id': 'bot-1',
        'x-integration-id': 'yookassa',
      },
      body: JSON.stringify({ webhookUrl: 'https://example.test/hooks/wh-1', commands: [] }),
    })

    expect(result).toEqual({ status: 200 })
    expect(requests).toHaveLength(1)
    expect(requests[0]?.url).toBe('https://api.yookassa.ru/v3/payments/00000000-0000-0000-0000-000000000000')
    expect(requests[0]?.headers.get('authorization')).toBe(`Basic ${btoa('shop-1:secret-1')}`)
  })
})
