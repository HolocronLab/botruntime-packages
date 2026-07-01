import { type ActionDefinition, z } from '@holocronlab/botruntime-sdk'

const createTodoInput = z.object({
  dealId: z.string().min(1).title('ID сделки'),
  name: z.string().min(1).title('Название пункта'),
  responsibleId: z.string().min(1).title('ID ответственного'),
})
const todoOutput = z.object({ id: z.string().title('ID пункта') })

const listTodosInput = z.object({
  dealId: z.string().min(1).title('ID сделки'),
  finished: z.boolean().optional().title('Завершённые').describe('false = только открытые; не задано = все'),
})
const listTodosOutput = z.object({
  todos: z.array(z.object({ id: z.string(), name: z.string().optional() })).title('Пункты чек-листа'),
})

const finishTodoInput = z.object({ todoId: z.string().min(1).title('ID пункта') })

export const createTodo: ActionDefinition = {
  title: 'Создать пункт чек-листа',
  description: 'Пункт чек-листа в карточке сделки (/deal/{id}/todos).',
  input: { schema: createTodoInput },
  output: { schema: todoOutput },
}
export const listTodos: ActionDefinition = {
  title: 'Список пунктов чек-листа',
  description: 'Пункты чек-листа сделки (дедуп перед созданием).',
  input: { schema: listTodosInput },
  output: { schema: listTodosOutput },
}
export const finishTodo: ActionDefinition = {
  title: 'Завершить пункт чек-листа',
  description: 'Завершает пункт чек-листа (единственный finish-action схемы).',
  input: { schema: finishTodoInput },
  output: { schema: todoOutput },
}

export const todoActions = { createTodo, listTodos, finishTodo } as const

export type CreateTodoInput = z.infer<typeof createTodoInput>
export type ListTodosInput = z.infer<typeof listTodosInput>
export type ListTodosOutput = z.infer<typeof listTodosOutput>
export type FinishTodoInput = z.infer<typeof finishTodoInput>
export type TodoOutput = z.infer<typeof todoOutput>
