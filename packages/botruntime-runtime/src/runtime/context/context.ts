import { CitationsManager } from '@holocronlab/botruntime-llmz'
import { Client, Conversation, User, Workflow } from '@holocronlab/botruntime-client'
import {
  AnyIncomingEvent,
  AnyIncomingMessage,
  BaseBot,
  BotSpecificClient,
  BotLogger,
  BotOperation,
} from '@holocronlab/botruntime-sdk/dist/bot'
import { Cognitive } from '@holocronlab/botruntime-cognitive'

import { AsyncLocalStorage } from 'async_hooks'
import { Chat } from '../chat/chat'
import { HttpRequest } from './http'
import { type TrackedState } from '../tracked-state'
import { type TrackedTags } from '../tracked-tags'
import { type TrackedUserProfile } from '../tracked-user-profile'
import { RegisteredIntegration, RegisteredInterface, RegisteredPlugin } from '../../types'
import type { WorkflowStepContext } from '../../primitives/workflow-instance'
import { getSingleton } from '../singletons'
import { PromiseTracker } from './promises'
import { BotTags } from '../../_types/tags'

export type InternalClient<TBot extends BaseBot> = BotSpecificClient<TBot> & {
  _inner: Client
}

export type WorkflowControlContext = {
  workflow: Workflow
  signal: AbortSignal
  abort: () => void
  fail: (reason: string) => void
  complete: (result: unknown) => void
  aborted: boolean
  failed: boolean
  failedReason?: string
  completed: boolean
  completedResult?: unknown
  acked: boolean
  ack: () => Promise<void>
  restart: () => void
  restarted: boolean
}

export type BotContext<TBot extends BaseBot = BaseBot, Config = unknown> = {
  executionId: string
  executionFinished: boolean
  request: HttpRequest
  botId: string
  bot: { id: string; tags: BotTags; userId: string; configuration: Config }
  client: InternalClient<TBot>
  cognitive: Cognitive
  logger: BotLogger
  operation: BotOperation
  configuration: Config
  conversation?: Conversation
  citations: CitationsManager
  user?: User
  event?: AnyIncomingEvent<TBot>
  message?: AnyIncomingMessage<TBot>
  workflow?: Workflow
  workflowControlContext?: WorkflowControlContext
  workflowStep?: WorkflowStepContext
  interfaces?: RegisteredInterface[]
  integrations?: RegisteredIntegration[]
  plugins?: RegisteredPlugin[]
  chat?: Chat
  states: TrackedState[]
  tags: TrackedTags[]
  userProfiles: TrackedUserProfile[]
  runtime: {
    sandboxName: string
    memoryInMb: number
    getRemainingExecutionTimeInMs: () => number
  }
  scheduledHeavyImports: Set<string>
  promiseTracker: PromiseTracker
}

/**
 * We need this because the import of this file can happen from different entrypoints and we want
 * to share the same AsyncLocalStorage instance across them.
 */
const storage = getSingleton('__ADK_GLOBAL_CTX_STORAGE', () => new AsyncLocalStorage<BotContext>())

/**
 * Default context used as a fallback when no AsyncLocalStorage context is active.
 * This is useful for testing and script execution where code runs outside of request handlers.
 */
const defaultContext = getSingleton('__ADK_GLOBAL_DEFAULT_CTX', () => ({ value: null as Partial<BotContext> | null }))

export const context = {
  enterWith: (data: BotContext) => {
    storage.enterWith(data)
  },

  run: <TReturn>(data: BotContext, callback: () => TReturn) => {
    const existingStore = storage.getStore()

    // If we're already in a context, merge the new data
    if (existingStore) {
      Object.assign(existingStore, data)
      // Just execute the callback, we're already in the async context
      return callback()
    }

    // Otherwise, create a new context
    return storage.run(data, callback)
  },

  getAll: (): BotContext => {
    let store = storage.getStore()

    // Fall back to default context if no active AsyncLocalStorage context
    if (!store && defaultContext.value) {
      store = defaultContext.value as BotContext
    }

    if (!store) throw new Error('No context found. Did you forget to call `context.run()`?')
    return store
  },

  get: <T extends keyof BotContext = keyof BotContext>(
    key: T,
    opts?: { optional?: boolean }
  ): Required<BotContext>[T] => {
    let store = storage.getStore()

    // Fall back to default context if no active AsyncLocalStorage context
    if (!store && defaultContext.value) {
      store = defaultContext.value as BotContext
    }

    if (store) {
      store.states ??= []
      store.tags ??= []
      store.userProfiles ??= []
      store.scheduledHeavyImports ??= new Set<string>()
    }

    if (!store || !(key in store)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- null must satisfy generic return type
      if (opts?.optional) return null as any
      throw new Error(`Context key "${String(key)}" not found`)
    }

    return store[key] as unknown as Required<BotContext>[T]
  },

  set: (key: keyof BotContext, value: BotContext[keyof BotContext]) => {
    const store = storage.getStore()
    if (!store) throw new Error('Cannot set context outside of `run`')
    ;(store as Record<string, unknown>)[key] = value
  },

  /**
   * Set a default context that will be used as a fallback when no AsyncLocalStorage context is active.
   * This is useful for testing and script execution where code runs outside of request handlers.
   *
   * @example
   * ```typescript
   * context.setDefaultContext({
   *   botId: 'my-bot',
   *   integrations: agentRegistry.integrations,
   *   interfaces: agentRegistry.interfaces,
   * })
   * ```
   */
  setDefaultContext: (data: Partial<BotContext>) => {
    defaultContext.value = data
  },

  /**
   * Clear the default context.
   */
  clearDefaultContext: () => {
    defaultContext.value = null
  },
}

export function getActiveConversationId(): string | undefined {
  return (
    context.get('conversation', { optional: true })?.id ??
    context.get('workflow', { optional: true })?.conversationId ??
    context.get('workflowControlContext', { optional: true })?.workflow.conversationId
  )
}
