/**
 * Eval: engineering-practices
 * Verifies the bot cites multi-section handbook content (code review + deployment).
 * Demonstrates multi-turn knowledge retrieval across different doc sections.
 * Assertion types exercised: response.contains, response.matches, response.llm_judge
 *
 * Run with:
 *   adk evals engineering-practices
 */
import { Eval } from '@botpress/evals'

export default new Eval({
  name: 'engineering-practices',
  description: 'Bot should answer code review and deployment questions from the handbook',
  tags: ['knowledge', 'multi-turn'],
  type: 'regression',

  conversation: [
    {
      user: 'How many approvals do I need on a PR that touches payments?',
      assert: {
        response: [
          { matches: '\\btwo\\b|\\b2\\b' },
          {
            llm_judge:
              'Response says two approvals are required for PRs touching auth, payments, or data deletion. It clearly distinguishes this from the default one-approval rule.',
          },
        ],
      },
    },
    {
      user: 'When do we deploy to production?',
      assert: {
        response: [
          { contains: '11 AM' },
          { contains: '4 PM' },
          {
            llm_judge:
              'Response mentions production deploys happen twice daily at 11 AM and 4 PM UTC, and may reference that feature flags are required for user-facing changes.',
          },
        ],
      },
    },
  ],
})
