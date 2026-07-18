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
        metadata: { source: 'fixture' },
        items: [
          { type: 'text', text: 'documents' },
          { type: 'image', imageUrl: 'https://files.test/image.jpg' },
          { type: 'file', fileUrl: 'https://files.test/document.pdf', title: 'document.pdf' },
        ],
      } as never,
    })
    expect(client.createMessage).toHaveBeenLastCalledWith({
      conversationId: 'c_eval',
      userId: 'u_eval',
      type: 'bloc',
      payload: {
        metadata: { source: 'fixture' },
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
        metadata: { source: 'runtime' },
        items: [
          { type: 'text', payload: { type: 'image', text: 'reply' } },
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
          metadata: { source: 'runtime' },
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

  it('reattaches a durable eval session without creating another user or conversation', async () => {
    const listener = {
      on: vi.fn(),
      off: vi.fn(),
      disconnect: vi.fn(async () => undefined),
    }
    const client = {
      createUser: vi.fn(async () => ({ user: { id: 'u_eval' } })),
      getUser: vi.fn(async () => ({ user: { id: 'u_eval' } })),
      createConversation: vi.fn(async () => ({ conversation: { id: 'c_eval' } })),
      listMessages: vi.fn(async () => ({ messages: [], meta: {} })),
    } as unknown as Client
    const chatClient = createNativeEvalChatClient(client)

    const first = new ChatSession(client, 'runtime-bot', undefined, undefined, chatClient)
    await first.connect()
    expect(await first.ensureConversation()).toBe('c_eval')
    await first.disconnect()

    const resumed = new ChatSession(client, 'runtime-bot', undefined, undefined, chatClient)
    await resumed.connect({ userId: 'u_eval', conversationId: 'c_eval' })

    expect(resumed.userId).toBe('u_eval')
    expect(resumed.activeConversationId).toBe('c_eval')
    expect(client.createUser).toHaveBeenCalledOnce()
    expect(client.getUser).toHaveBeenCalledWith({ id: 'u_eval' })
    expect(client.createConversation).toHaveBeenCalledOnce()
    await resumed.disconnect()
  })

  it('recovers an already-dispatched native turn by stable effect id', async () => {
    const messages = [
      {
        id: 'm_out',
        createdAt: '2026-07-15T00:00:01.000Z',
        direction: 'outgoing',
        conversationId: 'c_eval',
        userId: 'u_eval',
        type: 'text',
        payload: { text: 'recovered reply' },
      },
    ]
    const client = {
      getOrCreateUser: vi.fn(async () => ({ user: { id: 'u_eval' }, meta: { created: false } })),
      getOrCreateConversation: vi.fn(async () => ({ conversation: { id: 'c_eval' }, meta: { created: false } })),
      getOrCreateMessage: vi.fn(async () => ({
        message: {
          id: 'm_in',
          createdAt: '2026-07-15T00:00:00.000Z',
          direction: 'incoming',
          conversationId: 'c_eval',
          userId: 'u_eval',
        },
        meta: { created: false },
      })),
      listMessages: vi.fn(async () => ({ messages, meta: {} })),
    } as unknown as Client
    const session = new ChatSession(client, 'runtime-bot', undefined, undefined, createNativeEvalChatClient(client))

    await session.connect({ effectId: 'eval:run:user' })
    await session.ensureConversation('eval:run:conversation:0')
    session.startTurn()
    await session.sendMessage('hello', 'eval:run:turn:0:message')
    await session.resumeTurn(Date.parse('2026-07-15T00:00:00.000Z'))

    expect(session.getTurnResponses()).toEqual(['recovered reply'])
    expect(client.getOrCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { id: 'eval:run:user' }, discriminateByTags: ['id'] })
    )
    expect(client.getOrCreateConversation).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { id: 'eval:run:conversation:0' }, discriminateByTags: ['id'] })
    )
    expect(client.getOrCreateMessage).toHaveBeenCalledWith(
      expect.objectContaining({ tags: { id: 'eval:run:turn:0:message' }, discriminateByTags: ['id'] })
    )
    await session.disconnect()
  })
})
