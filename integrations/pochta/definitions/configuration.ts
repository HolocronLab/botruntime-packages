import { z } from '@holocronlab/botruntime-sdk'

export const configuration = {
  schema: z.object({
    login: z.string().min(1).describe('Логин API Сервиса отслеживания Почты России'),
    password: z.string().min(1).secret().describe('Пароль API Сервиса отслеживания Почты России'),
  }),
}
