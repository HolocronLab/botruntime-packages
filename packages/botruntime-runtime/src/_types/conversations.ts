import type {
  ConversationDefinitions as CD,
  ConversationRoutableEvents as CRE,
} from '@holocronlab/botruntime-runtime/_types/conversations'

export type ConversationDefinitions = CD extends never ? never : CD

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
