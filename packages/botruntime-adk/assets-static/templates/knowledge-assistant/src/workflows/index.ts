// import { Workflow, z } from '@botpress/runtime'
// import { DocsKB } from '../knowledge/docs'
//
// /**
//  * Example: A research workflow that searches the knowledge base and produces a summary.
//  *
//  * Each `step()` call is checkpointed — safe to retry on failure.
//  * Start from a trigger or conversation via `ResearchWorkflow.start({ input })`.
//  */
// export const ResearchWorkflow = new Workflow({
//   name: 'research',
//   input: z.object({
//     topic: z.string().describe('The topic to research'),
//   }),
//   output: z.object({
//     summary: z.string().describe('A summary of findings from the knowledge base'),
//   }),
//   handler: async ({ input, step, execute }) => {
//     const summary = await step('research', async () => {
//       const result = await execute({
//         instructions: `Research the following topic using the knowledge base and provide a concise summary: ${input.topic}`,
//         knowledge: [DocsKB],
//       })
//       return result
//     })
//     return { summary }
//   },
// })
