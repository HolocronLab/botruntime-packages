import { Trigger } from '@botpress/runtime'
import { TriageFlow } from '../workflows/triage-flow'

/**
 * Fires when a new message arrives in a monitored Slack channel.
 *
 * This trigger listens for the "message.created" event and starts the
 * triage workflow for each incoming message. The workflow then classifies
 * the request and routes it to the appropriate person/channel.
 *
 * Customize:
 *   - Add filters to ignore bot messages or specific channels
 *   - Switch to "slack:reactionAdded" to triage only when someone reacts with a specific emoji
 *   - Add "slack:memberJoinedChannel" to welcome new members
 */
export const onNewMessage = new Trigger({
  name: 'onNewMessage',
  description: 'Starts the triage workflow when a new message arrives in a monitored Slack channel',
  events: ['message.created'],

  handler: async ({ event }) => {
    const payload = event.payload

    // Skip empty messages
    if (!payload?.text) {
      return
    }

    // Optional: skip bot messages to avoid triage loops.
    // Uncomment and adjust the condition for your workspace:
    // if (payload.userId === bot.id) {
    //   return;
    // }

    // Start the triage workflow with the message content
    const instance = await TriageFlow.start({
      message: payload.text,
      senderName: payload.userId ?? 'Unknown',
      sourceChannel: payload.conversationId ?? undefined,
    })

    console.log(`Triage workflow started: ${instance.id} for message from ${payload.userId}`)
  },
})
