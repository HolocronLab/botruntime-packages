import { Definitions } from '../primitives/definition'
import { Table, Trigger, Action, Workflow, Knowledge, Conversation } from '../primitives'
import type { IntegrationActions } from '../_types/integration-actions'
import { getSingleton } from './singletons'
import { Environment } from '../environment'
import { IntegrationPackage, BotSpecificClient } from '@holocronlab/botruntime-sdk'
import { actions as actionsProxy } from './actions'
import { BuiltInWorkflows } from './workflows'
import { AgentConfig } from '../define-config'
import { Zai, type Memoizer } from '@holocronlab/botruntime-zai'
import { step } from '../primitives/workflow-step'
import { Cognitive } from '@holocronlab/botruntime-cognitive'
import { Client } from '@holocronlab/botruntime-client'
import { context } from '../library'
import { BuiltInActions } from './actions/index'
import { Autonomous } from './autonomous'
import { runtimeClientWorkspaceId } from './runtime-client-scope'

/**
 * Get or create a standalone cognitive client for use outside execution context
 */
function getStandaloneCognitive(): Cognitive {
  return getSingleton('__ADK_GLOBAL_STANDALONE_COGNITIVE', () => {
    // BP_TOKEN is set by AWS Lambda runtime, ADK_TOKEN is set by CLI commands
    const token = process.env.BP_TOKEN || process.env.ADK_TOKEN
    if (!token) {
      throw new Error(
        'No token found. Set BP_TOKEN or ADK_TOKEN, or run the agent with `brt dev`.'
      )
    }

    const botId = process.env.ADK_BOT_ID
    if (!botId) {
      throw new Error('No bot ID found. Set BP_BOT_ID or ADK_BOT_ID, or run the agent with `brt dev`.')
    }

    const apiUrl = process.env.ADK_API_URL || 'https://botruntime.ru'
    const workspaceId = runtimeClientWorkspaceId(process.env)

    // Create a vanilla client
    const vanillaClient = new Client({
      token,
      apiUrl,
      workspaceId,
      botId,
    })

    // Wrap it in BotSpecificClient as required by Cognitive
    // oxlint-disable-next-line no-explicit-any -- SDK type mismatch between Client and BotSpecificClient constructor
    const botClient = new BotSpecificClient(vanillaClient as any)

    return new Cognitive({
      client: botClient,
      __experimental_beta: true,
    })
  })
}

type ZaiModelId = ConstructorParameters<typeof Zai>[0]['modelId']

function resolveZaiModelId(model: AgentConfig['defaultModels']['zai']): ZaiModelId {
  const modelId = Array.isArray(model) ? model[0] : model
  return modelId === 'auto' ? undefined : modelId
}

/**
 * Integration primitive with typed actions
 */
export interface Integration<I extends keyof IntegrationActions = keyof IntegrationActions> {
  alias: string
  definition: IntegrationPackage['definition']
  actions: IntegrationActions[I]
}

interface IntegrationArray extends Array<Integration> {
  get<I extends keyof IntegrationActions>(name: I | (string & {})): Integration<I> | undefined
}

/**
 * Agent project API - provides typed access to all agent primitives
 */
export interface Project {
  /** Agent configuration */
  config: AgentConfig
  /** Installed integrations with typed actions */
  integrations: IntegrationArray
  /** Action primitives */
  // oxlint-disable-next-line no-explicit-any -- Action generic params are user-defined, any is required for collection type
  actions: Action<any, any>[]
  /** Knowledge base primitives */
  knowledge: Knowledge[]
  /** Table primitives */
  tables: Table[]
  /** Workflow primitives */
  workflows: Workflow[]
  /** Conversation primitives */
  // oxlint-disable-next-line no-explicit-any -- Conversation generic params are user-defined, any is required for collection type
  conversations: Conversation<any, any>[]
  /** Trigger primitives */
  // oxlint-disable-next-line no-explicit-any -- Trigger generic param is user-defined, any is required for collection type
  triggers: Trigger<any>[]
}

/**
 * Agent runtime interface for agent development
 */
export interface ADK {
  environment: typeof Environment
  /** Project primitives and configuration */
  project: Project
  /** Zai is an LLM utility toolkit */
  zai: Zai
  /**
   * Execute an autonomous LLM agent outside of a conversation context.
   * This is useful for running scripts, migrations, or background tasks
   * that need LLM capabilities without a conversation.
   */
  execute: (props: Autonomous.Props) => Promise<Autonomous.ExecuteResult>
}

/**
 * Agent runtime state stored in globalThis
 * @internal
 */
interface ADKState {
  initialized: boolean
  projectConfig?: Project['config']
  primitives: {
    integrations: Integration[]
    /* eslint-disable @typescript-eslint/no-explicit-any -- primitives are registered dynamically and cast at access time */
    actions: any[]
    knowledge: any[]
    tables: any[]
    workflows: any[]
    conversations: any[]
    triggers: any[]
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }
}

/**
 * Get the agent runtime state singleton
 * @internal
 */
const getState = () =>
  getSingleton('__ADK_GLOBAL_PROJECT', (): ADKState => {
    const state: ADKState = {
      initialized: false,
      primitives: {
        integrations: [],
        actions: [],
        knowledge: [],
        tables: [],
        workflows: [],
        conversations: [],
        triggers: [],
      },
    }
    return state
  })

/**
 * Initialize the agent runtime API
 * @internal - Only called by generated runtime code
 */
