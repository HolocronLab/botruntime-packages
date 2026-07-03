// This template is a backend-only agent — no conversation handler is needed.
// If you want to add a chat interface (e.g. to let users query enriched contacts),
// uncomment below and install a channel integration: adk integrations add webchat@latest
//
// import { Conversation } from '@botpress/runtime'
//
// export default new Conversation({
//   channel: '*',
//   handler: async ({ execute }) => {
//     await execute({
//       instructions: 'You are a CRM assistant. Help users look up enriched contacts.',
//     })
//   },
// })
