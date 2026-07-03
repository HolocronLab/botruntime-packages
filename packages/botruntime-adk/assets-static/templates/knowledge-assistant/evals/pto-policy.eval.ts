/**
 * Eval: pto-policy
 * Verifies the bot answers time-off questions from the company handbook accurately.
 * Exercises a single-turn knowledge-base lookup and forces grounding in the docs.
 * Assertion types exercised: response.contains, response.matches, response.llm_judge
 *
 * Run with:
 *   adk evals pto-policy
 */
import { Eval } from '@botpress/evals'

export default new Eval({
  name: 'pto-policy',
  description: 'Bot should answer PTO and parental-leave questions using facts from the handbook',
  tags: ['knowledge', 'single-turn'],
  type: 'regression',

  conversation: [
    {
      user: 'How many days of PTO do I get per year?',
      assert: {
        response: [
          { matches: '\\b20\\b' },
          {
            llm_judge:
              'Response states employees get 20 days of PTO per year and mentions that it accrues monthly. It answers directly from the handbook rather than guessing.',
          },
        ],
      },
    },
    {
      user: 'How much parental leave is offered?',
      assert: {
        response: [
          { contains: '16 weeks' },
          {
            llm_judge:
              'Response says 16 weeks of paid parental leave, and mentions the policy applies to all parents regardless of gender.',
          },
        ],
      },
    },
  ],
})
