import { describe, expect, it, vi } from 'vitest'
import type { Client } from '@holocronlab/botruntime-client'
import { createNativeEvalChatClient } from './native-chat-client'
import { ChatSession } from './client'

describe('native eval chat client', () => {
  it('uses synthetic platform messages and polls ordinary outgoing messages', async () => {
    const messages: Array<Record<string, unknown>> = []
    const client = {
      getBot: vi.fn(async () => {
        throw new Error('native transport must not discover a chat webhook')
      }),
      createUser: vi.fn(async () => ({ user: { id: 'u_eval' } })),
      createConversation: vi.fn(async () => ({
        conversation: { id: 'c_eval' },
      })),
      createMessage: vi.fn(async (input: Record<string, unknown>) => ({
        message: { id: 'm_in', direction: 'incoming', ...input },
      })),
      listMessages: vi.fn(async () => ({ messages, meta: {} })),
    } as unknown as Client

    const connected = await createNativeEvalChatClient(client).connect({
      webhookId: '',
    })
    const { conversation } = await connected.createConversation({})
    expect(client.createConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'eval',
        integrationName: 'botruntime/eval',
      })
    )

    const listener = await connected.listenConversation({
      id: conversation.id,
    })
    const received = vi.fn()
    listener.on('message_created', received)
    await connected.createMessage({
      conversationId: conversation.id,
      payload: { type: 'text', text: 'hello' },
    })
    expect(client.createMessage).toHaveBeenCalledWith({
      conversationId: 'c_eval',
      userId: 'u_eval',
      type: 'text',
      payload: { text: 'hello' },
      tags: {},
      origin: 'synthetic',
    })

    await connected.createMessage({
      conversationId: conversation.id,
      payload: {
        type: 'bloc',
        items: [
          { type: 'text', text: 'documents' },
          { type: 'image', imageUrl: 'https://files.test/image.jpg' },
          { type: 'file', fileUrl: 'https://files.test/document.pdf', title: 'document.pdf' },
        ],
      },
    })
    expect(client.createMessage).toHaveBeenLastCalledWith({
      conversationId: 'c_eval',
      userId: 'u_eval',
      type: 'bloc',
      payload: {
        items: [
          { type: 'text', payload: { text: 'documents' } },
          { type: 'image', payload: { imageUrl: 'https://files.test/image.jpg' } },
          {
            type: 'file',
            payload: { fileUrl: 'https://files.test/document.pdf', title: 'document.pdf' },
          },
        ],
      },
      tags: {},
      origin: 'synthetic',
    })

    messages.push({
      id: 'm_out',
      createdAt: '2026-07-15T00:00:00.000Z',
      direction: 'outgoing',
      conversationId: 'c_eval',
      userId: 'u_eval',
      type: 'text',
      payload: { text: 'reply' },
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm_out',
        isBot: true,
        payload: { type: 'text', text: 'reply' },
      })
    )

    messages.push({
      id: 'm_bloc_out',
      createdAt: '2026-07-15T00:00:01.000Z',
      direction: 'outgoing',
      conversationId: 'c_eval',
      userId: 'u_eval',
      type: 'bloc',
      payload: {
        items: [
          { type: 'text', payload: { text: 'reply' } },
          { type: 'image', payload: { imageUrl: 'https://files.test/reply.jpg' } },
        ],
      },
    })
    await new Promise((resolve) => setTimeout(resolve, 120))
    expect(received).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'm_bloc_out',
        isBot: true,
        payload: {
          type: 'bloc',
          items: [
            { type: 'text', text: 'reply' },
            { type: 'image', imageUrl: 'https://files.test/reply.jpg' },
          ],
        },
      })
    )
    await listener.disconnect()

    const session = new ChatSession(client, 'runtime-bot', undefined, undefined, createNativeEvalChatClient(client))
    await session.connect()
    expect(client.getBot).not.toHaveBeenCalled()
    await session.disconnect()
  })
})
