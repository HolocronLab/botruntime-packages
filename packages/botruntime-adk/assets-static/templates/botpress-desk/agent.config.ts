import { z, defineConfig } from '@botpress/runtime'

export default defineConfig({
  name: '{{projectName}}',
  description: 'Customer support bot with human handoff via Botpress Desk',

  defaultModels: {
    autonomous: 'openai:gpt-4.1-mini-2025-04-14',
    zai: 'openai:gpt-4.1-2025-04-14',
  },

  bot: {
    state: z.object({}),
  },

  user: {
    state: z.object({}),
  },
})
