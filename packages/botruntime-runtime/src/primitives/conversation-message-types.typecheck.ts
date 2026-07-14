import type { MessagePayloadFor, MessageTypeFor } from './conversation-message-types'

type GeneratedConversationDefinitions = {
  'telegram.message': {
    messages: {
      text: { text: string }
      image: { url: string }
    }
  }
  'slack.message': {
    messages: {
      markdown: { markdown: string }
      image: { src: string }
    }
  }
}

type AnyGeneratedChannel = keyof GeneratedConversationDefinitions
type AnyGeneratedMessage = MessageTypeFor<GeneratedConversationDefinitions, AnyGeneratedChannel>

declare const sendFromGet: <M extends AnyGeneratedMessage>(message: {
  type: M
  payload: MessagePayloadFor<GeneratedConversationDefinitions, AnyGeneratedChannel, M>
}) => void

// BaseConversationInstance.get() returns the unparameterized channel union.
// Each channel-only message must stay sendable instead of collapsing to never.
sendFromGet({ type: 'text', payload: { text: 'hello' } })
sendFromGet({ type: 'markdown', payload: { markdown: '*hello*' } })
sendFromGet({ type: 'image', payload: { url: 'https://example.com/image.png' } })
sendFromGet({ type: 'image', payload: { src: 'https://example.com/image.png' } })

// @ts-expect-error unknown messages remain rejected after distributing the union
sendFromGet({ type: 'audio', payload: {} })
// @ts-expect-error a known message still requires its generated payload
sendFromGet({ type: 'text', payload: { markdown: 'wrong channel payload' } })

// A bot without declared conversations generates ConversationDefinitions = {}.
// get(id) must remain useful for sending to an already persisted conversation.
type EmptyGeneratedDefinitions = {}
type EmptyGeneratedChannel = keyof EmptyGeneratedDefinitions
declare const sendFromGetWithoutDefinitions: <M extends MessageTypeFor<EmptyGeneratedDefinitions, EmptyGeneratedChannel>>(
  message: {
    type: M
    payload: MessagePayloadFor<EmptyGeneratedDefinitions, EmptyGeneratedChannel, M>
  }
) => void

sendFromGetWithoutDefinitions({ type: 'text', payload: { text: 'hello' } })
