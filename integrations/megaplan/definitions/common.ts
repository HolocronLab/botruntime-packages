import { z } from '@holocronlab/botruntime-sdk'

// Per-install credentials (password grant): account URL + login. username/password
// are .secret() so they are sealed and never echoed in the admin UI or logs.
export const configSchema = z.object({
  baseUrl: z
    .string()
    .title('Адрес аккаунта')
    .describe('https://<account>.megaplan.ru'),
  username: z.string().secret().title('Логин').describe('Логин сервисного пользователя Megaplan'),
  password: z.string().secret().title('Пароль').describe('Пароль сервисного пользователя Megaplan'),
})

// ── Shared input sub-schemas ────────────────────────────────────────────────

export const contactInfoSchema = z
  .object({
    type: z.enum(['phone', 'email', 'telegram']).title('Тип').describe('Тип контакта'),
    value: z.string().min(1).title('Значение').describe('Телефон / email / telegram'),
    comment: z.string().optional().title('Комментарий').describe('Необязательная подпись контакта'),
  })
  .title('Контакт')

// Money — value as a DECIMAL STRING (деньги считает код, не LLM; JS-float исказил
// бы сумму). Клиент сериализует его JSON-числом с valueInMain+rate.
export const moneySchema = z
  .object({
    value: z
      .string()
      .regex(/^-?\d+(\.\d+)?$/)
      .title('Сумма')
      .describe('Десятичная строка, например "60000.50"'),
    currency: z.string().default('RUB').title('Валюта').describe('ISO-код валюты'),
  })
  .title('Деньги')

// ── Shared output sub-schemas ───────────────────────────────────────────────

export const refSchema = z
  .object({
    contentType: z.string().title('Тип сущности'),
    id: z.string().title('ID'),
  })
  .title('Ссылка')

export const programStateSchema = z
  .object({
    id: z.string().title('ID статуса'),
    name: z.string().optional().title('Название'),
    type: z.string().optional().title('Тип').describe('active | positive | negative'),
    isEntry: z.boolean().optional().title('Входной статус'),
  })
  .title('Статус сделки')

export const contractorSchema = z
  .object({
    contentType: z.string().title('Тип').describe('ContractorHuman | ContractorCompany'),
    id: z.string().title('ID'),
    name: z.string().optional().title('Название'),
    firstName: z.string().optional().title('Имя'),
    lastName: z.string().optional().title('Фамилия'),
  })
  .title('Контрагент')

// Сводка перехода воронки (из possibleTransitions) — для подсказки бот/LLM, какой
// targetStateId доступен. Сырой объект перехода в выдачу не кладём (постится
// клиентом вербатим, наружу не нужен).
export const transitionSummarySchema = z
  .object({
    id: z.string().title('ID перехода'),
    to: programStateSchema.title('Целевой статус'),
  })
  .title('Доступный переход')

export const dealSchema = z
  .object({
    id: z.string().title('ID'),
    number: z.string().optional().title('Номер'),
    name: z.string().optional().title('Название'),
    description: z.string().optional().title('Описание'),
    state: programStateSchema.optional().title('Текущий статус'),
    program: refSchema.optional().title('Программа'),
    contractor: refSchema.optional().title('Контрагент'),
    price: moneySchema.optional().title('Сумма'),
    possibleTransitions: z.array(transitionSummarySchema).optional().title('Доступные переходы'),
  })
  .title('Сделка')
