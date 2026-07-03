/**
 * Eval: triage-basic
 * A minimal smoke test — the bot acknowledges and classifies a bug report
 * without erroring.
 *
 * Run with:
 *   adk evals
 *   adk evals triage-basic
 */
import { Eval } from '@botpress/evals'

export default new Eval({
  name: 'triage-basic',
  description: 'Bot acknowledges and classifies a bug report',
  type: 'regression',

  conversation: [
    {
      user: 'Production API is returning 502s for every request',
      assert: {
        response: [{ not_contains: 'error' }],
      },
    },
  ],
})
