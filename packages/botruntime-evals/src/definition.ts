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
}

export interface ConversationTurn {
  user?: string
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
}

export interface EvalDefinition {
  name: string
  description?: string
  tags?: string[]
  type?: 'capability' | 'regression'
  setup?: EvalSetup
  conversation: ConversationTurn[]
  outcome?: OutcomeAssertions
  options?: {
    idleTimeout?: number
    /** @deprecated No-op: the LLM judge is boolean (zai.check); there is no score threshold. */
    judgePassThreshold?: number
  }
}

export class Eval implements EvalDefinition {
  readonly name: string
  readonly description?: string
  readonly tags?: string[]
  readonly type?: 'capability' | 'regression'
  readonly setup?: EvalSetup
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
    if (def.outcome !== undefined) this.outcome = def.outcome
    if (def.options !== undefined) this.options = def.options
  }
}
