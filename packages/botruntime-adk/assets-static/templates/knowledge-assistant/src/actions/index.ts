// import { Action, z } from '@botpress/runtime'
//
// /**
//  * A strongly-typed callable function — use `new Action(...)` (it's a class constructor).
//  * Handler always receives `{ input, client }` as props, not the input fields directly.
//  * Can be converted to an AI tool via `.asTool()` and passed to `execute()`.
//  */
// export default new Action({
//   name: 'myAction',
//   input: z.object({
//     message: z.string().describe('The message to process'),
//   }),
//   output: z.object({
//     result: z.string().describe('The processed result'),
//   }),
//   handler: async ({ input }) => {
//     return { result: `Processed: ${input.message}` }
//   },
// })
