import { z } from '@holocronlab/botruntime-sdk'
import { amountSchema, paymentSchema } from './common'

export const actions = {
  createPayment: {
    title: 'Создать платёж',
    description: 'Создаёт redirect-платёж ЮKassa и связывает его с делом через metadata.caseId.',
    input: {
      schema: z.object({
        caseId: z.string().min(1).max(64),
        amount: amountSchema,
        description: z.string().min(1).max(128),
        returnUrl: z.string().url(),
        idempotenceKey: z.string().min(1).max(64),
      }),
    },
    output: { schema: paymentSchema },
  },
  getPayment: {
    title: 'Проверить платёж',
    description: 'Читает каноническое состояние платежа напрямую из API ЮKassa.',
    input: { schema: z.object({ paymentId: z.string().min(1) }) },
    output: { schema: paymentSchema },
  },
}
