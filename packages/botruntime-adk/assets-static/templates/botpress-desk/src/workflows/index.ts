// import { Workflow, z } from '@botpress/runtime'
//
// /**
//  * Each `step()` call is checkpointed — safe to retry on failure.
//  * Start from a trigger or conversation via `MyWorkflow.start({ input })`.
//  */
// export const MyWorkflow = new Workflow({
//   name: 'myWorkflow',
//   input: z.object({
//     topic: z.string().describe('The topic to process'),
//   }),
//   output: z.object({
//     result: z.string().describe('The result'),
//   }),
//   handler: async ({ input, step }) => {
//     const result = await step('process', async () => {
//       return `Processed: ${input.topic}`
//     })
//     return { result }
//   },
// })
