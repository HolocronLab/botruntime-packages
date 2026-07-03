import { z, defineConfig } from '@botpress/runtime'

export default defineConfig({
  name: '{{projectName}}',
  description:
    'A backend agent that enriches CRM contacts with AI-driven classification, scoring, and industry detection',

  defaultModels: {
    autonomous: 'openai:gpt-4.1-mini-2025-04-14',
    zai: 'openai:gpt-4.1-2025-04-14',
  },

  // Bot-level persistent state — tracks enrichment run metadata across executions.
  bot: {
    state: z.object({
      lastEnrichmentRunAt: z.string().optional().describe('ISO timestamp of the last completed enrichment run'),
      totalContactsEnriched: z.number().default(0).describe('Cumulative count of contacts enriched across all runs'),
    }),
  },

  // Per-user state is unused in this backend-only agent.
  user: {
    state: z.object({}),
  },

  // No integration dependencies — this is a pure backend workflow agent.
  // If you want to send enrichment reports to Slack or email, add integrations here:
  //   adk integrations add slack@latest
  //   adk integrations add sendgrid@latest
})
