import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

export const createTodo: IntegrationProps['actions']['createTodo'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const created = await api.createTodo(input.dealId, input.name, input.responsibleId)
    return { id: created.id }
  })

export const listTodos: IntegrationProps['actions']['listTodos'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const todos = await api.listTodos(input.dealId, input.finished)
    return { todos: todos.map((t) => ({ id: t.id, name: t.name })) }
  })

export const finishTodo: IntegrationProps['actions']['finishTodo'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const finished = await api.finishTodo(input.todoId)
    return { id: finished.id }
  })
