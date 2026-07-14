import { describe, expect, test } from 'bun:test'

import { YookassaApiError, YookassaClient } from '../src/yookassa-api'

const cfg = { shopId: 'shop-1', secretKey: 'secret-1', retryDelayMs: 0 }

describe('YookassaClient', () => {
  test('createPayment uses Basic auth and a caller-owned idempotence key', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = []
    const client = new YookassaClient({
      ...cfg,
      fetchImpl: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} })
        return Response.json({
          id: 'pay-1',
          status: 'pending',
          paid: false,
          amount: { value: '1500.00', currency: 'RUB' },
          confirmation: { type: 'redirect', confirmation_url: 'https://yoomoney.ru/checkout/pay-1' },
          metadata: { caseId: 'case-42' },
        })
      },
    })

    const payment = await client.createPayment({
      caseId: 'case-42',
      amount: { value: '1500.00', currency: 'RUB' },
      description: 'Юридические услуги по делу case-42',
      returnUrl: 'https://example.test/payment-return',
      idempotenceKey: 'case-42-initial-payment',
    })

    expect(payment.id).toBe('pay-1')
    expect(payment.confirmationUrl).toBe('https://yoomoney.ru/checkout/pay-1')
    expect(calls).toHaveLength(1)
    expect(calls[0]?.url).toBe('https://api.yookassa.ru/v3/payments')
    expect(calls[0]?.init.method).toBe('POST')
    expect(new Headers(calls[0]?.init.headers).get('authorization')).toBe(`Basic ${btoa('shop-1:secret-1')}`)
    expect(new Headers(calls[0]?.init.headers).get('idempotence-key')).toBe('case-42-initial-payment')
    expect(JSON.parse(String(calls[0]?.init.body))).toMatchObject({
      amount: { value: '1500.00', currency: 'RUB' },
      confirmation: { type: 'redirect', return_url: 'https://example.test/payment-return' },
      capture: true,
      metadata: { caseId: 'case-42' },
    })
  })

  test('transient create failure retries with the same idempotence key', async () => {
    const keys: string[] = []
    let attempt = 0
    const client = new YookassaClient({
      ...cfg,
      fetchImpl: async (_input, init) => {
        keys.push(new Headers(init?.headers).get('idempotence-key') ?? '')
        attempt++
        if (attempt === 1) return Response.json({ description: 'temporary' }, { status: 503 })
        return Response.json({
          id: 'pay-2',
          status: 'pending',
          paid: false,
          amount: { value: '10.00', currency: 'RUB' },
          metadata: { caseId: 'case-2' },
        })
      },
    })

    await client.createPayment({
      caseId: 'case-2',
      amount: { value: '10.00', currency: 'RUB' },
      description: 'Оплата',
      returnUrl: 'https://example.test/return',
      idempotenceKey: 'stable-key',
    })

    expect(keys).toEqual(['stable-key', 'stable-key'])
  })

  test('getPayment reads the canonical provider state', async () => {
    let seenUrl = ''
    const client = new YookassaClient({
      ...cfg,
      fetchImpl: async (input) => {
        seenUrl = String(input)
        return Response.json({
          id: 'pay/escaped',
          status: 'succeeded',
          paid: true,
          amount: { value: '1500.00', currency: 'RUB' },
          captured_at: '2026-07-14T06:00:00.000Z',
          metadata: { caseId: 'case-42' },
        })
      },
    })

    const payment = await client.getPayment('pay/escaped')

    expect(seenUrl).toBe('https://api.yookassa.ru/v3/payments/pay%2Fescaped')
    expect(payment).toMatchObject({ id: 'pay/escaped', status: 'succeeded', paid: true, caseId: 'case-42' })
  })

  test('provider error never leaks the secret', async () => {
    const client = new YookassaClient({
      ...cfg,
      fetchImpl: async () => Response.json({ description: 'invalid credentials secret-1' }, { status: 401 }),
    })

    const error = await client.getPayment('pay-1').catch((value) => value)
    expect(error).toBeInstanceOf(YookassaApiError)
    expect(String(error)).not.toContain('secret-1')
  })
})
