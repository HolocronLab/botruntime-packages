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
      createUser: vi.fn().mockResolvedValue({ user: { id: 'operator-user' } }),
      createMessage: vi.fn().mockResolvedValue({}),
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
    expect(client.createMessage).toHaveBeenCalledWith({
      conversationId: 'hitl-1',
      userId: 'operator-user',
      type: 'text',
      payload: { text: '/take' },
      tags: {},
      origin: 'synthetic',
    })
  })

  it('renders related-conversation responses from the platform message envelope', async () => {
    const client = {
      listConversations: vi.fn(),
      createUser: vi.fn(),
      createMessage: vi.fn(),
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
      createUser: vi.fn(),
      createMessage: vi.fn(),
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
      createUser: vi.fn(),
      createMessage: vi.fn(),
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
      createUser: vi.fn(),
      createMessage: vi.fn(),
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
