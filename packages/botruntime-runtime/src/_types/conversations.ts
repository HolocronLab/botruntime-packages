import type {
  ConversationDefinitions as CD,
  ConversationRoutableEvents as CRE,
} from '@holocronlab/botruntime-runtime/_types/conversations'

type PreCodegenConversationDefinition = {
  channel: string
  state: Record<string, unknown>
  tags: Record<string, string | undefined>
  messageTags: Record<string, string | undefined>
  messages: Record<string, unknown>
  events: Record<string, unknown>
}

// A published runtime package is usable before project codegen augments this
// virtual module. Falling back to never makes BaseConversationInstance.send()
// accept no messages at all, forcing consumers to cast during initial authoring.
export type ConversationDefinitions = [CD] extends [never]
  ? Record<string, PreCodegenConversationDefinition>
  : CD

/**
 * Events that can be routed to conversations (events with conversationId property).
 * Keyed by channel, containing only the event names that have conversationId.
 */
export type ConversationRoutableEvents = CRE extends never ? never : CRE

export type ConversationStates = {
  [K in keyof ConversationDefinitions]: ConversationDefinitions[K]['state']
}

export type ConversationChannels = {
  [K in keyof ConversationDefinitions]: ConversationDefinitions[K]['channel']
}
