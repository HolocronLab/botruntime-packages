import { z } from '@holocronlab/botruntime-sdk'
import { amountSchema } from './common'

export const paymentSucceededSchema = z.object({
  eventId: z.string().min(1).describe('Стабильный ключ для дедупликации повторных webhook'),
  paymentId: z.string().min(1),
  caseId: z.string().min(1),
  status: z.literal('succeeded'),
  paid: z.literal(true),
  amount: amountSchema,
  capturedAt: z.string().optional(),
})

export const events = {
  paymentSucceeded: {
    title: 'Платёж подтверждён',
    description: 'Платёж повторно проверен через API ЮKassa и имеет status=succeeded, paid=true.',
    schema: paymentSucceededSchema,
  },
}
