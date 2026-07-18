import { describe, expect, it, vi } from 'vitest'
import { BaseConversationInstance } from './conversation-instance'
import { context } from '../runtime/context/context'
import { interfaceMappings } from '../runtime/interfaces'

interfaceMappings.registerMappings({
  typingIndicator: {
    actions: {
      'telegram:startTypingIndicator': 'telegram:startTypingIndicator',
      'telegram:stopTypingIndicator': 'telegram:stopTypingIndicator',
    },
  },
})

const invokeTyping = async (
  method: 'startTyping' | 'stopTyping',
  message?: { id: string; conversationId: string }
) => {
  const callAction = vi.fn().mockResolvedValue({})
  const instance = {
    id: 'conv_target',
    integration: 'telegram',
    client: { callAction },
  }

  await context.run({ ...(message ? { message } : {}) } as never, () =>
    BaseConversationInstance.prototype[method].call(instance as never)
  )

  return callAction
}

describe('message-bound typing indicator', () => {
  for (const method of ['startTyping', 'stopTyping'] as const) {
    it(`${method} skips the action without a current message`, async () => {
      const callAction = await invokeTyping(method)
      expect(callAction).not.toHaveBeenCalled()
    })

    it(`${method} skips a current message from another conversation`, async () => {
      const callAction = await invokeTyping(method, { id: 'm_other', conversationId: 'conv_other' })
      expect(callAction).not.toHaveBeenCalled()
    })

    it(`${method} passes the canonical message id for the current conversation`, async () => {
      const callAction = await invokeTyping(method, { id: 'm_249', conversationId: 'conv_target' })
      expect(callAction).toHaveBeenCalledOnce()
      expect(callAction).toHaveBeenCalledWith({
        type: `telegram:${method === 'startTyping' ? 'startTypingIndicator' : 'stopTypingIndicator'}`,
        input: { conversationId: 'conv_target', messageId: 'm_249' },
      })
    })
  }
})
