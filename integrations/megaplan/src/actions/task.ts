import { DateTime } from '../types'
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

export const taskDoAction: IntegrationProps['actions']['taskDoAction'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const updated = await api.taskDoAction(input.taskId, input.action, input.checkTodos ?? false)
    return { id: updated.id, status: updated.status }
  })
