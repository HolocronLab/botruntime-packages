import { searchContractors, createContractorHuman } from './contractor'
import { createDeal, getDeal, updateDealFields, moveDealStage, listPrograms, programStates } from './deal'
import { addComment } from './comment'
import { createTodo, listTodos, finishTodo } from './todo'
import { createTask, taskDoAction } from './task'
import type { IntegrationProps } from '../bp'

export default {
  searchContractors,
  createContractorHuman,
  createDeal,
  getDeal,
  updateDealFields,
  moveDealStage,
  listPrograms,
  programStates,
  addComment,
  createTodo,
  listTodos,
  finishTodo,
  createTask,
  taskDoAction,
} satisfies IntegrationProps['actions']
