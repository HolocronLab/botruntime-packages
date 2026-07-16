import { z } from '@holocronlab/botruntime-sdk'

const courtSchema = z
  .object({
    code: z.string().title('Код суда'),
    title: z.string().title('Название'),
    address: z.string().title('Адрес'),
    site: z.string().optional().title('Сайт').describe('Один или несколько URL через пробел'),
    email: z.string().optional().title('Электронная почта').describe('Один или несколько адресов через пробел'),
    tel: z.string().optional().title('Телефон'),
  })
  .title('Суд')

const searchOutputSchema = z.object({
  remaining: z.number().title('Остаток').describe('Запросы на сегодня для free или рубли для balance'),
  resolvedAddress: z.string().nullable().title('Распознанный адрес'),
  resolvedCoordinates: z.string().nullable().title('Координаты'),
  districtCourt: courtSchema.nullable().title('Районный или городской суд'),
  magistrateCourt: courtSchema.nullable().title('Участок мирового судьи'),
})

const accountOutputSchema = z.object({
  name: z.string().title('Имя'),
  email: z.string().title('Электронная почта'),
  blocked: z.boolean().title('Доступ заблокирован'),
  balance: z.number().nullable().title('Баланс'),
  tariff: z.enum(['free', 'balance']).title('Тариф'),
  price: z.number().nullable().title('Цена запроса'),
  remainingRequests: z.number().nullable().title('Осталось запросов сегодня'),
  dailyLimit: z.number().nullable().title('Дневной лимит'),
})

export const actions = {
  findByAddress: {
    title: 'Определить подсудность по адресу',
    description: 'Находит районный или городской суд и участок мирового судьи по адресу здания.',
    input: {
      schema: z.object({
        address: z
          .string()
          .min(1)
          .title('Адрес')
          .describe('Город, улица, дом, корпус или строение. Без квартиры, помещения и этажа.'),
      }),
    },
    output: { schema: searchOutputSchema },
  },
  findByCoordinates: {
    title: 'Определить подсудность по координатам',
    description: 'Находит районный или городской суд и участок мирового судьи по координатам здания.',
    input: {
      schema: z.object({
        latitude: z.number().min(-90).max(90).title('Широта'),
        longitude: z.number().min(-180).max(180).title('Долгота'),
      }),
    },
    output: { schema: searchOutputSchema },
  },
  getAccount: {
    title: 'Проверить тариф и лимит',
    description: 'Возвращает тариф, баланс и остаток запросов API.',
    input: { schema: z.object({}) },
    output: { schema: accountOutputSchema },
  },
}
