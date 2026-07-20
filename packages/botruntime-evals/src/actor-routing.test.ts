import { describe, expect, it, vi } from 'vitest'
import { ActorRouter } from './actor-routing'

describe('multi-actor eval routing', () => {
  it('resolves linked conversations by templated relation tags and sends a synthetic actor message', async () => {
    const client = {
      listConversations: vi.fn().mockResolvedValue({
        conversations: [
          {
            id: 'hitl-1',
            tags: { root: 'client-1' },
            properties: { mode: 'manual' },
          },
        ],
      }),
      getOrCreateUser: vi.fn().mockResolvedValue({ user: { id: 'operator-user' } }),
      getOrCreateMessage: vi.fn().mockResolvedValue({}),
      listMessages: vi.fn().mockResolvedValue({ messages: [], meta: {} }),
      getConversation: vi.fn().mockResolvedValue({
        conversation: {
          id: 'hitl-1',
          tags: {},
          properties: { mode: 'manual' },
        },
      }),
    }
    const router = new ActorRouter(client as any, {
      primaryConversationId: 'client-1',
      primaryUserId: 'client-user',
      relations: {
        hitl_thread: {
          tags: { root: '$conversationId' },
          integration: 'telegram',
          channel: 'channel',
        },
      },
    })

    await router.send({
      actor: 'operator',
      relation: 'hitl_thread',
      message: '/take',
    })

    expect(client.listConversations).toHaveBeenCalledWith({
      tags: { root: 'client-1' },
      integrationName: 'telegram',
      channel: 'channel',
      pageSize: 2,
    })
    expect(client.getOrCreateMessage).toHaveBeenCalledWith({
      conversationId: 'hitl-1',
      userId: 'operator-user',
      type: 'text',
      payload: { text: '/take' },
      tags: { id: 'eval:client-1:actor:operator' },
      discriminateByTags: ['id'],
      origin: 'synthetic',
    })
  })

  it('renders related-conversation responses from the platform message envelope', async () => {
    const client = {
      listConversations: vi.fn(),
      getOrCreateUser: vi.fn(),
      getOrCreateMessage: vi.fn(),
      listMessages: vi.fn().mockResolvedValue({
        messages: [
          {
            id: 'operator-ack',
            direction: 'outgoing',
            type: 'text',
            payload: { text: 'Диалог перехвачен' },
          },
        ],
        meta: {},
      }),
      getConversation: vi.fn(),
    }
    const router = new ActorRouter(client as any, {
      primaryConversationId: 'client-1',
      primaryUserId: 'client-user',
      relations: {},
    })

    await router.startDeliveryObservation([])

    await expect(router.responsesFor('client')).resolves.toEqual(['Диалог перехвачен'])
  })

  it('keeps actor identity and message effect identity stable across router reconstruction', async () => {
    const getOrCreateUser = vi.fn().mockResolvedValue({ user: { id: 'operator-user' } })
    const getOrCreateMessage = vi.fn().mockResolvedValue({})
    const client = {
      listConversations: vi.fn().mockResolvedValue({ conversations: [{ id: 'hitl-1', tags: { root: 'client-1' } }] }),
      getOrCreateUser,
      getOrCreateMessage,
      listMessages: vi.fn().mockResolvedValue({ messages: [], meta: {} }),
      getConversation: vi.fn(),
    }
    const context = {
      primaryConversationId: 'client-1',
      primaryUserId: 'client-user',
      executionId: 'run:1',
      relations: { hitl_thread: { tags: { root: '$conversationId' } } },
    }

    await new ActorRouter(client as any, context).send({
      actor: 'operator',
      relation: 'hitl_thread',
      message: 'take',
      effectId: 'eval:run:1:turn:0:message',
    })
    await new ActorRouter(client as any, context).send({
      actor: 'operator',
      relation: 'hitl_thread',
      message: 'take',
      effectId: 'eval:run:1:turn:0:message',
    })

    expect(getOrCreateUser).toHaveBeenCalledTimes(2)
    expect(getOrCreateUser).toHaveBeenNthCalledWith(1, getOrCreateUser.mock.calls[1]?.[0])
    expect(getOrCreateMessage).toHaveBeenCalledTimes(2)
    expect(getOrCreateMessage).toHaveBeenNthCalledWith(1, getOrCreateMessage.mock.calls[1]?.[0])
  })

  it('grades delivery and mode using only post-turn platform records', async () => {
    const listMessages = vi
      .fn()
      .mockResolvedValueOnce({
        messages: [{ id: 'before', direction: 'outgoing' }],
        meta: {},
      })
      .mockResolvedValueOnce({
        messages: [
          { id: 'before', direction: 'outgoing' },
          {
            id: 'after',
            direction: 'outgoing',
            payload: { type: 'text', text: 'manual reply' },
          },
        ],
        meta: {},
      })
    const client = {
      listConversations: vi.fn(),
      getOrCreateUser: vi.fn(),
      getOrCreateMessage: vi.fn(),
      listMessages,
      getConversation: vi.fn().mockResolvedValue({
        conversation: {
          id: 'client-1',
          tags: {},
          properties: { mode: 'manual' },
        },
      }),
    }
    const router = new ActorRouter(client as any, {
      primaryConversationId: 'client-1',
      primaryUserId: 'client-user',
      relations: {},
    })

    await router.startDeliveryObservation(['client'])
    expect(
      await router.gradeDelivery({
        deliveredTo: ['client'],
        notDeliveredTo: [],
        conversationMode: { target: 'client', equals: 'manual' },
      })
    ).toEqual([
      expect.objectContaining({ assertion: 'delivered_to:client', pass: true }),
      expect.objectContaining({
        assertion: 'conversation_mode:client',
        pass: true,
      }),
    ])
  })

  it('waits for an eventually-created related conversation', async () => {
    const client = {
      listConversations: vi
        .fn()
        .mockResolvedValueOnce({ conversations: [] })
        .mockResolvedValueOnce({ conversations: [] })
        .mockResolvedValueOnce({
          conversations: [{ id: 'hitl-late', tags: { root: 'client-1' } }],
        }),
      getOrCreateUser: vi.fn(),
      getOrCreateMessage: vi.fn(),
      listMessages: vi.fn(),
      getConversation: vi.fn(),
    }
    const router = new ActorRouter(
      client as any,
      {
        primaryConversationId: 'client-1',
        primaryUserId: 'client-user',
        relations: { hitl_thread: { tags: { root: '$conversationId' } } },
      },
      { resolveTimeoutMs: 50, pollIntervalMs: 1 }
    )

    await expect(router.conversationId('hitl_thread')).resolves.toBe('hitl-late')
    expect(client.listConversations).toHaveBeenCalledTimes(3)
  })

  it('returns typed relation diagnostics without exposing selector values', async () => {
    const client = {
      listConversations: vi.fn().mockResolvedValue({ conversations: [] }),
      getOrCreateUser: vi.fn(),
      getOrCreateMessage: vi.fn(),
      listMessages: vi.fn(),
      getConversation: vi.fn(),
    }
    const router = new ActorRouter(
      client as any,
      {
        primaryConversationId: 'client-1',
        primaryUserId: 'client-user',
        relations: { hitl_thread: { tags: { root: '$conversationId' } } },
      },
      { resolveTimeoutMs: 0, pollIntervalMs: 1 }
    )

    await expect(router.conversationId('hitl_thread')).rejects.toMatchObject({
      code: 'EVAL_RELATION_NOT_FOUND',
      expected: true,
    })
  })
})
