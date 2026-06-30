import { type ActionDefinition, z } from '@botpress/sdk'
import { contactInfoSchema, contractorSchema } from './common'

const searchContractorsInput = z.object({
  q: z.string().min(1).title('Запрос').describe('Телефон, имя или email (дедуп лида перед созданием; best-effort)'),
  limit: z.number().int().positive().optional().title('Лимит').describe('Максимум результатов'),
})
const searchContractorsOutput = z.object({
  contractors: z.array(contractorSchema).title('Найденные контрагенты'),
})

const createContractorHumanInput = z.object({
  firstName: z.string().optional().title('Имя'),
  middleName: z.string().optional().title('Отчество'),
  lastName: z.string().optional().title('Фамилия'),
  description: z.string().optional().title('Описание'),
  contactInfo: z.array(contactInfoSchema).default([]).title('Контакты'),
})
const createContractorHumanOutput = z.object({
  id: z.string().title('ID контрагента'),
})

export const searchContractors: ActionDefinition = {
  title: 'Поиск контрагентов',
  description: 'Полнотекстовый поиск контрагентов (дедуп лида перед созданием).',
  input: { schema: searchContractorsInput },
  output: { schema: searchContractorsOutput },
}

export const createContractorHuman: ActionDefinition = {
  title: 'Создать контрагента (физлицо)',
  description: 'Создаёт клиента-физлицо (лид/дольщик) через /contractorHuman.',
  input: { schema: createContractorHumanInput },
  output: { schema: createContractorHumanOutput },
}

export const contractorActions = { searchContractors, createContractorHuman } as const

export type SearchContractorsInput = z.infer<typeof searchContractorsInput>
export type SearchContractorsOutput = z.infer<typeof searchContractorsOutput>
export type CreateContractorHumanInput = z.infer<typeof createContractorHumanInput>
export type CreateContractorHumanOutput = z.infer<typeof createContractorHumanOutput>
