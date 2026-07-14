import { z } from '@holocronlab/botruntime-sdk'

export const configuration = {
  schema: z.object({
    shopId: z.string().min(1).describe('Идентификатор магазина ЮKassa'),
    secretKey: z.string().min(1).secret().describe('Секретный ключ API ЮKassa'),
  }),
}
