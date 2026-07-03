import { Conversation, Autonomous, z } from '@botpress/runtime'
import { classifyRequest } from '../actions/classify-request'

/**
 * Exit that the AI uses once it has classified and responded to the request.
 * The execute() call ends when the AI selects this exit.
 */
const TriageComplete = new Autonomous.Exit({
  name: 'triage_complete',
  description: 'Classification is done and the user has been notified. Exit the conversation.',
  schema: z.object({
    category: z.string().describe('The category the request was classified as'),
  }),
})

/**
 * Handles incoming Slack DM messages.
 *
 * Flow: classify the request -> respond to the user -> exit.
 * The AI uses the classifyRequest tool, then selects the TriageComplete exit
 * to end the conversation cleanly.
 *
 * Customize:
 *   - Change the channel to "slack.channel" for public channel messages
 *   - Add more exits for different outcomes (e.g. needs_more_info, escalated)
 *   - Remove the exit to keep the conversation open for follow-ups
 */
export const SlackDM = new Conversation({
  // `chat.channel` is included so the eval runner (which sends messages via
  // @botpress/chat) can drive this handler without needing a real Slack workspace.
  // Remove it once you're ready to test exclusively through Slack.
  channel: ['slack.dm', 'chat.channel'],

  async handler({ execute }) {
    // Classify and respond in one shot. The AI will:
    // 1. Use classifyRequest to categorize the message
    // 2. Tell the user the result
    // 3. Select the TriageComplete exit to end
    const result = await execute({
      instructions: `You are a triage assistant. The user just sent a help request.

Your job:
1. Use the classifyRequest tool to classify their message
2. Tell them what category it was classified as and who it's being routed to
3. Be concise. One short paragraph max. Use Slack markdown.
4. Then select the triage_complete exit with the category.

Do NOT ask follow-up questions. Classify, confirm, exit.`,
      tools: [classifyRequest.asTool()],
      exits: [TriageComplete],
    })

    if (result.is(TriageComplete)) {
      console.log(`Triaged as: ${result.output.category}`)
    }

    // --- After triage, the conversation is done. ---
    // Examples of what you could do next instead:
    //
    // // Start the full triage workflow
    // import { TriageFlow } from '../workflows/triage-flow'
    // await TriageFlow.start({ message: message.payload.text })
    //
    // // Chain another execute() for follow-up questions
    // await execute({
    //   instructions: 'Ask the user if they want to override the priority.',
    // })
    //
    // // Open-ended support chat (no exit = keeps going until idle)
    // await execute({
    //   instructions: 'You are a helpful support agent.',
    //   tools: [classifyRequest.asTool()],
    // })
  },
})
