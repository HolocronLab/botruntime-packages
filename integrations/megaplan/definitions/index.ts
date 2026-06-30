import { contractorActions } from './contractor-actions'
import { dealActions } from './deal-actions'
import { commentActions } from './comment-actions'
import { todoActions } from './todo-actions'
import { taskActions } from './task-actions'

export const actions = {
  ...contractorActions,
  ...dealActions,
  ...commentActions,
  ...todoActions,
  ...taskActions,
} as const

export { states } from './state'
export { configSchema } from './common'
