import { type ActionDefinition, z } from '@holocronlab/botruntime-sdk'
import { contactInfoSchema, contractorSchema } from './common'

const searchContractorsInput = z.object({
  q: z.string().min(1).title('Запрос').describe('Телефон, имя или email'),
  limit: z.number().int().positive().optional().title('Лимит').describe('Максимум результатов'),
})
const searchContractorsOutput = z.object({
  contractors: z.array(contractorSchema).title('Найденные контрагенты'),
})

const createContractorHumanInput = z.object({
  firstName: z.string().max(256).optional().title('Имя'),
  middleName: z.string().max(256).optional().title('Отчество'),
  lastName: z.string().max(220).optional().title('Фамилия'),
  description: z.string().max(65_000).optional().title('Описание'),
  contactInfo: z.array(contactInfoSchema).max(32).title('Контакты'),
}).strict()
const createContractorHumanOutput = z.object({
  id: z.string().title('ID контрагента'),
})

export const searchContractors: ActionDefinition = {
  title: 'Поиск контрагентов',
  description: 'Полнотекстовый поиск контрагентов.',
  input: { schema: searchContractorsInput },
  output: { schema: searchContractorsOutput },
}

export const createContractorHuman: ActionDefinition = {
  title: 'Создать контрагента (физлицо)',
  description: 'Создаёт контрагента-физлицо через /contractorHuman.',
  attributes: {
    'botruntime.durableOperation': 'v1',
    'botruntime.operationCheckpoint': 'v1',
    'botruntime.operationCheckpoint.maxEntries': '1',
    'botruntime.operationCheckpoint.maxValueBytes': '512',
    'botruntime.operationCheckpoint.maxBytes': '1024',
  },
  input: { schema: createContractorHumanInput },
  output: { schema: createContractorHumanOutput },
}

export const contractorActions = { searchContractors, createContractorHuman } as const

export type SearchContractorsInput = z.infer<typeof searchContractorsInput>
export type SearchContractorsOutput = z.infer<typeof searchContractorsOutput>
export type CreateContractorHumanInput = z.infer<typeof createContractorHumanInput>
export type CreateContractorHumanOutput = z.infer<typeof createContractorHumanOutput>
