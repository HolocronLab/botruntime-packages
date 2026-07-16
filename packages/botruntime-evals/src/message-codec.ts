import type { Message } from '@holocronlab/botruntime-chat'

export type PlatformMessageEnvelope = {
  type: string
  payload: Record<string, unknown>
}

type RuntimeBlocItem = {
  type: string
  payload: Record<string, unknown>
}

/** Convert the chat SDK discriminated union to the platform storage envelope. */
export function chatPayloadToPlatformMessage(payload: Message['payload']): PlatformMessageEnvelope {
  const { type, ...content } = payload
  if (type !== 'bloc') return { type, payload: content }

  return {
    type,
    payload: {
      ...content,
      items: payload.items.map((item) => {
        const { type: itemType, ...itemPayload } = item
        return { type: itemType, payload: itemPayload }
      }),
    },
  }
}

/** Convert a platform storage envelope to the chat SDK discriminated union. */
export function platformMessageToChatPayload(message: PlatformMessageEnvelope): Message['payload'] {
  const { type, payload } = message
  if (type !== 'bloc') return { ...payload, type } as Message['payload']

  const items = Array.isArray(payload.items) ? (payload.items as RuntimeBlocItem[]) : []
  return {
    ...payload,
    type: 'bloc',
    items: items.map((item) => ({
      ...item.payload,
      type: item.type,
    })) as Extract<Message['payload'], { type: 'bloc' }>['items'],
  }
}
