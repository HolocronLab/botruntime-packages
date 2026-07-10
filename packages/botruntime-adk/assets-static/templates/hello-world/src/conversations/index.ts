import { Conversation } from '@holocronlab/botruntime-runtime'

export default new Conversation({
  channel: '*',
  handler: async ({ execute }) => {
    await execute({ instructions: 'Greet the user, then help with their request.' })
  },
})
