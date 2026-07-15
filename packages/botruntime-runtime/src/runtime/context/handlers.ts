import * as sdk from '@holocronlab/botruntime-sdk'

import { BotHandlers } from '@holocronlab/botruntime-sdk'

// oxlint-disable-next-line no-explicit-any -- SDK BotHandlers generic requires any for untyped bot definition
type MessageHandler = Defined<BotHandlers<any>['messageHandlers'][string]>[number]
// oxlint-disable-next-line no-explicit-any -- SDK BotHandlers generic requires any for untyped bot definition
type EventHandler = Defined<BotHandlers<any>['eventHandlers'][string]>[number]
// oxlint-disable-next-line no-explicit-any -- SDK BotHandlers generic requires any for untyped bot definition
type WorkflowHandler = Defined<BotHandlers<any>['workflowHandlers']['continued'][string]>[number]

type Handler = MessageHandler | EventHandler | WorkflowHandler
type HandlerProps = Parameters<Handler>[0]

import { InstrumentedCognitive } from './cognitive'
import { PromiseTracker, shutdownPromiseTracker } from './promises'
import { CitationsManager } from '@holocronlab/botruntime-llmz'
import { BotContext, context, InternalClient } from './context'

import { IntegrationInterfaceMappings, interfaceMappings } from '../interfaces'
import { parseHttpRequest, RawHttpRequest } from './http'
import { Client } from '@holocronlab/botruntime-client'
import { Defined } from '../../utilities/types'
import { agentRegistry } from '../agent-registry'
import { TrackedState } from '../tracked-state'
import { TrackedTags } from '../tracked-tags'
import { TrackedUserProfile } from '../tracked-user-profile'
import { RegisteredIntegration, RegisteredInterface, RegisteredPlugin } from '../../types'
import { span } from '../../telemetry/tracing'
import { scheduleHeavyImport } from '../heavy-imports'
import { incrementRequestCount, getRequestMetrics } from '../../environment'
import { WorkflowContinueEvent } from '../events'
import { ulid } from 'ulid'
import { getConfiguredDevRequestTimeoutMs } from '../../workers/request-timeout'
import { runtimeClientCoordinates } from '../runtime-client-scope'

export type { RawHttpRequest } from './http'

type LambdaContext = {
  functionName: string
  functionVersion: string
  memoryLimitInMB: string
  getRemainingTimeInMillis: () => number
}

export interface PatchHandlersOptions {
  integrations: RegisteredIntegration[]
  interfaces: RegisteredInterface[]
  interfacesMapping: IntegrationInterfaceMappings
  plugins: RegisteredPlugin[]
}

type RequestHook = (request: RawHttpRequest, parsed: ReturnType<typeof parseHttpRequest>) => Promise<void> | void
const requestHooks: RequestHook[] = []

export const registerRequestHook = (hook: RequestHook) => {
  requestHooks.push(hook)
}

