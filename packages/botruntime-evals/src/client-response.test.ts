import type { Client as BpClient } from '@holocronlab/botruntime-client'
import type { ChatClient } from './types'
import type { Message, SignalListener, Signals } from '@holocronlab/botruntime-chat'
import { describe, expect, it, vi } from 'vitest'
import { ChatSession, chatPayloadToText } from './client'

type MessagePayload = Message['payload']

function listenerHarness() {
  const handlers = new Map<string, (data: unknown) => void>()
  const listener = {
    on: vi.fn((event: string, handler: (data: unknown) => void) => handlers.set(event, handler)),
    off: vi.fn((event: string, handler: (data: unknown) => void) => {
      if (handlers.get(event) === handler) handlers.delete(event)
    }),
    disconnect: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
    emitMessage(data: Signals['message_created']) {
      handlers.get('message_created')?.(data)
    },
    emitError(error: Error) {
      handlers.get('error')?.(error)
    },
  }
  return listener
}

function sessionHarness() {
  const listeners: ReturnType<typeof listenerHarness>[] = []
  let conversation = 0
  const authenticatedClient = {
    user: { id: 'user-1' },
    createConversation: vi.fn(async () => ({
      conversation: { id: `conv-${++conversation}` },
    })),
    listenConversation: vi.fn(async () => {
      const listener = listenerHarness()
      listeners.push(listener)
      return listener as unknown as SignalListener
    }),
    createMessage: vi.fn().mockResolvedValue({}),
    createEvent: vi.fn().mockResolvedValue({}),
  }
  const chatClient = {
    connect: vi.fn().mockResolvedValue(authenticatedClient),
  } as unknown as ChatClient
  const session = new ChatSession({} as BpClient, 'runtime-bot', 'webhook-id', 'https://chat.example', chatClient)
  return { authenticatedClient, listeners, session }
}

function message(
  conversationId: string,
  payload: MessagePayload,
  isBot = true,
  id = 'message-1'
): Signals['message_created'] {
  return {
    id,
    createdAt: '2026-07-10T10:00:00.000Z',
    payload,
    userId: isBot ? 'bot' : 'user-1',
    conversationId,
    isBot,
  }
}

describe('ChatSession response observation', () => {
  it('attaches the bot-response listener before sending and isolates the current turn', async () => {
    const { authenticatedClient, listeners, session } = sessionHarness()
    await session.connect()
    await session.ensureConversation()

    expect(authenticatedClient.listenConversation).toHaveBeenCalledWith({
      id: 'conv-1',
    })
    session.startTurn()
    await session.sendMessage('hello')
    expect(authenticatedClient.listenConversation.mock.invocationCallOrder[0]).toBeLessThan(
      authenticatedClient.createMessage.mock.invocationCallOrder[0]!
    )

    listeners[0]!.emitMessage(message('conv-1', { type: 'text', text: 'first bot response' }, false))
    listeners[0]!.emitMessage(message('conv-1', { type: 'text', text: 'first bot response' }))
    listeners[0]!.emitMessage(message('conv-1', { type: 'text', text: 'replayed duplicate' }))
    expect(session.getTurnResponses()).toEqual(['first bot response'])

    session.startTurn()
    listeners[0]!.emitMessage(message('conv-1', { type: 'markdown', markdown: '**second**' }, true, 'message-2'))
    expect(session.getTurnResponses()).toEqual(['**second**'])
  })

  it('disconnects the old listener when repointing and ignores late messages from the old conversation', async () => {
    const { authenticatedClient, listeners, session } = sessionHarness()
    await session.connect()
    await session.ensureConversation()

    expect(await session.newConversation()).toBe('conv-2')
    expect(listeners[0]!.off).toHaveBeenCalledTimes(2)
    expect(listeners[0]!.disconnect).toHaveBeenCalledOnce()
    expect(listeners[0]!.cleanup).toHaveBeenCalledOnce()

    session.startTurn()
    listeners[0]!.emitMessage(message('conv-1', { type: 'text', text: 'late old response' }))
    await session.sendMessage('new conversation')
    listeners[1]!.emitMessage(message('conv-2', { type: 'text', text: 'new response' }))

    expect(authenticatedClient.listenConversation.mock.invocationCallOrder[1]).toBeLessThan(
      authenticatedClient.createMessage.mock.invocationCallOrder[0]!
    )
    expect(session.getTurnResponses()).toEqual(['new response'])
  })

  it('renders every typed chat payload deterministically for response grading', () => {
    const cases: Array<[MessagePayload, string]> = [
      [{ type: 'text', text: 'plain' }, 'plain'],
      [{ type: 'markdown', markdown: '**rich**' }, '**rich**'],
      [
        {
          type: 'choice',
          text: 'Choose',
          options: [{ label: 'One', value: '1' }],
        },
        'Choose\nOne (1)',
      ],
      [
        {
          type: 'file',
          fileUrl: 'https://files.example/a.pdf',
          title: 'A.pdf',
        },
        'A.pdf',
      ],
      [
        {
          type: 'card',
          title: 'Card title',
          subtitle: 'Card subtitle',
          actions: [{ action: 'say', label: 'Open', value: 'open' }],
        },
        'Card title\nCard subtitle\nOpen',
      ],
      [
        {
          type: 'bloc',
          items: [
            { type: 'text', text: 'line one' },
            { type: 'markdown', markdown: 'line two' },
          ],
        },
        'line one\nline two',
      ],
    ]

    for (const [payload, expected] of cases) {
      expect(chatPayloadToText(payload)).toBe(expected)
    }
  })

  it('rejects an untyped platform payload instead of grading an empty response', () => {
    expect(() =>
      chatPayloadToText({
        text: 'wire payload without its envelope type',
      } as unknown as MessagePayload)
    ).toThrow(expect.objectContaining({ code: 'CHAT_PAYLOAD_INVALID' }))
  })

  it('removes and disconnects the active listener during cleanup', async () => {
    const { listeners, session } = sessionHarness()
    await session.connect()
    await session.ensureConversation()

    await session.disconnect()

    expect(listeners[0]!.off).toHaveBeenCalledTimes(2)
    expect(listeners[0]!.disconnect).toHaveBeenCalledOnce()
    expect(listeners[0]!.cleanup).toHaveBeenCalledOnce()
  })

  it('fails an active turn loudly when the response listener dies', async () => {
    const { listeners, session } = sessionHarness()
    await session.connect()
    await session.ensureConversation()
    session.startTurn()

    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const monitored = session.raceWithListenerError(pending)
    listeners[0]!.emitError(new Error('stream disconnected'))

    await expect(monitored).rejects.toMatchObject({
      code: 'CHAT_LISTENER_FAILED',
    })
    expect(() => session.getTurnResponses()).toThrow(/listener.*stream disconnected/i)
    release()
  })
})
