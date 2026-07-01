import { type ActionDefinition, z } from '@holocronlab/botruntime-sdk'
import { dealSchema, moneySchema, programStateSchema, refSchema } from './common'

const createDealInput = z.object({
  programId: z.string().min(1).title('ID программы').describe('Воронка фирмы (обязательно)'),
  contractorId: z.string().optional().title('ID контрагента'),
  managerId: z.string().optional().title('ID ответственного'),
  name: z.string().optional().title('Название'),
  description: z.string().optional().title('Описание').describe('Напр. "Неустойка ДДУ, просрочка 120 дней"'),
  stateId: z.string().optional().title('ID начального статуса'),
  price: moneySchema.optional().title('Сумма'),
})
const dealOutput = z.object({ deal: dealSchema.title('Сделка') })

const getDealInput = z.object({ id: z.string().min(1).title('ID сделки') })

// updateDealFields — НЕ принимает статус: смена этапа воронки игнорируется при
// прямой записи state (используйте moveDealStage). Здесь только обычные поля.
const updateDealFieldsInput = z.object({
  id: z.string().min(1).title('ID сделки'),
  name: z.string().optional().title('Название'),
  description: z.string().optional().title('Описание'),
  managerId: z.string().optional().title('ID ответственного'),
  price: moneySchema.optional().title('Сумма'),
})

const moveDealStageInput = z.object({
  dealId: z.string().min(1).title('ID сделки'),
  toStateId: z.string().min(1).title('ID целевого статуса'),
})
const moveDealStageOutput = z.object({
  moved: z.boolean().title('Перемещена').describe('true при успешном переходе; недоступный переход возвращается ошибкой'),
  state: programStateSchema.optional().title('Текущий статус'),
})

const listProgramsOutput = z.object({
  programs: z.array(z.object({ id: z.string(), name: z.string().optional() })).title('Программы'),
})

const programStatesInput = z.object({ programId: z.string().min(1).title('ID программы') })
const programStatesOutput = z.object({
  states: z.array(programStateSchema).title('Статусы'),
})

export const createDeal: ActionDefinition = {
  title: 'Создать сделку',
  description: 'Создаёт сделку (карточку дела). Обязательна только программа.',
  input: { schema: createDealInput },
  output: { schema: dealOutput },
}
export const getDeal: ActionDefinition = {
  title: 'Получить сделку',
  description: 'Возвращает сделку с доступными переходами воронки.',
  input: { schema: getDealInput },
  output: { schema: dealOutput },
}
export const updateDealFields: ActionDefinition = {
  title: 'Обновить поля сделки',
  description: 'Частичное обновление полей (НЕ статуса). Для смены этапа — moveDealStage.',
  input: { schema: updateDealFieldsInput },
  output: { schema: dealOutput },
}
export const moveDealStage: ActionDefinition = {
  title: 'Сменить этап сделки',
  description: 'Переводит сделку в целевой статус через applyTransition. Ошибка, если перехода нет.',
  input: { schema: moveDealStageInput },
  output: { schema: moveDealStageOutput },
}
export const listPrograms: ActionDefinition = {
  title: 'Список программ',
  description: 'Программы (воронки) аккаунта для разрешения programId по имени.',
  input: { schema: z.object({}) },
  output: { schema: listProgramsOutput },
}
export const programStates: ActionDefinition = {
  title: 'Статусы программы',
  description: 'Статусы воронки для разрешения targetStateId по имени.',
  input: { schema: programStatesInput },
  output: { schema: programStatesOutput },
}

export const dealActions = { createDeal, getDeal, updateDealFields, moveDealStage, listPrograms, programStates } as const

export type CreateDealInput = z.infer<typeof createDealInput>
export type GetDealInput = z.infer<typeof getDealInput>
export type UpdateDealFieldsInput = z.infer<typeof updateDealFieldsInput>
export type MoveDealStageInput = z.infer<typeof moveDealStageInput>
export type MoveDealStageOutput = z.infer<typeof moveDealStageOutput>
export type ProgramStatesInput = z.infer<typeof programStatesInput>
export type ProgramStatesOutput = z.infer<typeof programStatesOutput>
export type ListProgramsOutput = z.infer<typeof listProgramsOutput>
export type DealOutput = z.infer<typeof dealOutput>
// Ref re-exported for handler mapping convenience.
export type RefShape = z.infer<typeof refSchema>
