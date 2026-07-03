import { Conversation } from '@botpress/runtime'
import handToSupport from '../tools/handToSupport'

export default new Conversation({
  channel: '*',
  handler: async ({ execute }) => {
    await execute({
      instructions: `You are a helpful support bot.
Always start by greeting the user with "How can I help you today? If you'd like to speak with a support agent at any time, just let me know."
Help users with their questions as best you can.
If the user asks to speak with a support agent, or their issue is beyond your capabilities, use the handToSupport tool.
After calling handToSupport, do not send any further messages — a support agent will take over the conversation.`,
      tools: [handToSupport],
    })
  },
})
