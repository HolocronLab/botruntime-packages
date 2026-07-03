// import { Workflow, z } from '@botpress/runtime'
//
// /**
//  * A multi-step, resumable process that persists state across executions.
//  * Each `step()` call is checkpointed — safe to retry on failure.
//  * Use `step.notify()` for progress updates, or `step.sleep()`, `step.request()`, and `step.listen()` when you need to pause execution.
//  * Start from a trigger or conversation via `MyWorkflow.start({ input })`.
//  */
// export const MyWorkflow = new Workflow({
//   name: 'myWorkflow',
//   input: z.object({
//     data: z.string().describe('Input data to process'),
//   }),
//   output: z.object({
//     result: z.string().describe('The processed result'),
//   }),
//   handler: async ({ input, step }) => {
//     const result = await step('process', async () => {
//       return `Processed: ${input.data}`
//     })
//     return { result }
//   },
// })
