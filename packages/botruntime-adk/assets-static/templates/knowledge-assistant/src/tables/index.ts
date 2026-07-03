// import { Table, z } from '@botpress/runtime'
//
// /**
//  * Example: Track search queries and feedback to improve the knowledge base over time.
//  *
//  * Table names must end with "Table" (e.g. QueriesTable, FeedbackTable).
//  * Mark string columns as `{ searchable: true, schema: z.string() }` to enable semantic search.
//  * @reserved id, createdAt, updatedAt — auto-managed by the system, do not define them.
//  */
// export const QueriesTable = new Table({
//   name: 'queriesTable',
//   description: 'Tracks user search queries and their feedback',
//   columns: {
//     query: {
//       searchable: true,
//       schema: z.string().describe('The user search query'),
//     },
//     resultCount: z.number().describe('Number of results returned'),
//     helpful: z.boolean().optional().describe('Whether the user found the answer helpful'),
//   },
// })
