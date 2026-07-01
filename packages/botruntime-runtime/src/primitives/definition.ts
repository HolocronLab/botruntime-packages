import type { JSONSchema7 } from '@holocronlab/botruntime-zui'
import { z } from '@holocronlab/botruntime-sdk'
import { DataSourceBase } from './data-sources'

export namespace Definitions {
  export type PrimitiveDefinition =
    | ConversationDefinition
    | WorkflowDefinition
    | KnowledgeDefinition
    | TriggerDefinition
    | ActionDefinition
    | TableDefinition
    | CustomComponentDefinition

  export interface Primitive {
    getDefinition(): PrimitiveDefinition
  }

  export type ConversationDefinition = {
    type: 'conversation'
    channel: string | string[]
    /**
     * Array of event names this conversation listens to.
     * Only events with conversationId property are routable to conversations.
     * Undefined or empty means no events (only messages).
     */
    events?: string[]
    description?: string
    /** Whether this conversation has lifecycle management (nudge/expiration) configured */
    hasLifecycle?: boolean
  }

  export type WorkflowDefinition = {
    type: 'workflow'
    name: string
    description?: string
    input?: JSONSchema7
    output?: JSONSchema7
    state?: JSONSchema7
    schedule?: string
    timeout: number
  }

  export type KnowledgeDefinition = {
    type: 'knowledge'
    name: string
    description?: string
    sources: DataSourceBase[]
  }

  export type TriggerDefinition = {
    type: 'trigger'
    name: string
    description?: string
    state?: JSONSchema7
    events: string[]
  }

  export type ActionDefinition = {
    type: 'action'
    name: string
    title?: string
    description?: string
    attributes?: Record<string, string>
    input?: JSONSchema7
    output?: JSONSchema7
    cached?: boolean
  }

  export type TableDefinition = {
    type: 'table'
    name: string
    schema: JSONSchema7
    factor: number
    keyColumn?: string
    tags?: Record<string, string>
    description?: string
  }

  export type CustomComponentDefinition = {
    type: 'customComponent'
    name: string
  }

  const conversationDefinitionSchema = z.object({
    type: z.literal('conversation'),
    channel: z.union([
      z
        .string()
        .min(1, 'Channel must be a non-empty string')
        .max(255, 'Channel must be less than 255 characters')
        .regex(/^(\*|[a-zA-Z0-9._-]+)$/, "Channel must be a valid identifier or glob '*'"),
      z.array(
        z
          .string()
          .min(1, 'Channel must be a non-empty string')
          .max(255, 'Channel must be less than 255 characters')
          .regex(/^[a-zA-Z0-9._-]+$/, 'Channel must be a valid identifier')
      ),
    ]),
  })

  const workflowDefinitionSchema = z.object({
    type: z.literal('workflow'),
    name: z
      .string()
      .min(1, 'Name must be a non-empty string')
      .max(255, 'Name must be less than 255 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be a valid identifier'),
  })

  const knowledgeDefinitionSchema = z.object({
    type: z.literal('knowledge'),
    name: z
      .string()
      .min(1, 'Name must be a non-empty string')
      .max(255, 'Name must be less than 255 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be a valid identifier'),
  })

  const triggerDefinitionSchema = z.object({
    type: z.literal('trigger'),
    name: z
      .string()
      .min(1, 'Name must be a non-empty string')
      .max(255, 'Name must be less than 255 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be a valid identifier'),
  })

  const actionDefinitionSchema = z.object({
    type: z.literal('action'),
    name: z
      .string()
      .min(1, 'Name must be a non-empty string')
      .max(255, 'Name must be less than 255 characters')
      .regex(/^[a-zA-Z][a-zA-Z0-9]*$/, 'Name must be alphanumeric with no special characters'),
    title: z.string().optional(),
    description: z.string().optional(),
    attributes: z.record(z.string()).optional(),
    input: z.any().optional(), // JSONSchema7
    output: z.any().optional(), // JSONSchema7
    cached: z.boolean().optional(),
  })

  const tableDefinitionSchema = z.object({
    type: z.literal('table'),
    name: z
      .string()
      .min(1, 'Name must be a non-empty string')
      .max(255, 'Name must be less than 255 characters')
      .regex(/^[a-zA-Z0-9_-]+$/, 'Name must be a valid identifier'),
  })

  const customComponentDefinitionSchema = z.object({
    type: z.literal('customComponent'),
    name: z.string().min(1, 'Name must be a non-empty string').max(255, 'Name must be less than 255 characters'),
  })

  export function isConversationDefinition(value: unknown): value is ConversationDefinition {
    return conversationDefinitionSchema.safeParse(value).success
  }

  export function isWorkflowDefinition(value: unknown): value is WorkflowDefinition {
    return workflowDefinitionSchema.safeParse(value).success
  }

  export function isKnowledgeDefinition(value: unknown): value is KnowledgeDefinition {
    return knowledgeDefinitionSchema.safeParse(value).success
  }

  export function isTriggerDefinition(value: unknown): value is TriggerDefinition {
    return triggerDefinitionSchema.safeParse(value).success
  }

  export function isActionDefinition(value: unknown): value is ActionDefinition {
    return actionDefinitionSchema.safeParse(value).success
  }

  export function isTableDefinition(value: unknown): value is TableDefinition {
    return tableDefinitionSchema.safeParse(value).success
  }

  export function isCustomComponentDefinition(value: unknown): value is CustomComponentDefinition {
    return customComponentDefinitionSchema.safeParse(value).success
  }

  export function isValidDefinition(value: unknown): value is PrimitiveDefinition {
    return (
      isConversationDefinition(value) ||
      isWorkflowDefinition(value) ||
      isKnowledgeDefinition(value) ||
      isTriggerDefinition(value) ||
      isActionDefinition(value) ||
      isTableDefinition(value) ||
      isCustomComponentDefinition(value)
    )
  }

  /**
   * Extracts the definition from a class that implements the Primitive interface.
   * If the class does not implement the interface or the definition is invalid,
   * it returns undefined.
   *
   * @param maybeClass - The object to check for a Primitive definition.
   * @returns The definition if valid, otherwise undefined.
   */
  export function getDefinition(maybeClass: unknown) {
    if (
      typeof maybeClass !== 'object' ||
      maybeClass === null ||
      !('getDefinition' in maybeClass) ||
      typeof maybeClass.getDefinition !== 'function'
    ) {
      return undefined
    }

    try {
      const definition = maybeClass.getDefinition()
      if (typeof definition !== 'object' || definition === null) {
        return undefined
      }

      if (isValidDefinition(definition)) {
        return definition
      }
    } catch {}

    return undefined
  }
}
