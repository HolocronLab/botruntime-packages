import { getValue, type ValueOrGetter, type Context as LlmzContext, type Chat as LlmzChat } from '@holocronlab/botruntime-llmz'
import {
  Iteration as LlmzIteration,
  Tool as LlmzTool,
  Traces as _Traces,
  ThinkSignal as _ThinkSignal,
  SnapshotSignal as _SnapshotSignal,
  Citation as _Citation,
  CitationsManager as _CitationsManager,
  ListenExit as _ListenExit,
  ThinkExit as _ThinkExit,
  DefaultExit as _DefaultExit,
  Component as LlmzComponent,
} from '@holocronlab/botruntime-llmz'
import { Exit as LlmzExit, type ExitResult as LlmzExitResult } from '@holocronlab/botruntime-llmz'
import { ObjectInstance as LlmzObject } from '@holocronlab/botruntime-llmz'
import { SpanStatusCode } from '@opentelemetry/api'
import { createJoinedAbortSignal } from '../utilities/abort-signal'
import { contextManager, createSpan, span, TypedSpan } from '../telemetry/tracing'
import { context, getActiveConversationId } from './context/context'
import { CognitiveBeta } from '@holocronlab/botruntime-cognitive'
import type { BaseKnowledge } from '../primitives/knowledge'
import { z } from '@holocronlab/botruntime-sdk'
import _ from 'lodash'
import { HandledErrorProp } from '../telemetry/span-helpers'
import { AsyncResource } from 'node:async_hooks'

type Execute = typeof import('@holocronlab/botruntime-llmz').execute
// `llmz` does not export `ExecutionProps` from its package root; derive it structurally
// from `execute`'s own parameter type instead of deep-importing a non-exported subpath.
type LlmzExecutionProps = Parameters<Execute>[0]

/**
 * Autonomous execution namespace for llmz-powered AI agents.
 * Provides type-safe, context-aware execution with OpenTelemetry instrumentation.
 */
export namespace Autonomous {
  // Re-export useful types and classes from llmz
  export type Model = Extract<Parameters<CognitiveBeta['generateText']>['0']['model'], string>

  export type Iteration = InstanceType<typeof LlmzIteration>
  export type ExecuteResult = Awaited<ReturnType<Execute>>

  export type Trace =
    | _Traces.AbortTrace
    | _Traces.YieldTrace
    | _Traces.Comment
    | _Traces.Log
    | _Traces.ToolCall
    | _Traces.ToolSlow
    | _Traces.ThinkSignal
    | _Traces.PropertyMutation
    | _Traces.CodeExecution
    | _Traces.CodeExecutionException
    | _Traces.LLMCallStart
    | _Traces.LLMCallSuccess
    | _Traces.InvalidCodeExceptionTrace

  export type IterationController = Parameters<NonNullable<LlmzExecutionProps['onIterationEnd']>>[1]

  export const Tool = LlmzTool
  export type Tool = InstanceType<typeof Tool>

  export const Component = LlmzComponent
  export type Component = InstanceType<typeof Component>

  export type Exit<T = unknown> = InstanceType<typeof LlmzExit<T>>
  export const Exit = LlmzExit

  export type Object = InstanceType<typeof LlmzObject>
  export const Object = LlmzObject

  export type Citation = _Citation

  export const ThinkSignal = _ThinkSignal
  export const SnapshotSignal = _SnapshotSignal
  export const CitationsManager = _CitationsManager

  export const ListenExit = _ListenExit
  export const ThinkExit = _ThinkExit
  export const DefaultExit = _DefaultExit

  export type Hooks = {
    onBeforeTool?: (event: {
      iteration: Iteration
      tool: InstanceType<typeof Autonomous.Tool>
      input: unknown
      controller: AbortController
    }) => Promise<{
      input?: unknown
    } | void>
    onAfterTool?: (event: {
      iteration: Iteration
      tool: InstanceType<typeof Autonomous.Tool>
      input: unknown
      output: unknown
      controller: AbortController
    }) => Promise<{
      output?: unknown
    } | void>

    onBeforeExecution?: (
      iteration: Iteration,
      controller: AbortController
    ) => Promise<{
      code?: string
    } | void>
    onExit?: <T = unknown>(result: LlmzExitResult<T>) => Promise<void> | void
    onTrace?: (props: { trace: Trace; iteration: number }) => void
    onIterationStart?: (
      iteration: Iteration,
      controller: AbortController,
      context: LlmzContext
    ) => Promise<void | Partial<LlmzIteration>> | void | Partial<LlmzIteration>
    onIterationEnd?: (iteration: Iteration, controller: IterationController) => void | Promise<void>
  }

