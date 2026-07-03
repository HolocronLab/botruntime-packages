import { Action, z, adk } from '@botpress/runtime'

/**
 * Enriches a single contact using AI classification.
 *
 * Given a contact's name, email, and company, this action uses Zai to extract:
 *   - industry: what sector the company operates in
 *   - useCase: what they would most likely use the product for
 *   - score: a lead quality rating (high / medium / low)
 *
 * Customization points:
 *   - Change the enum values to match your business categories.
 *   - Edit the `instructions` to reflect your ideal customer profile.
 *   - Add more extracted fields (e.g. companySize, region, buyerPersona).
 */
export const enrichContact = new Action({
  name: 'enrichContact',
  description: 'Classify a CRM contact using AI to determine industry, use case, and lead score',

  input: z.object({
    name: z.string().describe('Full name of the contact'),
    email: z.string().describe('Contact email address'),
    company: z.string().describe('Company or organization name'),
  }),

  output: z.object({
    industry: z.string().describe('Classified industry'),
    useCase: z.string().describe('Classified use case'),
    score: z.enum(['high', 'medium', 'low']).describe('Lead quality score'),
  }),

  async handler({ input }) {
    // Build a text summary for the AI to classify.
    const contactSummary = [`Name: ${input.name}`, `Email: ${input.email}`, `Company: ${input.company}`].join('\n')

    // Use Zai extract to pull structured classification from the contact info.
    // The AI infers industry, use case, and score from the name, email domain, and company.
    const enriched = await adk.zai.extract(
      contactSummary,
      z.object({
        industry: z
          .enum([
            'Technology',
            'Healthcare',
            'Finance',
            'Retail',
            'Education',
            'Manufacturing',
            'Media',
            'Government',
            'Other',
          ])
          .describe('The primary industry the company operates in'),

        useCase: z
          .enum([
            'Customer Support',
            'Sales Automation',
            'Internal Helpdesk',
            'Lead Generation',
            'Knowledge Management',
            'Other',
          ])
          .describe('The most likely use case for a conversational AI product'),

        score: z.enum(['high', 'medium', 'low']).describe('Lead quality score based on company fit and likely intent'),
      }),
      {
        instructions: [
          'Classify this CRM contact based on their name, email domain, and company.',
          'For industry: infer from the company name and email domain.',
          'For useCase: estimate the most likely reason they would adopt a conversational AI platform.',
          "For score: rate as 'high' if the company is mid-market or enterprise in a strong vertical,",
          "'medium' for smaller companies or less obvious fit, 'low' for generic or unclear profiles.",
        ].join(' '),
      }
    )

    return enriched
  },
})
