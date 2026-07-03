// import { Eval } from '@botpress/evals'
//
// /**
//  * An eval is a simulated conversation with assertions on the bot's responses,
//  * tool usage, state, tables, and workflows. Files named `*.eval.ts` under
//  * `evals/` are auto-discovered — rename this file or add more alongside it.
//  *
//  * Run with:
//  *   adk evals                  # run every eval
//  *   adk evals my-first-eval    # run only this one
//  *   adk evals --tag basic      # filter by tag
//  */
// export default new Eval({
//   name: 'my-first-eval',
//   description: 'Bot responds coherently to a basic greeting',
//   tags: ['basic', 'single-turn'],
//   type: 'regression',
//
//   conversation: [
//     {
//       user: 'Hello',
//       assert: {
//         response: [
//           { not_contains: 'error' },
//           { llm_judge: 'Response is a friendly reply to a greeting, not an error or empty output.' },
//         ],
//       },
//     },
//   ],
// })
