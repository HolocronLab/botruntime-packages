import { contractorActions } from './contractor-actions'
import { dealActions } from './deal-actions'
import { commentActions } from './comment-actions'
import { todoActions } from './todo-actions'
import { taskActions } from './task-actions'
import { approvalActions } from './approval-actions'

export const actions = {
  ...contractorActions,
  ...dealActions,
  ...commentActions,
  ...todoActions,
  ...taskActions,
  ...approvalActions,
} as const

export { states } from './state'
export { events } from './events'
export { configSchema } from './common'
