// import { Trigger, actions } from '@botpress/runtime'
//
// /**
//  * Example: React when a support agent adds a comment or note to a Botpress Desk ticket.
//  *
//  * Run `adk integrations info desk` to see all available Botpress Desk events.
//  */
// export default new Trigger({
//   name: 'onDeskTicketActivity',
//   description: 'Fires when new activity is added to a Botpress Desk ticket assigned to this bot',
//   events: ['desk:ticketActivity'],
//   handler: async ({ event }) => {
//     const ticketId = event.payload.ticketId
//     const { activities } = await actions.desk.listTicketActivities({ ticketId, limit: 10 })
//     console.log('Latest activity:', activities.at(-1))
//   },
// })
