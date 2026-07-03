/**
 * Eval: greeting
 * Verifies the bot responds to a basic greeting and can describe what it does when asked.
 * Assertion types exercised: response.not_contains, response.llm_judge
 *
 * Run with:
 *   adk evals
 *   adk evals greeting
 */
import { Eval } from '@botpress/evals'

export default new Eval({
  name: 'greeting',
  description: 'Bot should respond to a basic greeting and describe its capabilities when asked',
  tags: ['basic', 'single-turn'],
  type: 'regression',

  conversation: [
    {
      user: 'Hi there!',
      assert: {
        response: [
          { not_contains: 'error' },
          {
            llm_judge:
              'Response is a friendly reply acknowledging the greeting. It may offer to help or ask what the user needs.',
          },
        ],
      },
    },
    {
      user: 'What can you help me with?',
      assert: {
        response: [
          {
            llm_judge:
              'Response describes the bot as a helpful AI assistant, or invites the user to ask questions / describe a task. A brief general offer to help is acceptable.',
          },
        ],
      },
    },
  ],
})
