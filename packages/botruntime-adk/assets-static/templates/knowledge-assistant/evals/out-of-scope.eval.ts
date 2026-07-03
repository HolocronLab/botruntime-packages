/**
 * Eval: out-of-scope
 * Verifies the bot refuses to guess when the docs don't cover a question,
 * and instead suggests who to ask (HR, manager, IT). This guards against hallucinations.
 * Assertion types exercised: response.llm_judge, response.not_contains
 *
 * Run with:
 *   adk evals out-of-scope
 */
import { Eval } from '@botpress/evals'

export default new Eval({
  name: 'out-of-scope',
  description: 'Bot should decline to answer questions outside the knowledge base and redirect appropriately',
  tags: ['knowledge', 'edge-case', 'single-turn'],
  type: 'regression',

  conversation: [
    {
      user: "What's the company's policy on hiring interns from abroad?",
      assert: {
        response: [
          { not_contains: 'approximately' },
          { not_contains: 'generally speaking' },
          {
            llm_judge:
              'Response makes it clear that this topic is not covered in the docs (e.g. says something like "I don\'t have information about that") and points the user to a human contact such as HR. It does NOT invent a made-up policy.',
          },
        ],
      },
    },
  ],
})
