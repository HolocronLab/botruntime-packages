/**
 * Eval: context-retention
 * Verifies the bot remembers details the user shares earlier in the conversation.
 * Assertion types exercised: response.contains, response.matches, response.not_contains
 *
 * Run with:
 *   adk evals context-retention
 */
import { Eval } from '@botpress/evals'

export default new Eval({
  name: 'context-retention',
  description: "Bot should remember the user's name and favorite color across turns",
  tags: ['multi-turn', 'memory'],
  type: 'regression',

  conversation: [
    {
      user: "Hi, I'm Sam and my favorite color is teal.",
      assert: {
        response: [{ not_contains: 'error' }],
      },
    },
    {
      user: "What's my name?",
      assert: {
        response: [{ contains: 'Sam' }],
      },
    },
    {
      user: 'And what did I say was my favorite color?',
      assert: {
        response: [{ matches: '\\b[Tt]eal\\b' }],
      },
    },
  ],
})