  export type Props = {
    instructions: ValueOrGetter<string, LlmzContext>
    tools?: ValueOrGetter<Autonomous.Tool[], LlmzContext>
    objects?: ValueOrGetter<Autonomous.Object[], LlmzContext>
    exits?: ValueOrGetter<Autonomous.Exit[], LlmzContext>
    signal?: AbortSignal
    hooks?: Hooks
    temperature?: ValueOrGetter<number, LlmzContext>
    model?: ValueOrGetter<Model | Model[], LlmzContext>
    /**
     * The reasoning effort to use for models that support reasoning.
     * - "none": Disable reasoning (for models with optional reasoning)
     * - "low" | "medium" | "high": Fixed reasoning effort levels
     * - "dynamic": Let the provider automatically determine the reasoning effort
     * If not provided, the model will not use reasoning for models with optional reasoning.
     */
    reasoningEffort?: ValueOrGetter<'low' | 'medium' | 'high' | 'dynamic' | 'none', LlmzContext>
    knowledge?: BaseKnowledge[]
    /** Maximum number of iterations (loops). Defaults to 10. */
    iterations?: number
  }

  export type PropsWithMode = Props & {
    mode?: 'chat' | 'worker'
  }

  export type WorkerExecuteFn = (props: Autonomous.Props) => Promise<Autonomous.ExecuteResult>
  export type ConvoExecuteFn = (props: Autonomous.PropsWithMode) => Promise<Autonomous.ExecuteResult>

  export type FactoryOptions = {
    mode: 'chat' | 'worker'
    interruption?: AbortSignal
    defaultModel: Model | Model[]
  }

  /**
   * Creates a knowledge base search tool for the given knowledge bases.
   */
  export function createKnowledgeSearchTool(knowledgeBases: BaseKnowledge[]): InstanceType<typeof LlmzTool> {
    const description = knowledgeBases.map((kb) => `- "${kb.name}": ${kb.description || 'No description'}`).join('\n')

    return new LlmzTool({
      name: 'search_knowledge',
      description: `
Search the knowledge base for relevant information.
Here are the available knowledge bases and their descriptions:
${description}

Use this tool to find specific information from the knowledge bases.
Always prefer information from the knowledge bases over general knowledge when available.
If the question is not related to the knowledge bases, do NOT use this tool.`.trim(),
      input: z.string().describe('The query to search for.').min(1).max(1024),
      output: z.string().describe('The search results.'),
      handler: async (query: string) => {
        const citations = context.get('citations')

        // Search all knowledge bases in parallel
        const results = await Promise.all(knowledgeBases.map((kb) => kb.search(query)))
        const allPassages = results.flatMap((r) => r.passages)

        if (!allPassages.length) {
          throw new ThinkSignal(
            'No results were found',
            'No results were found in the knowledge bases. You can try rephrasing your question or asking something else. Do NOT answer the question as no results were found.'
          )
        }

        // Build formatted response with citations
        const message: string[] = [
          'Here are the search results from the knowledge base that might be relevant, formatted with citations:',
        ]
        const { tag: example } = citations.registerSource({})

        for (const p of allPassages) {
          const { tag } = citations.registerSource(p.metadata)
          message.push(`<${tag} file="${p.metadata.file || ''}" title="${p.metadata.title || p.metadata.file || ''}">`)
          message.push(p.content)
          message.push(`</${tag}>`)
        }

        throw new ThinkSignal(
          `We got the search results. When answering the question, you MUST add inline the citations used (eg: "Yes, the price is $10${example} ...")`,
          message.join('\n').trim()
        )
      },
    })
  }

