import { z } from '@holocronlab/botruntime-sdk'

export const configuration = {
  schema: z.object({
    serviceUrl: z
      .string()
      .url()
      .title('URL сервиса конвертации')
      .describe('HTTPS base URL выделенного Gotenberg 8.x с LibreOffice'),
    authToken: z
      .string()
      .min(1)
      .secret()
      .optional()
      .title('Токен сервиса')
      .describe('Опциональный Bearer-токен reverse proxy перед Gotenberg'),
  }),
}
