import { type ActionDefinition, z } from '@holocronlab/botruntime-sdk'

const createTaskInput = z.object({
  name: z.string().min(1).max(960).title('Название'),
  responsibleId: z.string().min(1).max(256).title('ID ответственного'),
  dealIds: z.array(z.string().min(1).max(256)).max(64).title('ID сделок').describe('Привязка задачи к карточкам сделок'),
  // DateTime: "YYYY-MM-DD HH:MM:SS" (пробел, не ISO-T).
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    .optional()
    .title('Дедлайн')
    .describe('Формат "YYYY-MM-DD HH:MM:SS"'),
  isUrgent: z.boolean().optional().title('Срочная'),
  statement: z.string().max(64 * 1024).optional().title('Постановка задачи'),
}).strict()
const taskOutput = z.object({
  id: z.string().title('ID задачи'),
  status: z.string().optional().title('Статус'),
})

const getTaskInput = z.object({
  taskId: z.string().min(1).title('ID задачи'),
})

const getTaskOutput = z.object({
  id: z.string().title('ID задачи'),
  name: z.string().optional().title('Название'),
  status: z.string().optional().title('Статус'),
  deadline: z.string().optional().title('Дедлайн'),
  dealIds: z.array(z.string()).title('ID связанных сделок'),
})

const taskDoActionInput = z.object({
  taskId: z.string().min(1).title('ID задачи'),
  action: z.enum(['act_accept_task', 'act_done']).title('Действие').describe('assigned -> accepted -> completed'),
  checkTodos: z.boolean().optional().title('Проверять чек-лист'),
})

export const createTask: ActionDefinition = {
  title: 'Создать задачу',
  description: 'Создаёт задачу сотруднику; deals[] связывает её со сделками.',
  attributes: {
    'botruntime.durableOperation': 'v1',
    'botruntime.operationCheckpoint': 'v1',
    'botruntime.operationCheckpoint.maxEntries': '1',
    'botruntime.operationCheckpoint.maxValueBytes': '512',
    'botruntime.operationCheckpoint.maxBytes': '1024',
  },
  input: { schema: createTaskInput },
  output: { schema: taskOutput },
}
export const getTask: ActionDefinition = {
  title: 'Получить задачу',
  description: 'Возвращает безопасную read-only проекцию задачи и связи со сделками.',
  input: { schema: getTaskInput },
  output: { schema: getTaskOutput },
}
export const taskDoAction: ActionDefinition = {
  title: 'Действие над задачей',
  description: 'Перевод статуса задачи (только через doAction, прямая запись игнорируется).',
  input: { schema: taskDoActionInput },
  output: { schema: taskOutput },
}

export const taskActions = { createTask, getTask, taskDoAction } as const

export type CreateTaskInput = z.infer<typeof createTaskInput>
export type GetTaskInput = z.infer<typeof getTaskInput>
export type GetTaskOutput = z.infer<typeof getTaskOutput>
export type TaskDoActionInput = z.infer<typeof taskDoActionInput>
export type TaskOutput = z.infer<typeof taskOutput>
