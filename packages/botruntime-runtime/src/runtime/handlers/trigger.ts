import type { BotImplementation } from '@holocronlab/botruntime-sdk/dist/bot/implementation'
import { span } from '../../telemetry/tracing'
import { context, TrackedState, TrackedTags, TrackedUserProfile } from '..'
import { adk } from '../adk'
import { BaseBot, CommonHandlerProps } from '@holocronlab/botruntime-sdk/dist/bot'

export const triggerRegisterEvent = async ({ ctx }: CommonHandlerProps<BaseBot>) => {
  const registerEventName = 'register'
  const registerTrigger = Object.values(adk.project.triggers).find((trigger) =>
    trigger.events.includes(registerEventName)
  )
  if (!registerTrigger) return

  const eventId = crypto.randomUUID()

  await span(
    'handler.trigger',
    {
      botId: ctx.botId,
      eventId,
      'event.type': registerEventName,
      'trigger.name': registerTrigger.name,
    },
    async () => {
      console.log(`Evaluating trigger "${registerTrigger.name}" for event "${registerEventName}"`)

      await Promise.all([TrackedState.loadAll(), TrackedTags.loadAll(), TrackedUserProfile.loadAll()])

      try {
        await registerTrigger.handler({
          event: {
            id: eventId,
            type: registerEventName,
            failureReason: null,
            payload: {},
            status: 'pending',
            createdAt: new Date().toISOString(),
          },
        })
      } finally {
        await Promise.all([TrackedState.saveAllDirty(), TrackedTags.saveAllDirty(), TrackedUserProfile.saveAllDirty()])
      }
    }
  )
}

export const setup = (bot: BotImplementation) => {
  // Register a request hook to check triggers on every request

  const events = new Set<string>()

  for (const trigger of Object.values(adk.project.triggers)) {
    for (const name of trigger.events) {
      const originalName = name

      if (events.has(name)) {
        continue
      } else {
        events.add(name)
      }

      const names = new Set<string>([name])

      if (name.includes(':')) {
        const [integration, event] = name.split(':')
        const int = adk.project.integrations.find((x) => x.alias === integration || x.definition.name === integration)

        if (!int) {
          console.warn(`Integration "${integration}" not found for event "${name}". Skipping trigger registration.`)
          continue
        }

        names.add(`${int.definition.name}:${event}`)
        names.add(`${int.alias}:${event}`)
      }

      for (const name of names) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic event name from integration
        bot.on.event(name as any, async ({ event, ctx }) => {
          const conversation = context.get('conversation', { optional: true })

          await span(
            'handler.trigger',
            {
              botId: ctx.botId,
              eventId: event.id,
              'event.type': originalName,
              conversationId: event.conversationId,
              integration: conversation?.integration,
              channel: conversation?.channel,
              userId: event.userId,
              'trigger.name': trigger.name,
            },
            async () => {
              console.log(`Evaluating trigger "${trigger.name}" for event "${originalName}" (mapped to "${name}")`) // Log trigger evaluation

              await Promise.all([TrackedState.loadAll(), TrackedTags.loadAll(), TrackedUserProfile.loadAll()])

              try {
                await trigger.handler({
                  event: {
                    ...event,
                    type: originalName,
                  },
                })
              } finally {
                await Promise.all([
                  TrackedState.saveAllDirty(),
                  TrackedTags.saveAllDirty(),
                  TrackedUserProfile.saveAllDirty(),
                ])
              }
            }
          )
        })
      }
    }
  }
}
