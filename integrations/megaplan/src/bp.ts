// Local equivalent of the `.botpress` codegen: binds integration.definition.ts to
// the SDK implementation generics so handlers get typed ctx/input/output/client
// without importing the generated dir. `bp build` regenerates `.botpress` for the
// real bundle; this shim keeps the source tsc-clean standalone.
import type * as sdk from '@holocronlab/botruntime-sdk'
import type { z } from '@holocronlab/botruntime-sdk'
import type { configSchema } from '../definitions/common'
import type { StatePayload } from '../definitions/state'
import type {
  SearchContractorsInput,
  SearchContractorsOutput,
  CreateContractorHumanInput,
  CreateContractorHumanOutput,
} from '../definitions/contractor-actions'
import type {
  CreateDealInput,
  GetDealInput,
  UpdateDealFieldsInput,
  MoveDealStageInput,
  MoveDealStageOutput,
  ProgramStatesInput,
  ProgramStatesOutput,
  ListProgramsOutput,
  DealOutput,
} from '../definitions/deal-actions'
import type { AddCommentInput, AddCommentOutput } from '../definitions/comment-actions'
import type { CreateTodoInput, ListTodosInput, ListTodosOutput, FinishTodoInput, TodoOutput } from '../definitions/todo-actions'
import type { CreateTaskInput, TaskDoActionInput, TaskOutput } from '../definitions/task-actions'
import type {
  CreateNegotiationTaskInput,
  CreateNegotiationTaskOutput,
  GetNegotiationDecisionInput,
  GetNegotiationDecisionOutput,
} from '../definitions/approval-actions'
import type { EntityCommand } from '../definitions/events'

export type Configuration = z.infer<typeof configSchema>

type Actions = {
  searchContractors: { input: SearchContractorsInput; output: SearchContractorsOutput }
  createContractorHuman: { input: CreateContractorHumanInput; output: CreateContractorHumanOutput }
  createDeal: { input: CreateDealInput; output: DealOutput }
  getDeal: { input: GetDealInput; output: DealOutput }
  updateDealFields: { input: UpdateDealFieldsInput; output: DealOutput }
  moveDealStage: { input: MoveDealStageInput; output: MoveDealStageOutput }
  listPrograms: { input: Record<string, never>; output: ListProgramsOutput }
  programStates: { input: ProgramStatesInput; output: ProgramStatesOutput }
  addComment: { input: AddCommentInput; output: AddCommentOutput }
  createTodo: { input: CreateTodoInput; output: TodoOutput }
  listTodos: { input: ListTodosInput; output: ListTodosOutput }
  finishTodo: { input: FinishTodoInput; output: TodoOutput }
  createTask: { input: CreateTaskInput; output: TaskOutput }
  taskDoAction: { input: TaskDoActionInput; output: TaskOutput }
  createNegotiationTask: { input: CreateNegotiationTaskInput; output: CreateNegotiationTaskOutput }
  getNegotiationDecision: { input: GetNegotiationDecisionInput; output: GetNegotiationDecisionOutput }
}

export type TMegaplan = {
  name: 'megaplan'
  version: '0.2.0'
  configuration: Configuration
  configurations: Record<string, never>
  actions: Actions
  channels: Record<string, never>
  events: { entityCommand: EntityCommand }
  states: { megaplanAuth: { type: 'integration'; payload: StatePayload } }
  user: { tags: Record<string, string> }
  entities: Record<string, never>
}

export type IntegrationProps = sdk.IntegrationProps<TMegaplan>
export type Context = sdk.IntegrationContext<TMegaplan>
export type Client = sdk.IntegrationSpecificClient<TMegaplan>
