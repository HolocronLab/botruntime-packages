import { Table, z } from '@botpress/runtime'

/**
 * Stores routing rules that map request categories to assignees and channels.
 *
 * Each row defines where a specific category of request should be routed:
 *   - category:     The request classification (e.g. "bug", "feature_request")
 *   - assignee:     Who handles it (e.g. "@oncall-eng", "@product-team")
 *   - slackChannel: Slack channel to post the triage summary (e.g. "#bugs")
 *   - priority:     Default priority for this category
 *
 * The `category` column is searchable so the triage workflow can look up
 * the correct rule quickly.
 *
 * Seed this table after first deploy via the Botpress dashboard or a script:
 *   | category        | assignee       | slackChannel      | priority |
 *   |-----------------|----------------|-------------------|----------|
 *   | bug             | @oncall-eng    | #bugs             | high     |
 *   | feature_request | @product-team  | #feature_requests | medium   |
 *   | question        | @support-team  | #help-desk        | low      |
 *   | ops_issue       | @devops        | #ops-alerts       | high     |
 *
 * Note: Do NOT define an `id` column -- it is automatically managed by the system.
 */
export const RoutingRulesTable = new Table({
  name: 'RoutingRulesTable',
  description: 'Maps request categories to assignees and Slack channels for triage routing',

  columns: {
    category: {
      searchable: true,
      schema: z.string().describe('Request category: bug, feature_request, question, or ops_issue'),
    },
    assignee: z.string().describe('Person or team to assign this category to (e.g. @oncall-eng)'),
    slackChannel: z.string().describe('Slack channel to post triage summaries for this category (e.g. #bugs)'),
    priority: z.string().describe('Default priority level: low, medium, high, or critical'),
  },
})
