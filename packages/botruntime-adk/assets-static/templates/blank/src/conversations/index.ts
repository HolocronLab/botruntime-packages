import { Conversation } from '@botpress/runtime'

/**
 * A channel-specific message handler. Use `channel: '*'` to match all channels,
 * or target specific ones: 'webchat.channel', 'slack.dm', 'slack.channel',
 * 'discord.dm', 'whatsapp.channel', 'teams.channel', etc.
 * Use `execute()` to let the AI respond autonomously with tools and knowledge bases.
 */
export default new Conversation({
  channel: '*',
  handler: async ({ execute }) => {
    await execute({
      instructions: 'You are a helpful assistant.',
    })
  },
})