  /**
   * @internal
   * Factory method that creates a context-bound and OTEL-instrumented execute function.
   * This is used internally by conversations and workflows.
   */
  export function createExecute(options: FactoryOptions): ConvoExecuteFn {
    return async (props: PropsWithMode): Promise<Autonomous.ExecuteResult> => {
      const mode = props.mode || options.mode
      const cognitive = context.get('cognitive')
      const conversationId = getActiveConversationId()

      if (!cognitive) {
        throw new Error('Cognitive client is not available in this context. Make sure to run in a cognitive context.')
      }

      const defaultTemperature = 0.7
      const maxLoops = _.clamp(props.iterations ?? 10, 1, 100)

      return span(
        'autonomous.execution',
        {
          'autonomous.max_loops': maxLoops,
          'autonomous.message_types': ['text', 'image'],
          'autonomous.mode': mode,
          ...(conversationId ? { conversationId } : {}),
        },
        async (execSpan) => {
          const joinedSignal = createJoinedAbortSignal([props.signal, options.interruption])

          const llmz_execute = (await import('@holocronlab/botruntime-llmz')).execute
          const asyncResource = new AsyncResource('autonomous.execution')

          const getNewIteration = (index: number) =>
            createSpan(
              'autonomous.iteration',
              {
                'autonomous.iteration': index,
                ...(conversationId ? { conversationId } : {}),
              },
              { parentContext: execSpan.ctx }
            )

          let iterationSpan: TypedSpan<'autonomous.iteration'> | undefined

          const _originalCtx = context.getAll()
          const bindContext =
            // oxlint-disable-next-line no-explicit-any -- Generic constraint requires any[] for variadic args
            <TArgs extends any[], TReturn>(fn: (...props: TArgs) => TReturn) =>
              (...props: TArgs): TReturn =>
                contextManager.with(iterationSpan?.ctx ?? execSpan.ctx, () =>
                  context.run(_originalCtx, () => fn(...props))
                )

          // Get chat if in chat mode
          const _chat = mode === 'chat' ? context.get('chat') : undefined

          if (mode === 'chat' && !_chat) {
            throw new Error('Chat is not available in this context. Make sure to run in chat mode with a chat context.')
          }

          // Bind chat components to the current context if in chat mode
          const chat = _chat
            ? ({
                components: bindContext((ctx) => getValue(_chat.components, ctx)),
                transcript: bindContext((ctx) => getValue(_chat.transcript, ctx)),
                handler: bindContext(_chat.handler),
                onExecutionDone: bindContext(_chat.onExecutionDone),
              } satisfies LlmzChat)
            : undefined

          const search_knowledge = props.knowledge?.length ? createKnowledgeSearchTool(props.knowledge) : undefined

          const execution = await llmz_execute({
            temperature: async (ctx) =>
              props.temperature ? await getValue(props.temperature, ctx) : defaultTemperature,
            // oxlint-disable-next-line no-explicit-any -- llmz context type mismatch
            model: async (ctx: any) => (props.model ? await getValue(props.model, ctx) : options.defaultModel),
            ...(props.reasoningEffort && { reasoningEffort: props.reasoningEffort }),
            options: { loop: maxLoops },

            // oxlint-disable-next-line no-explicit-any -- Cognitive type mismatch with llmz client param
            client: cognitive as any,
            ...(chat && { chat }),

            instructions: async (ctx) => {
              iterationSpan = getNewIteration(ctx.iteration)
              contextManager.enterWith(iterationSpan.ctx)

              let instructions = (await getValue(props.instructions, ctx)) ?? ''

              // Append knowledge base instructions if knowledge bases are provided
              if (search_knowledge && props.knowledge && props.knowledge.length > 0) {
                const kbNames = props.knowledge.map((kb) => kb.name).join(', ')
                const knowledgeInstructions = `

## Knowledge Bases

You have access to the following knowledge bases: ${kbNames}.
Use the "${search_knowledge.name}" tool to search for relevant information when the user asks questions that might be answered by these knowledge bases.
Always prefer information from the knowledge bases over general knowledge when available.`
                instructions += knowledgeInstructions
              }

              iterationSpan.setAttributes({
                'autonomous.instructions': instructions,
                'autonomous.exits': props.exits ? globalThis.Object.keys(props.exits) : undefined,
              })

              return instructions
            },

            ...(props.objects && {
              objects: async (ctx) => {
                const objs = (await getValue(props.objects!, ctx)) ?? []

                iterationSpan?.setAttribute('autonomous.objects', objs.map((o) => o.name).join(', '))

                for (const obj of objs) {
                  obj.tools =
                    obj.tools?.map((tool) =>
                      tool.clone({
                        handler: bindContext((args, ctx) => {
                          // oxlint-disable-next-line no-explicit-any -- Error requires any for dynamic property access (constructor.name, HandledErrorProp)
                          let err: any | null = null
                          const result = span(
                            'autonomous.tool',
                            {
                              'autonomous.tool.object': obj.name,
                              'autonomous.tool.name': tool.name,
                              'autonomous.tool.input': args,
                              ...(conversationId ? { conversationId } : {}),
                            },
                            async (s) => {
                              const value = await tool.execute(args, ctx).catch((e) => {
                                err = e
                                if (
                                  err &&
                                  err?.constructor &&
                                  err?.constructor?.name &&
                                  err?.constructor?.name === 'ThinkSignal'
                                ) {
                                  s.setAttributes({
                                    'autonomous.tool.status': 'think',
                                    'autonomous.tool.output':
                                      typeof err.context === 'string'
                                        ? err.context.slice(0, 500)
                                        : err.reason || err.message || 'ThinkSignal',
                                  })

                                  s.setStatus({
                                    code: SpanStatusCode.UNSET,
                                    message: 'ThinkSignal',
                                  })

                                  // Set the span error has already handled so it doesn't get mark as failed
                                  err[HandledErrorProp] = true
                                  throw err
                                } else {
                                  s.setAttributes({
                                    'autonomous.tool.status': 'error',
                                    'autonomous.tool.error': err.message,
                                  })
                                  s.setStatus({
                                    code: SpanStatusCode.ERROR,
                                    message: err.message,
                                  })
                                  s.recordException(err)
                                  throw err
                                }
                              })

                              s.setAttributes({
                                'autonomous.tool.output': typeof value === 'string' ? value : JSON.stringify(value),
                                'autonomous.tool.status': 'success',
                              })
                              return value
                            }
                          )

                          if (err) {
                            throw err
                          }

                          return result
                        }),
                      })
                    ) ?? []
                }

                return objs
              },
            }),

            ...((props.tools || props.knowledge) && {
              tools: async (ctx) => {
                const tools = props.tools ? await getValue(props.tools, ctx) : []

                // Add knowledge search tool if knowledge bases are provided
                const allTools = [...(tools ?? [])]
                if (search_knowledge) {
                  allTools.push(search_knowledge)
                }

                iterationSpan?.setAttribute('autonomous.tools', allTools?.map((t) => t.name).join(', '))

                return allTools.map((tool) =>
                  tool.clone({
                    handler: bindContext((args, ctx) => {
                      // oxlint-disable-next-line no-explicit-any -- Error requires any for dynamic property access (constructor.name, HandledErrorProp)
                      let err: any | null = null
                      const result = span(
                        'autonomous.tool',
                        {
                          'autonomous.tool.name': tool.name,
                          'autonomous.tool.input': args,
                          ...(conversationId ? { conversationId } : {}),
                        },
                        async (s) => {
                          const value = await tool.execute(args, ctx).catch((e) => {
                            err = e
                            if (
                              err &&
                              err?.constructor &&
                              err?.constructor?.name &&
                              err?.constructor?.name === 'ThinkSignal'
                            ) {
                              s.setAttributes({
                                'autonomous.tool.status': 'think',
                                'autonomous.tool.output':
                                  typeof err.context === 'string'
                                    ? err.context.slice(0, 500)
                                    : err.reason || err.message || 'ThinkSignal',
                              })

                              s.setStatus({
                                code: SpanStatusCode.UNSET,
                                message: 'ThinkSignal',
                              })

                              // Set the span error has already handled so it doesn't get mark as failed
                              err[HandledErrorProp] = true
                              throw err
                            } else {
                              s.setAttributes({
                                'autonomous.tool.status': 'error',
                                'autonomous.tool.error': err.message,
                              })
                              s.setStatus({
                                code: SpanStatusCode.ERROR,
                                message: err.message,
                              })
                              s.recordException(err)
                              throw err
                            }
                          })

                          s.setAttributes({
                            'autonomous.tool.output': typeof value === 'string' ? value : JSON.stringify(value),
                            'autonomous.tool.status': 'success',
                          })
                          return value
                        }
                      )

                      if (err) {
                        throw err
                      }

                      return result
                    }),
                  })
                )
              },
            }),

            ...(props.exits && { exits: props.exits }),
            ...(joinedSignal && { signal: joinedSignal }),

            ...(props.hooks?.onBeforeTool && {
              onBeforeTool: asyncResource.bind(props.hooks.onBeforeTool),
            }),
            ...(props.hooks?.onIterationStart && {
              onIterationStart: asyncResource.bind(props.hooks.onIterationStart),
            }),
            ...(props.hooks?.onAfterTool && {
              onAfterTool: asyncResource.bind(props.hooks.onAfterTool),
            }),
            ...(props.hooks?.onBeforeExecution && {
              onBeforeExecution: asyncResource.bind(props.hooks.onBeforeExecution),
            }),
            ...(props.hooks?.onExit && {
              onExit: asyncResource.bind(props.hooks.onExit),
            }),
            onTrace: ({ trace, iteration }) => {
              if (trace.type === 'code_execution') {
              } else if (trace.type === 'llm_call_started') {
              } else if (trace.type === 'llm_call_success') {
                iterationSpan?.setAttribute('autonomous.code', trace.code)
              } else if (trace.type === 'property') {
                iterationSpan?.addEvent('property', {
                  type: trace.type,
                  'property.object': trace.object,
                  'property.name': trace.property,
                  'property.value': trace.value,
                })
              }
              if (props.hooks?.onTrace) {
                return asyncResource.runInAsyncScope(() => props.hooks!.onTrace!({ trace, iteration }))
              }
            },
            onIterationEnd: async (iteration, controller) => {
              iterationSpan?.setAttributes({
                'autonomous.status': iteration.status.type,
                'ai.cost': iteration.llm?.spend,
                'ai.tokens': iteration.llm?.tokens,
                'ai.model': iteration.llm?.model,
              })

              if (iteration.isFailed()) {
                let message = iteration.error || 'Iteration failed'

                if (iteration.status.type === 'aborted') {
                  message = `Iteration was aborted: ${iteration.status.aborted.reason}`
                } else if (iteration.status.type === 'generation_error') {
                  message = `Iteration failed during generation: ${iteration.status.generation_error.message}`
                } else if (iteration.status.type === 'execution_error') {
                  message = `Iteration failed during execution: ${iteration.status.execution_error.message}.\n${iteration.status.execution_error.stack}`
                } else if (iteration.status.type === 'exit_error') {
                  message = `Iteration failed to exit through "${iteration.status.exit_error.exit}" exit: ${iteration.status.exit_error.message}. Exit value: ${JSON.stringify(
                    iteration.status.exit_error.return_value
                  )}`
                } else if (iteration.status.type === 'invalid_code_error') {
                  message = `Iteration failed due to invalid code: ${iteration.status.invalid_code_error.message}`
                }

                iterationSpan?.recordException(iteration.error ?? new Error(message))

                iterationSpan?.setStatus({
                  code: SpanStatusCode.ERROR,
                  message,
                })
              } else if (iteration.hasExited()) {
                iterationSpan?.setAttributes({
                  'autonomous.exit.name': iteration.status.exit_success.exit_name,
                  // oxlint-disable-next-line no-explicit-any -- OTEL setAttribute requires any for dynamic return values
                  'autonomous.exit.value': iteration.status.exit_success.return_value as any,
                })

                iterationSpan?.setStatus({
                  code: SpanStatusCode.OK,
                  message: `Exited through "${iteration.status.exit_success.exit_name}" exit.`,
                })
              } else if (iteration.isSuccessful()) {
                iterationSpan?.setStatus({
                  code: SpanStatusCode.OK,
                  message: 'Iteration completed successfully.',
                })
              }

              iterationSpan?.end()

              if (props.hooks?.onIterationEnd) {
                return await asyncResource.runInAsyncScope(() => props.hooks!.onIterationEnd!(iteration, controller))
              }
            },
          })

          execSpan.setAttribute('autonomous.execution_id', execution.context.id)

          return execution
        }
      )
    }
  }
}
