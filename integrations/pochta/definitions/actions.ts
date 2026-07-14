import { z } from '@holocronlab/botruntime-sdk'

const operationSchema = z.object({
  typeCode: z.number().int().nonnegative(),
  attributeCode: z.number().int().nonnegative(),
  typeName: z.string(),
  attributeName: z.string(),
  occurredAt: z.string(),
})

const trackingResultSchema = z.object({
  trackingNumber: z.string().min(1),
  status: z.enum(['not_found', 'in_transit', 'delivered', 'returned']),
  deliveredAt: z.string().optional(),
  lastOperation: operationSchema.optional(),
  operations: z.array(operationSchema),
})

export const actions = {
  trackShipment: {
    title: 'Отследить отправление',
    description: 'Возвращает историю операций РПО и нормализованный факт вручения или возврата.',
    input: { schema: z.object({ trackingNumber: z.string().min(1) }) },
    output: { schema: trackingResultSchema },
  },
}
