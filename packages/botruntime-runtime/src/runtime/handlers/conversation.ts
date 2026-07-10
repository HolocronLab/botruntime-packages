import type { BotImplementation } from '@holocronlab/botruntime-sdk/dist/bot/implementation'
import { context, TrackedState, TrackedTags, TrackedUserProfile } from '..'
import { ConversationHandler } from '../../primitives/conversation'

import { span } from '../../telemetry/tracing'
import { adk } from '../adk'
import { findMatchingHandler } from './conversation-matching'
export const setup = (bot: BotImplementation) => {
  bot.on.message('*', async ({ conversation, message, logger, ctx, event, user, client: _client }) => {
    await span(
      'handler.conversation',
      {
        botId: ctx.botId,
        conversationId: conversation.id,
        eventId: event.id,
        integration: conversation.integration,
        channel: conversation.channel,
        'event.type': event.type,
        messageId: message.id,
        userId: user.id,
        'message.type': message.type,
        'message.payload': message.payload,
        'event.payload': event.payload,
      },
      async (handlerSpan) => {
        // conversation.integration is the alias (e.g., "telegram1", "slack2")
        const handlerName = conversation.integration + '.' + conversation.channel

        // Find matching conversation handler (prioritized by specificity)
        const handler = findMatchingHandler(adk.project.conversations, handlerName)

        if (!handler) {
          // Machine-readable signal that no handler matched this channel, for trace-based tooling.
          handlerSpan.setAttribute('handler.matched', false)
          logger.warn(`Skipping message, no agent conversation defined for "${handlerName}"`)
          return
        }

        const chat = handler.chatFactory({ context: context.getAll(), channel: handlerName })
        context.set('chat', chat)

        await Promise.all([
          chat.fetchTranscript(),
          TrackedState.loadAll(),
          TrackedTags.loadAll(),
          TrackedUserProfile.loadAll(),
        ])

        await chat.addMessage(message)

        await handler[ConversationHandler]()

        await Promise.all([TrackedState.saveAllDirty(), TrackedTags.saveAllDirty(), TrackedUserProfile.saveAllDirty()])

        await chat.saveTranscript()
      }
    )
  })
}
