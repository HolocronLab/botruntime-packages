import { z } from '@holocronlab/botruntime-sdk'

export const configuration = {
  schema: z.object({
    apiKey: z
      .string()
      .min(1)
      .secret()
      .title('API key CloudConvert')
      .describe('Ключ с минимальными scopes task.read и task.write'),
  }),
}