export function initialize(options: { config: Project['config'] }): void {
  const state = getState()
  if (state.initialized) {
    throw new Error('Agent runtime API already initialized')
  }

  state.projectConfig = options.config
  state.initialized = true

  state.primitives.workflows.push(...Object.values(BuiltInWorkflows))
  state.primitives.actions.push(...Object.values(BuiltInActions))
}

/**
 * Register a primitive with the agent runtime API
 * @internal - Only called by generated runtime code
 */
export function register(...primitives: Definitions.Primitive[]): void {
  const state = getState()
  if (!state.initialized) {
    throw new Error('Agent runtime API not initialized. Call initialize() first.')
  }

  for (const primitive of primitives) {
    const definition = primitive.getDefinition()

    switch (definition.type) {
      case 'action':
        state.primitives.actions.push(primitive)
        break
      case 'conversation':
        state.primitives.conversations.push(primitive)
        break
      case 'knowledge':
        state.primitives.knowledge.push(primitive)

        for (const source of definition.sources) {
          state.primitives.workflows.push(source.syncWorkflow)
        }

        break
      case 'table':
        state.primitives.tables.push(primitive)
        break
      case 'trigger':
        state.primitives.triggers.push(primitive)
        break
      case 'workflow':
        state.primitives.workflows.push(primitive)
        break
    }
  }
}

/**
 * Register an integration with the agent runtime API
 * @internal - Only called by generated runtime code
 */
export function registerIntegration(props: { alias: string; definition: IntegrationPackage['definition'] }): void {
  const state = getState()
  if (!state.initialized) {
    throw new Error('Agent runtime API not initialized. Call initialize() first.')
  }

  state.primitives.integrations.push({
    alias: props.alias,
    definition: props.definition,
    get actions() {
      return actionsProxy[props.alias]
    },
  })
}

/**
 * Agent runtime API - provides typed access to project primitives and utilities
 */
export const adk: ADK = {
  get environment() {
    return Environment
  },

  get zai() {
    // Try to get cognitive from execution context first, fall back to standalone
    const contextCognitive = context.get('cognitive', { optional: true })
    const cognitive = contextCognitive ?? getStandaloneCognitive()
    const modelId = resolveZaiModelId(adk.project.config.defaultModels.zai)

    return new Zai({
      client: cognitive,
      ...(modelId ? { modelId } : {}),
      memoize: (): Memoizer => {
        const workflow = context.get('workflow', { optional: true })
        if (!workflow) {
          return { run: async <T>(_id: string, fn: () => Promise<T>) => fn() }
        }
        return {
          run: async <T>(id: string, fn: () => Promise<T>) =>
            step(
              `zai:${id}`,
              async ({ attempt }) => {
                try {
                  return await fn()
                } catch (err) {
                  console.warn(`Zai function failed on attempt ${attempt}:`, err)
                  throw err
                }
              },
              { maxAttempts: 10 }
            ),
        }
      },
    })
  },

  get project(): Project {
    const state = getState()
    if (!state.initialized || !state.projectConfig) {
      throw new Error('Agent runtime API not initialized')
    }

    return {
      config: state.projectConfig,
      integrations: Object.assign(state.primitives.integrations, {
        get<I extends keyof IntegrationActions>(name: I | (string & {})): Integration<I> | undefined {
          const byAlias = state.primitives.integrations.find((int) => int.alias === name)

          const byName = state.primitives.integrations.find((int) => int.definition.name === name)

          return (byAlias || byName) as Integration<I> | undefined
        },
      }) as IntegrationArray,
      actions: state.primitives.actions,
      knowledge: state.primitives.knowledge,
      tables: state.primitives.tables,
      workflows: state.primitives.workflows,
      conversations: state.primitives.conversations,
      triggers: state.primitives.triggers,
    }
  },

  async execute(props: Autonomous.Props): Promise<Autonomous.ExecuteResult> {
    // Get cognitive from context if available, otherwise use standalone
    const contextCognitive = context.get('cognitive', { optional: true })
    const cognitive = contextCognitive ?? getStandaloneCognitive()

    // Get default model from project config
    const defaultModel = adk.project.config.defaultModels.autonomous

    const { execute: llmz_execute, getValue } = await import('@holocronlab/botruntime-llmz')

    return llmz_execute({
      // oxlint-disable-next-line no-explicit-any -- Cognitive type mismatch with llmz client param
      client: cognitive as any,
      instructions: props.instructions,
      ...(props.tools && { tools: props.tools }),
      ...(props.objects && { objects: props.objects }),
      ...(props.exits && { exits: props.exits }),
      ...(props.signal && { signal: props.signal }),
      temperature: async (ctx) => (props.temperature ? await getValue(props.temperature, ctx) : 0.7),
      model: async (ctx) => (props.model ? await getValue(props.model, ctx) : defaultModel),
      options: { loop: props.iterations ?? 10 },
      ...(props.hooks?.onTrace && { onTrace: props.hooks.onTrace }),
      ...(props.hooks?.onIterationEnd && { onIterationEnd: props.hooks.onIterationEnd }),
      ...(props.hooks?.onBeforeTool && { onBeforeTool: props.hooks.onBeforeTool }),
      ...(props.hooks?.onAfterTool && { onAfterTool: props.hooks.onAfterTool }),
      ...(props.hooks?.onBeforeExecution && { onBeforeExecution: props.hooks.onBeforeExecution }),
      ...(props.hooks?.onExit && { onExit: props.hooks.onExit }),
    })
  },
}
