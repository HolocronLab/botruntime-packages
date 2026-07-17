export type MatchOperator =
  | string
  | { equals: unknown }
  | { contains: string }
  | { not_contains: string }
  | { matches: string }
  | { in: unknown[] }
  | { exists: boolean }
  | { gte: number }
  | { lte: number }

export type ResponseAssertion =
  | { contains: string }
  | { not_contains: string }
  | { matches: string }
  | { llm_judge: string }
// | { similar_to: string } TODO: uncomment this when it gets implemented

export type ToolAssertion =
  | { called: string; params?: Record<string, MatchOperator> }
  | { not_called: string }
  | { call_order: string[] }

export interface StateAssertion {
  path: string
  equals?: unknown
  changed?: boolean
}

export interface WorkflowAssertion {
  name: string
  entered?: boolean
  completed?: boolean
}

export type NumericOperator = { equals: number } | { gte: number } | { lte: number }

export interface TimingAssertion {
  response_time: NumericOperator
}

export interface TurnAssertions {
  response?: ResponseAssertion[]
  tools?: ToolAssertion[]
  state?: StateAssertion[]
  workflow?: WorkflowAssertion[]
  timing?: TimingAssertion[]
  tables?: TableAssertion[]
  deliveredTo?: string | string[]
  notDeliveredTo?: string | string[]
  conversationMode?: { target: string; equals: string; property?: string }
}

export interface ConversationTurn {
  user?: string
  /** Preferred actor-neutral spelling. `user` remains supported for compatibility. */
  message?: string
  /** Named synthetic actor. Omit or use `client` for the primary Chat participant. */
  actor?: string
  /** Route this turn to a linked platform conversation. */
  target?: { relation: string }
  /** Send multiple same-target inputs concurrently to exercise race/idempotency paths. */
  parallel?: Array<{
    message?: string
    event?: { payload: Record<string, unknown> }
  }>
  /** Test-only platform controls, available only on isolated development targets. */
  control?: {
    advanceClock?: { milliseconds: number; runDueWorkflows?: boolean }
    faults?: Array<{
      point: string
      failAfter?: number
      times?: number
      status?: 429 | 503
      mode?: 'error' | 'lost_ack'
    }>
    clearFaults?: boolean
  }
  /** Optional files uploaded by the host and delivered through the ordinary chat message path. */
  attachments?: import('./attachments').EvalAttachment[]
  event?: { payload: Record<string, unknown> }
  expectSilence?: boolean
  assert?: TurnAssertions
  /**
   * Run this turn in a NEW conversation under the same user. The prior
   * transcript is absent, so recall here can only come from user-scoped
   * persistence, not context. Ignored on the first turn.
   */
  newConversation?: boolean
}

export interface OutcomeAssertions {
  state?: StateAssertion[]
  workflow?: WorkflowAssertion[]
  tables?: TableAssertion[]
}

export interface EvalTableSeed {
  table: string
  rows: Array<Record<string, unknown>>
}

export interface TableAssertion {
  table: string
  row_exists?: Record<string, MatchOperator>
  row_count?: NumericOperator
  where?: Record<string, MatchOperator>
}

export interface EvalSetup {
  state?: {
    bot?: Record<string, unknown>
    user?: Record<string, unknown>
    conversation?: Record<string, unknown>
  }
  workflow?: {
    trigger: string
    input?: Record<string, unknown>
  }
  relations?: Record<string, ConversationRelationSelector>
  /** Rows created before the eval and removed by exact row id after outcome grading. */
  tables?: EvalTableSeed[]
}

export interface ConversationRelationSelector {
  tags: Record<string, string>
  integration?: string
  channel?: string
}

export interface EvalDefinition {
  name: string
  description?: string
  tags?: string[]
  type?: 'capability' | 'regression'
  setup?: EvalSetup
  /** Local fixture catalog. Hosts upload these files and remove paths from the hosted manifest. */
  fixtures?: Record<string, EvalFixtureSource>
  conversation: ConversationTurn[]
  outcome?: OutcomeAssertions
  options?: {
    idleTimeout?: number
    /** @deprecated No-op: the LLM judge is boolean (zai.check); there is no score threshold. */
    judgePassThreshold?: number
  }
}

export interface EvalFixtureSource {
  /** Path relative to the agent project root. */
  path: string
  contentType: string
  name?: string
}

export class Eval implements EvalDefinition {
  readonly name: string
  readonly description?: string
  readonly tags?: string[]
  readonly type?: 'capability' | 'regression'
  readonly setup?: EvalSetup
  readonly fixtures?: Record<string, EvalFixtureSource>
  readonly conversation: ConversationTurn[]
  readonly outcome?: OutcomeAssertions
  readonly options?: {
    idleTimeout?: number
    /** @deprecated No-op: the LLM judge is boolean (zai.check); there is no score threshold. */
    judgePassThreshold?: number
  }

  constructor(def: EvalDefinition) {
    this.name = def.name
    this.conversation = def.conversation
    if (def.description !== undefined) this.description = def.description
    if (def.tags !== undefined) this.tags = def.tags
    if (def.type !== undefined) this.type = def.type
    if (def.setup !== undefined) this.setup = def.setup
    if (def.fixtures !== undefined) this.fixtures = def.fixtures
    if (def.outcome !== undefined) this.outcome = def.outcome
    if (def.options !== undefined) this.options = def.options
  }
}
