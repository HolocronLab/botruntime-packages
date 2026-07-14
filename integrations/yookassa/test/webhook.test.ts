import { describe, expect, test } from 'bun:test'

import { handlePaymentNotification } from '../src/webhook'

const verifiedPayment = {
  id: 'pay-1',
  status: 'succeeded' as const,
  paid: true,
  amount: { value: '1500.00', currency: 'RUB' as const },
  caseId: 'case-verified',
  capturedAt: '2026-07-14T06:00:00.000Z',
  confirmationUrl: undefined,
}

describe('payment.succeeded webhook', () => {
  test('re-fetches the payment and emits only the provider-verified state', async () => {
    const requested: string[] = []
    const emitted: unknown[] = []

    const result = await handlePaymentNotification({
      body: JSON.stringify({
        type: 'notification',
        event: 'payment.succeeded',
        object: { id: 'pay-1', status: 'succeeded', paid: true, metadata: { caseId: 'spoofed' } },
      }),
      api: {
        getPayment: async (id) => {
          requested.push(id)
          return verifiedPayment
        },
      },
      emit: async (event) => emitted.push(event),
    })

    expect(result).toEqual({ status: 200 })
    expect(requested).toEqual(['pay-1'])
    expect(emitted).toEqual([
      {
        type: 'paymentSucceeded',
        payload: {
          eventId: 'yookassa:payment.succeeded:pay-1',
          paymentId: 'pay-1',
          caseId: 'case-verified',
          status: 'succeeded',
          paid: true,
          amount: { value: '1500.00', currency: 'RUB' },
          capturedAt: '2026-07-14T06:00:00.000Z',
        },
      },
    ])
  })

  test('duplicate delivery keeps the same event id for downstream idempotency', async () => {
    const ids: string[] = []
    const deliver = () =>
      handlePaymentNotification({
        body: JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id: 'pay-1' } }),
        api: { getPayment: async () => verifiedPayment },
        emit: async (event) => ids.push(event.payload.eventId),
      })

    await deliver()
    await deliver()
    expect(ids).toEqual(['yookassa:payment.succeeded:pay-1', 'yookassa:payment.succeeded:pay-1'])
  })

  test('does not emit when canonical API state is not succeeded and paid', async () => {
    const emitted: unknown[] = []
    await expect(
      handlePaymentNotification({
        body: JSON.stringify({ type: 'notification', event: 'payment.succeeded', object: { id: 'pay-1' } }),
        api: {
          getPayment: async () => ({ ...verifiedPayment, status: 'pending' as const, paid: false }),
        },
        emit: async (event) => emitted.push(event),
      }),
    ).rejects.toThrow(/not verified/i)
    expect(emitted).toEqual([])
  })

  test('acknowledges unrelated notifications without an event', async () => {
    let fetched = false
    const result = await handlePaymentNotification({
      body: JSON.stringify({ type: 'notification', event: 'payment.canceled', object: { id: 'pay-1' } }),
      api: {
        getPayment: async () => {
          fetched = true
          return verifiedPayment
        },
      },
      emit: async () => {},
    })
    expect(result).toEqual({ status: 200 })
    expect(fetched).toBe(false)
  })
})
