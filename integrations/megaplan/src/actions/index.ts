import { searchContractors, createContractorHuman } from './contractor'
import { createDeal, getDeal, updateDealFields, moveDealStage, listPrograms, programStates } from './deal'
import { addComment } from './comment'
import { createTodo, listTodos, finishTodo } from './todo'
import { createTask, getTask, taskDoAction } from './task'
import { createNegotiationTask, getNegotiationDecision } from './approval'
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
  getTask,
  taskDoAction,
  createNegotiationTask,
  getNegotiationDecision,
} satisfies IntegrationProps['actions']
