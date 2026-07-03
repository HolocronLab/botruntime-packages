import { Autonomous, context, plugins, z } from '@botpress/runtime'

export default new Autonomous.Tool({
  name: 'handToSupport',
  description:
    "Transfer the conversation to a support agent via Botpress Desk. Use when the user's issue is beyond the bot's capabilities, or when they explicitly ask for a support agent.",
  input: z.object({
    reason: z.string().describe('Why the conversation needs a support agent — becomes the Botpress Desk ticket title'),
    priority: z
      .enum(['low', 'medium', 'high', 'urgent'])
      .default('medium')
      .describe('Ticket priority in Botpress Desk'),
  }),
  handler: async ({ reason, priority }) => {
    const conversation = context.get('conversation')

    await plugins['desk-hitl'].actions.startHitl({
      conversationId: conversation.id,
      title: reason,
      priority,
    })
  },
})
