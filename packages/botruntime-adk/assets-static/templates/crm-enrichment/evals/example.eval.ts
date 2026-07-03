/**
 * This template is a backend-only agent — it has no conversation handler by
 * default, so there's no chat turn to assert against. To get started writing
 * evals here, uncomment the example below and tailor it to whatever you build:
 *
 *   - For chat: add a Conversation in src/conversations/, then write turn-based
 *     evals like the example.
 *   - For workflows: use `setup.workflow.trigger` to kick off a workflow and
 *     assert on `outcome.workflow` / `outcome.state` / `outcome.tables`.
 *
 * Run with:
 *   adk evals
 *   adk evals my-first-eval
 */

// import { Eval } from '@botpress/evals'
//
// export default new Eval({
//   name: 'my-first-eval',
//   description: 'Bot replies without erroring',
//   type: 'regression',
//
//   conversation: [
//     {
//       user: 'Hi',
//       assert: { response: [{ not_contains: 'error' }] },
//     },
//   ],
// })
