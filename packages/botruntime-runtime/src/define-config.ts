import { Autonomous } from './runtime/autonomous'
import type { ZodType } from '@holocronlab/botruntime-zui'
import { z } from '@holocronlab/botruntime-sdk'
import { validateTagDefinitions } from './utilities/validate-tag-name'
import { validateEventDefinitions } from './utilities/validate-event-name'
import { validateSecretDefinitions } from './utilities/validate-secret-name'

const zuiSchema = z.custom<ZodType>(
  (val) => {
    if (typeof val === 'object' && val !== null && 'parse' in val) {
      return true
    }
    return false
  },
  {
    message: 'Invalid ZUI Schema, must be an instance of z.object()',
  }
)

// Model type matching runtime/autonomous
const modelSchema = z.custom<Autonomous.Model | Autonomous.Model[]>(
  (val) =>
    (typeof val === 'string' && val.length > 0) ||
    (Array.isArray(val) && val.every((m) => typeof m === 'string' && m.length > 0)),
  {
    message: 'Model must be a non-empty string, or an array of non-empty strings',
  }
)

const tagDefinitionSchema = z.record(
  z.string(),
  z.object({
    title: z.string(),
    description: z.string().optional(),
  })
)

const eventDefinitionSchema = z.record(
  z.string(),
  z.object({
    schema: zuiSchema.optional(),
    description: z.string().optional(),
  })
)

const configSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    user: z
      .object({
        state: zuiSchema.optional(),
        tags: tagDefinitionSchema.optional(),
      })
      .optional(),
    bot: z
      .object({
        state: zuiSchema.optional(),
        tags: tagDefinitionSchema.optional(),
      })
      .optional(),
    conversation: z
      .object({
        tags: tagDefinitionSchema.optional(),
      })
      .optional(),
    message: z
      .object({
        tags: tagDefinitionSchema.optional(),
      })
      .optional(),
    workflow: z
      .object({
        tags: tagDefinitionSchema.optional(),
      })
      .optional(),
    configuration: z
      .object({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Zui internal type
        schema: z.custom<z.ZodObject<any>>(
          (val) => {
            if (typeof val === 'object' && val !== null && 'parse' in val && '_def' in val) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any -- accessing Zui internal _def
              return (val as any)._def?.typeName === 'ZodObject'
            }
            return false
          },
          {
            message: 'Configuration schema must be a z.object()',
          }
        ),
      })
      .optional(),
    defaultModels: z
      .object({
        zai: modelSchema,
        autonomous: modelSchema,
      })
      .optional()
      .transform((val) => ({
        zai: val?.zai ?? 'auto',
        autonomous: val?.autonomous ?? 'auto',
      })),
    secrets: z
      .record(
        z.string(),
        z.object({
          optional: z.boolean().optional(),
          description: z.string().optional(),
        })
      )
      .optional(),
    events: eventDefinitionSchema.optional(),
    evals: z
      .object({
        idleTimeout: z.number().positive().optional(),
        /** @deprecated Compatibility no-op: the LLM judge returns a boolean verdict, not a score. */
        judgePassThreshold: z.number().int().min(1).max(5).optional(),
        /** Model to use for llm_judge assertions (e.g. 'openai:gpt-4o'). Defaults to 'fast'. */
        judgeModel: z.string().optional(),
      })
      .optional(),
  })
  .passthrough()

type AgentConfigProps = z.input<typeof configSchema>
export type AgentConfig = z.output<typeof configSchema> & {
  __brand: 'AgentConfig'
}

export type TagDefinition = Record<string, { title: string; description?: string }>
export type EventDefinition = Record<string, { schema?: ZodType; description?: string }>

const AGENT_CONFIG_BRAND = Symbol.for('@holocronlab/botruntime-runtime/AgentConfig')

export const defineConfig = (config: AgentConfigProps): AgentConfig => {
  const parsed = configSchema.parse(config)

  // Validate all tag names
  if (parsed.bot?.tags) {
    validateTagDefinitions(parsed.bot.tags, 'bot.tags')
  }
  if (parsed.user?.tags) {
    validateTagDefinitions(parsed.user.tags, 'user.tags')
  }
  if (parsed.conversation?.tags) {
    validateTagDefinitions(parsed.conversation.tags, 'conversation.tags')
  }
  if (parsed.message?.tags) {
    validateTagDefinitions(parsed.message.tags, 'message.tags')
  }
  if (parsed.workflow?.tags) {
    validateTagDefinitions(parsed.workflow.tags, 'workflow.tags')
  }

  // Validate event names
  if (parsed.events) {
    validateEventDefinitions(parsed.events, 'events')
  }

  // Validate secret names
  if (parsed.secrets) {
    validateSecretDefinitions(parsed.secrets, 'secrets')
  }

  return {
    ...parsed,
    __brand: 'AgentConfig' as const,
    [AGENT_CONFIG_BRAND]: true,
  } as AgentConfig
}

export const isAgentConfig = (value: unknown): value is AgentConfig => {
  return (
    typeof value === 'object' && value !== null && AGENT_CONFIG_BRAND in value && value[AGENT_CONFIG_BRAND] === true
  )
}
