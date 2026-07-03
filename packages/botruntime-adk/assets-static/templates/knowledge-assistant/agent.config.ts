import { z, defineConfig } from '@botpress/runtime'

export default defineConfig({
  name: '{{projectName}}',
  description: 'A RAG-powered knowledge assistant that answers questions using your documents',

  defaultModels: {
    autonomous: 'openai:gpt-4.1-mini-2025-04-14',
    zai: 'openai:gpt-4.1-2025-04-14',
  },

  // Per-bot persistent state
  bot: {
    state: z.object({}),
  },

  // Per-user persistent state
  user: {
    state: z.object({}),
  },

  // Integrations extend your agent with actions, channels, and events.
})
