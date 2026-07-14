import { z } from '@holocronlab/botruntime-sdk'

export const amountSchema = z.object({
  value: z.string().regex(/^\d+\.\d{2}$/).describe('Сумма с двумя знаками после точки'),
  currency: z.literal('RUB').default('RUB'),
})

export const paymentStatusSchema = z.enum(['pending', 'waiting_for_capture', 'succeeded', 'canceled'])

export const paymentSchema = z.object({
  paymentId: z.string().min(1),
  caseId: z.string().min(1),
  status: paymentStatusSchema,
  paid: z.boolean(),
  amount: amountSchema,
  confirmationUrl: z.string().url().optional(),
  capturedAt: z.string().optional(),
})
