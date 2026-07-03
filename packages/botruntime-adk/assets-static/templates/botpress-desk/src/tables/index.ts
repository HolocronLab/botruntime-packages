// import { Table, z } from '@botpress/runtime'
//
// /**
//  * Table names must end with "Table" (e.g. TicketsTable, FeedbackTable).
//  * Mark string columns as `{ searchable: true, schema: z.string() }` to enable semantic search.
//  * @reserved id, createdAt, updatedAt — auto-managed by the system, do not define them.
//  */
// export const TicketsTable = new Table({
//   name: 'ticketsTable',
//   description: 'Tracks escalated support tickets',
//   columns: {
//     ticketId: z.string().describe('The Botpress Desk ticket ID'),
//     reason: z.string().describe('Why the conversation was escalated'),
//     priority: z.string().describe('Ticket priority'),
//   },
// })
