import { z } from '@holocronlab/botruntime-sdk'
import type { BotImplementation } from '@holocronlab/botruntime-sdk/dist/bot/implementation'
import {
  context,
  TrackedState,
  TrackedTags,
  TrackedUserProfile,
  WorkflowCallbackEvent,
  WorkflowDataRequestEvent,
  WorkflowNotifyEvent,
  WorkflowScheduleEvent,
  LifecycleNudgeEvent,
  LifecycleExpireEvent,
} from '..'
import { ConversationHandler } from '../../primitives/conversation'
import { span } from '../../telemetry/tracing'
import { adk } from '../adk'
import { matchesChannel } from './conversation-matching'

export const setup = (bot: BotImplementation) => {
  // Register workflow execution handler

  const registeredEvents = new Set<string>()

  for (const conversation of adk.project.conversations) {
    for (const eventName of conversation.events) {
      registeredEvents.add(eventName)
    }
  }

  const conversationEventTypes = [
    WorkflowCallbackEvent.name,
    WorkflowDataRequestEvent.name,
    WorkflowNotifyEvent.name,
    LifecycleNudgeEvent.name,
    LifecycleExpireEvent.name,
    ...registeredEvents,
  ]

  for (const eventType of conversationEventTypes) {
    bot.on.event(eventType, async ({ event, client: _client, logger, ctx }) => {
      const payload = event.payload
      const workflowId = payload.workflowId || payload.workflow_id

      const conversation = context.get('conversation')

      if (!conversation) {
        logger.warn(`Skipping ${event.type} event, conversation not found in context`)
        return
      }

      const handlerName = conversation.integration + '.' + conversation.channel

      // Find matching conversation handler that is listening to this event
      const isBuiltInEvent =
        event.type === WorkflowCallbackEvent.name ||
        event.type === WorkflowDataRequestEvent.name ||
        event.type === WorkflowNotifyEvent.name ||
        event.type === LifecycleNudgeEvent.name ||
        event.type === LifecycleExpireEvent.name
      const matchingHandlers = adk.project.conversations.filter(
        (h) => matchesChannel(h.channel, handlerName) && (isBuiltInEvent || h.events.includes(event.type))
      )

      // Sort by specificity: single (most specific) > array > glob (least specific)
      const handler = matchingHandlers.sort((a, b) => {
        const aScore = a.channel === '*' ? 0 : Array.isArray(a.channel) ? 1 : 2
        const bScore = b.channel === '*' ? 0 : Array.isArray(b.channel) ? 1 : 2
        return bScore - aScore
      })[0]

      if (!handler) {
        logger.debug(
          `Skipping event "${event.type}", no agent conversation listens to this event for channel "${handlerName}"`
        )
        return
      }

      await span(
        'handler.event',
        {
          'event.type': event.type,
          botId: ctx.botId,
          eventId: event.id,
          channel: conversation.channel || '-',
          integration: conversation.integration || '-',
          conversationId: conversation.id,
          userId: event.userId || '-',
          workflowId,
        },
        async () => {
          const chat = handler.chatFactory({ context: context.getAll(), channel: handlerName })
          context.set('chat', chat)

          const [transcript, _statesLoaded, _tagsLoaded, _profilesLoaded] = await Promise.all([
            chat.fetchTranscript(),
            TrackedState.loadAll(),
            TrackedTags.loadAll(),
            TrackedUserProfile.loadAll(),
          ])

          if (transcript.find((x) => x.id === event.id)) {
            logger.debug(`Message ${event.id} already processed`)
            return
          }

          // Lifecycle events should NOT appear in the LLM transcript
          const isLifecycleEvent = event.type === LifecycleNudgeEvent.name || event.type === LifecycleExpireEvent.name

          if (!isLifecycleEvent) {
            await chat.addEvent(event)
          }

          await handler[ConversationHandler]()

          await Promise.all([
            TrackedState.saveAllDirty(),
            TrackedTags.saveAllDirty(),
            TrackedUserProfile.saveAllDirty(),
          ])

          await chat.saveTranscript()
        }
      )
    })
  }

  // Register workflow schedule event handler
  bot.on.event(WorkflowScheduleEvent.name, async ({ event, client, logger }) => {
    const payload = event.payload as z.infer<typeof WorkflowScheduleEvent.schema>

    const workflowName = payload.workflow

    logger.info(`Executing scheduled workflow: ${workflowName} at ${new Date().toISOString()}`)

    try {
      // Find the workflow definition to get its timeout
      const workflowDefinition = adk.project.workflows.find((w) => w.name === workflowName)

      if (!workflowDefinition) {
        logger.error(`Workflow definition not found for: ${workflowName}`)
        return
      }

      // Create the workflow instance with the configured timeout
      await client._inner.createWorkflow({
        name: workflowName,
        status: 'pending',
        input: {},
        timeoutAt: new Date(Date.now() + workflowDefinition.timeout).toISOString(),
      })

      logger.info(`Successfully created workflow instance for: ${workflowName}`)
    } catch (error) {
      logger.error(`Failed to create workflow instance for ${workflowName}:`, error)
    }
  })
}
