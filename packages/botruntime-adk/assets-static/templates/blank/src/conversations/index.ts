import { Conversation } from '@holocronlab/botruntime-runtime'

export default new Conversation({
  channel: '*',
  handler: async ({ execute }) => {
    await execute({ instructions: 'Help the user clearly and concisely.' })
  },
})
