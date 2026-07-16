import { z } from '@holocronlab/botruntime-sdk'

// API требует персональный токен в query-параметре. Храним его как per-install
// secret и никогда не выводим URL запроса в логи или сообщения об ошибках.
export const configuration = {
  schema: z.object({
    apiToken: z
      .string()
      .secret()
      .title('API-токен')
      .describe('Токен из личного кабинета на территориальная-подсудность.рф'),
  }),
}
