import { type ActionDefinition, z } from '@holocronlab/botruntime-sdk'

const createTaskInput = z.object({
  name: z.string().min(1).title('Название'),
  responsibleId: z.string().min(1).title('ID ответственного'),
  dealIds: z.array(z.string()).default([]).title('ID сделок').describe('Привязка задачи к карточкам сделок'),
  // DateTime: "YYYY-MM-DD HH:MM:SS" (пробел, не ISO-T).
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
    .optional()
    .title('Дедлайн')
    .describe('Формат "YYYY-MM-DD HH:MM:SS"'),
  isUrgent: z.boolean().optional().title('Срочная'),
  statement: z.string().optional().title('Постановка задачи'),
})
const taskOutput = z.object({
  id: z.string().title('ID задачи'),
  status: z.string().optional().title('Статус'),
})

const taskDoActionInput = z.object({
  taskId: z.string().min(1).title('ID задачи'),
  action: z.enum(['act_accept_task', 'act_done']).title('Действие').describe('assigned -> accepted -> completed'),
  checkTodos: z.boolean().optional().title('Проверять чек-лист'),
})

export const createTask: ActionDefinition = {
  title: 'Создать задачу',
  description: 'Задача-эскалация/гейт юристу; deals[] связывает её со сделкой.',
  input: { schema: createTaskInput },
  output: { schema: taskOutput },
}
export const taskDoAction: ActionDefinition = {
  title: 'Действие над задачей',
  description: 'Перевод статуса задачи (только через doAction, прямая запись игнорируется).',
  input: { schema: taskDoActionInput },
  output: { schema: taskOutput },
}

export const taskActions = { createTask, taskDoAction } as const

export type CreateTaskInput = z.infer<typeof createTaskInput>
export type TaskDoActionInput = z.infer<typeof taskDoActionInput>
export type TaskOutput = z.infer<typeof taskOutput>
