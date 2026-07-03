import { z, defineConfig } from '@botpress/runtime'

export default defineConfig({
  name: '{{projectName}}',
  description: 'Slack triage bot - monitors channels, classifies help requests, and routes them to the right person',

  defaultModels: {
    autonomous: 'openai:gpt-4.1-mini-2025-04-14', // Model used by execute() in conversations/workflows
    zai: 'openai:gpt-4.1-2025-04-14', // Model used by Zai (extract, check, label, etc.)
  },

  // Per-bot persistent state - tracks triage statistics across all conversations.
  bot: {
    state: z.object({
      totalTriaged: z.number().default(0).describe('Total requests triaged'),
      lastTriagedAt: z.string().optional().describe('ISO timestamp of last triage'),
    }),
  },

  // Per-user persistent state - remembers routing preferences per user.
  user: {
    state: z.object({
      preferredCategory: z.string().optional().describe('Category this user most often submits'),
      requestCount: z.number().default(0).describe('Number of requests from this user'),
    }),
  },
})
