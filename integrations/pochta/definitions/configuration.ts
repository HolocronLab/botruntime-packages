import { z } from '@holocronlab/botruntime-sdk'

export const configuration = {
  schema: z.object({
    login: z.string().min(1).describe('Логин из вкладки «API Трекинга» Почты России'),
    password: z.string().min(1).secret().describe('Пароль из вкладки «API Трекинга» Почты России'),
  }),
}
