import type { Payment } from './yookassa-api'

type PaymentApi = { getPayment(paymentId: string): Promise<Payment> }
type PaymentSucceededEvent = {
  type: 'paymentSucceeded'
  payload: {
    eventId: string
    paymentId: string
    caseId: string
    status: 'succeeded'
    paid: true
    amount: Payment['amount']
    capturedAt?: string
  }
}

export async function handlePaymentNotification(input: {
  body: string | undefined
  api: PaymentApi
  emit(event: PaymentSucceededEvent): Promise<unknown>
}): Promise<{ status: 200 }> {
  const notification = parseNotification(input.body)
  if (notification.event !== 'payment.succeeded') return { status: 200 }

  const payment = await input.api.getPayment(notification.paymentId)
  if (payment.id !== notification.paymentId || payment.status !== 'succeeded' || payment.paid !== true) {
    throw new Error(`YooKassa payment ${notification.paymentId} is not verified as succeeded`)
  }

  await input.emit({
    type: 'paymentSucceeded',
    payload: {
      eventId: `yookassa:payment.succeeded:${payment.id}`,
      paymentId: payment.id,
      caseId: payment.caseId,
      status: 'succeeded',
      paid: true,
      amount: payment.amount,
      capturedAt: payment.capturedAt,
    },
  })
  return { status: 200 }
}

function parseNotification(body: string | undefined): { event: string; paymentId: string } {
  if (!body) throw new Error('YooKassa notification body is empty')
  let raw: unknown
  try {
    raw = JSON.parse(body)
  } catch {
    throw new Error('YooKassa notification body is not valid JSON')
  }
  if (!isRecord(raw) || raw.type !== 'notification' || typeof raw.event !== 'string' || !isRecord(raw.object)) {
    throw new Error('YooKassa notification has an invalid envelope')
  }
  const paymentId = typeof raw.object.id === 'string' ? raw.object.id : ''
  if (!paymentId) throw new Error('YooKassa notification has no payment id')
  return { event: raw.event, paymentId }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
