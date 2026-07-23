import { DateTime } from '../types'
import type { Task } from '../types'
import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

export const createTask: IntegrationProps['actions']['createTask'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const created = await api.createTask({
      name: input.name,
      responsibleId: input.responsibleId,
      dealIds: input.dealIds,
      deadline: input.deadline ? new DateTime(input.deadline) : undefined,
      isUrgent: input.isUrgent,
      statement: input.statement,
    })
    return { id: created.id, status: created.status }
  })

export function projectTask(task: Task): {
  id: string
  name?: string
  status?: string
  deadline?: string
  dealIds: string[]
} {
  const name = typeof task.name === 'string' && task.name.trim() ? task.name : undefined
  const status = typeof task.status === 'string' && task.status.trim() ? task.status : undefined
  const deadline =
    typeof task.deadline?.value === 'string' && task.deadline.value.trim()
      ? task.deadline.value
      : undefined
  const dealIds = [...new Set(
    (task.deals ?? [])
      .map((deal) => String(deal?.id ?? '').trim())
      .filter(Boolean),
  )]
  return {
    id: String(task.id),
    ...(name ? { name } : {}),
    ...(status ? { status } : {}),
    ...(deadline ? { deadline } : {}),
    dealIds,
  }
}

export const getTask: IntegrationProps['actions']['getTask'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    return projectTask(await api.getTask(input.taskId))
  })

export const taskDoAction: IntegrationProps['actions']['taskDoAction'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const updated = await api.taskDoAction(input.taskId, input.action, input.checkTodos ?? false)
    return { id: updated.id, status: updated.status }
  })
