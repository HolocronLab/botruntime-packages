// import { Trigger } from '@botpress/runtime'
//
// /**
//  * Example: Track when users start conversations to monitor KB assistant usage.
//  *
//  * Bot events:    'register', 'message.created', 'conversation.started', 'conversation.ended',
//  *                'user.created', 'workflow.started', 'workflow.completed', 'workflow.failed'
//  * Run `adk integrations info <integration>` to see all events for an integration.
//  */
// export default new Trigger({
//   name: 'onConversationStarted',
//   description: 'Logs when a new knowledge assistant conversation begins',
//   events: ['conversation.started'],
//   handler: async ({ event }) => {
//     console.log(`New conversation started: ${event.payload.conversationId}`)
//   },
// })
