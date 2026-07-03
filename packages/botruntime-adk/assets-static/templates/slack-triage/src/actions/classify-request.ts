import { Action, z, adk } from '@botpress/runtime'

/**
 * Classifies an incoming help request into a category using Zai.
 *
 * Supported categories:
 *   - bug:             Something is broken or not working as expected
 *   - feature_request: A request for new functionality
 *   - question:        A general question or "how do I..." inquiry
 *   - ops_issue:       Infrastructure, deployment, or operational problem
 *
 * Customize: Add new categories by extending the enum and the label definitions below.
 */
export const classifyRequest = new Action({
  name: 'classifyRequest',
  description: 'Classify a help request into a category using AI',

  input: z.object({
    message: z.string().describe('The raw help request message text'),
  }),

  output: z.object({
    category: z.enum(['bug', 'feature_request', 'question', 'ops_issue']).describe('The classified category'),
    confidence: z.string().describe('How confident the classification is: high, medium, or low'),
    summary: z.string().describe('A one-sentence summary of the request'),
  }),

  handler: async ({ input }) => {
    // Use Zai label() with .result() to get confidence scores per category.
    // Each label is evaluated independently with a 5-tier confidence scale.
    const { output: labels } = await adk.zai
      .label(input.message, {
        bug: 'reports a bug, error, crash, or something not working as expected',
        feature_request: 'requests a new feature, enhancement, or improvement to existing functionality',
        question: 'asks a general question, seeks guidance, or wants to know how to do something',
        ops_issue: 'reports an infrastructure, deployment, uptime, or operational problem',
      })
      .result()

    // Pick the category with the highest confidence that matched (value: true).
    type Category = 'bug' | 'feature_request' | 'question' | 'ops_issue'
    const categories: Category[] = ['bug', 'feature_request', 'question', 'ops_issue']

    const best = categories
      .filter((c) => labels[c].value)
      .sort((a, b) => labels[b].confidence - labels[a].confidence)[0]

    const category: Category = best ?? 'question'
    const confidence = best ? (labels[best].confidence >= 0.8 ? 'high' : 'medium') : 'low'

    // Use Zai extract() to generate a concise summary of the request.
    const extracted = await adk.zai.extract(
      input.message,
      z.object({
        summary: z.string().describe('A single concise sentence summarizing the help request'),
      })
    )

    return {
      category,
      confidence,
      summary: extracted.summary,
    }
  },
})
