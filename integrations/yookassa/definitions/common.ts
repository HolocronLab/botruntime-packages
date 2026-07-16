import { z } from '@holocronlab/botruntime-sdk'

export const amountSchema = z.object({
  value: z.string().regex(/^\d+\.\d{2}$/).describe('Сумма с двумя знаками после точки'),
  currency: z.literal('RUB').default('RUB'),
})

const receiptCustomerSchema = z.union([
  z.object({
    email: z.string().email(),
    phone: z.string().regex(/^\d{10,15}$/).optional(),
  }),
  z.object({
    email: z.string().email().optional(),
    phone: z.string().regex(/^\d{10,15}$/),
  }),
])

const paymentModeSchema = z.enum([
  'full_prepayment',
  'partial_prepayment',
  'advance',
  'full_payment',
  'partial_payment',
  'credit',
  'credit_payment',
])

export const receiptSchema = z.object({
  customer: receiptCustomerSchema,
  items: z.array(z.object({
    description: z.string().min(1).max(128),
    quantity: z.number().positive().max(99_999.999),
    amount: amountSchema,
    vatCode: z.number().int().min(1).max(12),
    paymentMode: paymentModeSchema.optional(),
    paymentSubject: z.string().regex(/^[a-z_]+$/).max(64).optional(),
  })).min(1).max(80),
  taxSystemCode: z.number().int().min(1).max(6).optional(),
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
