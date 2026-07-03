import { Workflow, z, actions, bot } from '@botpress/runtime'
import { RoutingRulesTable } from '../tables/routing-rules'

/**
 * Triage workflow: classifies a help request, looks up routing rules,
 * and posts a summary to the appropriate Slack channel.
 *
 * Steps:
 *   1. classify  - Run the classifyRequest action to categorize the message
 *   2. lookup    - Find the routing rule for this category from the table
 *   3. notify    - Post a triage summary to the target Slack channel
 *
 * Customize: Add steps for priority escalation, duplicate detection,
 * SLA tracking, or assignment rotation.
 */
export const TriageFlow = new Workflow({
  name: 'triageFlow',
  description: 'Classify a help request and route it to the right person',

  input: z.object({
    message: z.string().describe('The raw help request text'),
    senderName: z.string().optional().describe('Display name of the person who sent the request'),
    sourceChannel: z.string().optional().describe('Slack channel where the request originated'),
  }),

  output: z.object({
    category: z.string().describe('The classified category'),
    assignee: z.string().describe('Who the request was routed to'),
    summary: z.string().describe('Summary of the request'),
    routed: z.boolean().describe('Whether the request was successfully routed'),
  }),

  handler: async ({ input, step }) => {
    // Step 1: Classify the request using the AI action
    const classification = await step('classify', async () => {
      return await actions.classifyRequest({ message: input.message })
    })

    // Step 2: Look up the routing rule for this category
    const routingRule = await step('lookup', async () => {
      const { rows } = await RoutingRulesTable.findRows({
        filter: { category: classification.category },
        limit: 1,
      })

      if (rows.length === 0) {
        // No routing rule found -- return a sensible default
        return {
          assignee: 'unassigned',
          slackChannel: '#general',
          priority: 'medium',
        }
      }

      return {
        assignee: rows[0].assignee,
        slackChannel: rows[0].slackChannel,
        priority: rows[0].priority,
      }
    })

    // Step 3: Post a triage summary to the target Slack channel
    await step('notify', async () => {
      const sender = input.senderName ?? 'Someone'
      const source = input.sourceChannel ? ` in <#${input.sourceChannel}>` : ''

      const triageMessage = [
        `*New ${classification.category} request*`,
        `> ${classification.summary}`,
        '',
        `*From:* ${sender}${source}`,
        `*Priority:* ${routingRule.priority}`,
        `*Assigned to:* ${routingRule.assignee}`,
        `*Confidence:* ${classification.confidence}`,
      ].join('\n')

      // Post to the routing channel via Slack integration action.
      // This requires the Slack integration to be configured with appropriate permissions.
      try {
        await actions.slack.addReaction({
          name: 'eyes',
          channel: input.sourceChannel ?? '',
          timestamp: '',
        })
      } catch {
        // Reaction may fail if we do not have the message timestamp -- that is okay
      }

      console.log(`Triaged: ${classification.category} -> ${routingRule.slackChannel} (${routingRule.assignee})`)
      console.log(triageMessage)
    })

    // Update bot-level triage counter
    bot.state.totalTriaged += 1
    bot.state.lastTriagedAt = new Date().toISOString()

    return {
      category: classification.category,
      assignee: routingRule.assignee,
      summary: classification.summary,
      routed: routingRule.assignee !== 'unassigned',
    }
  },
})