// oxlint-disable-next-line no-explicit-any -- SDK Bot generic params and return type require any at runtime boundary
export const patchHandlers = (bot: sdk.Bot<any, any>): any => {
  // Get options from registry if initialized, otherwise use provided options
  const opts = {
    integrations: agentRegistry.integrations,
    interfaces: agentRegistry.interfaces,
    interfacesMapping: agentRegistry.interfacesMapping as IntegrationInterfaceMappings,
    plugins: agentRegistry.plugins,
  }

  // First, patch the main handler to add runtime context
  // oxlint-disable-next-line no-explicit-any -- SDK handler type requires any for monkey-patching
  const original = bot.handler as any

  interfaceMappings.registerMappings(opts.interfacesMapping)

  bot.eventHandlers['adk_agent_deployed'] = [
    async (args) => {
      console.log('\n\n\nAgent deployed event received', args)
    },
  ]

  if (typeof original === 'function' && !original.replaced) {
    original.replaced = true

    // oxlint-disable-next-line no-explicit-any -- SDK handler type requires any for monkey-patching
    ;(bot.handler as any) = async (request: RawHttpRequest, lambdaCtx: LambdaContext) => {
      // Increment request counter
      incrementRequestCount()

      const parsed = parseHttpRequest(request)

      // Extract message preview for message_created events
      const messagePreview =
        parsed.type === 'message_created' && parsed.body?.event?.payload?.message?.payload?.text
          ? parsed.body.event.payload.message.payload.text.slice(0, 2000)
          : undefined
      const eventConversationId = parsed.body?.event?.conversationId as string | undefined

      return await span(
        'request.incoming',
        {
          'request.operation': parsed.operation,
          'request.type': parsed.type,
          'request.method': parsed.method,
          'request.path': parsed.path,
          botId: parsed.bot.id,
          webhookId: parsed.webhookId,
          ...(messagePreview && { 'message.preview': messagePreview }),
          ...(eventConversationId && { conversationId: eventConversationId }),
          ...getRequestMetrics(),
        },
        async (_requestSpan) => {
          const localStartedAt = Date.now()
          const localExecutionTimeout = getConfiguredDevRequestTimeoutMs()
          lambdaCtx = lambdaCtx || {
            functionName: 'local',
            functionVersion: 'local',
            memoryLimitInMB: '512',
            getRemainingTimeInMillis: () => Math.max(localExecutionTimeout - (Date.now() - localStartedAt), 0),
          }

          const vanillaClient = new Client({
            ...runtimeClientCoordinates(process.env, parsed.bot.id),
            headers: {
              'x-multiple-integrations': 'true',
            },
          })
          // oxlint-disable-next-line no-explicit-any -- SDK type mismatch between Client and BotSpecificClient constructor
          const client = new sdk.BotSpecificClient(vanillaClient as any)

          const cognitive = new InstrumentedCognitive({
            client: client,
            __experimental_beta: true,
          })

          const result = await context.run(
            (<BotContext>{
              executionId: ulid(),
              executionFinished: false,
              logger: new sdk.BotLogger({}),
              client,
              cognitive,
              botId: parsed.bot.id,
              bot: parsed.bot,
              configuration: parsed.bot.configuration.payload,
              operation: parsed.operation,
              request: parsed,
              citations: new CitationsManager(),
              integrations: opts.integrations,
              interfaces: opts.interfaces,
              plugins: opts.plugins,
              states: [],
              tags: [],
              userProfiles: [],
              runtime: {
                getRemainingExecutionTimeInMs: () => lambdaCtx.getRemainingTimeInMillis(),
                sandboxName: lambdaCtx.functionName,
                memoryInMb: parseInt(lambdaCtx.memoryLimitInMB, 10),
              } satisfies BotContext['runtime'],
              scheduledHeavyImports: new Set<string>(),
              promiseTracker: new PromiseTracker(),
              // oxlint-disable-next-line no-explicit-any -- BotContext partial construction requires any cast
            }) as any,
            async () => {
              scheduleHeavyImport('client')
              scheduleHeavyImport('sdk')
              scheduleHeavyImport('llmz')

              try {
                for (const hook of requestHooks) {
                  try {
                    await hook(request, parsed)
                  } catch (error) {
                    console.error('Error in request hook:', error)
                  }
                }

                const RUNTIME_SAFETY_MARGIN = 5000
                const remainingTime = Math.max(lambdaCtx.getRemainingTimeInMillis() - RUNTIME_SAFETY_MARGIN, 100)

                // oxlint-disable-next-line no-async-promise-executor
                return await new Promise<unknown>(async (resolve, reject) => {
                  const started = Date.now()
                  const timeout = setTimeout(
                    () =>
                      reject(
                        new sdk.RuntimeError(
                          `Runtime execution has timed out after ${Date.now() - started}ms of execution.`
                        )
                      ),
                    remainingTime
                  )

                  try {
                    const result = await original(request, lambdaCtx)
                    resolve(result)
                  } catch (error) {
                    reject(error)
                  } finally {
                    clearTimeout(timeout)
                    await Promise.all([
                      TrackedState.saveAllDirty(),
                      TrackedTags.saveAllDirty(),
                      TrackedUserProfile.saveAllDirty(),
                    ])
                  }
                })
              } finally {
                await Promise.all([
                  TrackedState.saveAllDirty(),
                  TrackedTags.saveAllDirty(),
                  TrackedUserProfile.saveAllDirty(),
                ])
                TrackedState.unloadAll()
                TrackedTags.unloadAll()
                TrackedUserProfile.unloadAll()
                context.set('executionFinished', true)
                await shutdownPromiseTracker()
              }
            }
          )

          return result
        }
      )
    }
  }

  // Wrap handler function with context
  // oxlint-disable-next-line no-explicit-any -- Handler type is dynamic, varies by handler registration
  const wrapHandler = (handler: any) => {
    const wrapped = async (props: HandlerProps) => {
      const scopedClient =
        context.get('client', { optional: true }) ?? (props.client as unknown as InternalClient<any>)
      const contextData: Partial<BotContext> = {
        client: scopedClient,
        logger: props.logger,
        event: props.event,
      }

      const loaders: Promise<void>[] = []

      if (props.event?.conversationId && !('conversation' in props)) {
        loaders.push(
          scopedClient
            .getConversation({
              id: props.event.conversationId,
            })
            // oxlint-disable-next-line no-explicit-any -- SDK response type destructuring
            .then(({ conversation }: any) => {
              // oxlint-disable-next-line no-explicit-any -- Augmenting props with conversation property
              ;(props as any).conversation = conversation
            })
            .catch(() => {})
        )
      }

      // @ts-ignore
      if (props.event?.workflowId && !('workflow' in props)) {
        loaders.push(
          scopedClient
            .getWorkflow({
              // @ts-ignore
              id: props.event.workflowId,
            })
            // oxlint-disable-next-line no-explicit-any -- SDK response type destructuring
            .then(({ workflow }: any) => {
              // oxlint-disable-next-line no-explicit-any -- Augmenting props with workflow property
              ;(props as any).workflow = workflow
            })
            .catch(() => {})
        )
      }

      if (props.event?.userId && !('user' in props)) {
        loaders.push(
          scopedClient
            .getUser({
              id: props.event.userId,
            })
            // oxlint-disable-next-line no-explicit-any -- SDK response type destructuring
            .then(({ user }: any) => {
              // oxlint-disable-next-line no-explicit-any -- Augmenting props with user property
              ;(props as any).user = user
            })
            .catch(() => {})
        )
      }

      if (loaders.length > 0) {
        await Promise.all(loaders)
      }

      if ('conversation' in props) {
        contextData.conversation = props.conversation
      }

      if ('message' in props) {
        contextData.message = props.message
      }

      if ('user' in props) {
        contextData.user = props.user
      }

      if (props.event.type === 'workflow_update' && 'workflow' in props.event.payload) {
        contextData.workflow = props.event.payload.workflow
      }

      if (props.event && typeof props.event.id === 'string') {
        contextData.event = props.event
      }

      return await context.run(contextData as BotContext, () => handler(props))
    }

    return wrapped
  }

  // Patch the .on methods to wrap handlers when they're registered
  // oxlint-disable-next-line no-explicit-any -- SDK bot.on type requires any for dynamic handler patching
  const originalOn = bot.on as any

  // List of all handler types that need to be patched
  const handlerTypes = [
    WorkflowContinueEvent.name,
    'workflowStart',
    'workflowTimeout',
    'event',
    'message',
    'stateExpired',
    'workflow',
    'hook',
  ]

  // Generically patch all handler types
  handlerTypes.forEach((handlerType) => {
    if (originalOn[handlerType] && !originalOn[handlerType]._patched) {
      const originalHandler = originalOn[handlerType]
      // oxlint-disable-next-line no-explicit-any -- Handler type is dynamic per handler registration
      originalOn[handlerType] = function (pattern: string, handler: any) {
        return originalHandler.call(this, pattern, wrapHandler(handler))
      }
      originalOn[handlerType]._patched = true
    }
  })

  return bot
}
