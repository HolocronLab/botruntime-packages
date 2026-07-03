import { Table, z } from '@botpress/runtime'

/**
 * ContactsTable stores CRM contacts along with their AI-enriched metadata.
 *
 * Columns like `name` and `company` are searchable so you can use semantic search
 * to find contacts by fuzzy name/company queries.
 *
 * The enrichment fields (`useCase`, `industry`, `score`, `enrichedAt`) start empty
 * and are populated by the enrichment pipeline workflow.
 *
 * To customize: add columns for phone, title, source, deal stage, etc.
 */
export const ContactsTable = new Table({
  name: 'ContactsTable',
  description: 'CRM contacts with AI-enriched classification data',

  columns: {
    // -- Core contact fields --

    name: {
      searchable: true,
      schema: z.string().describe('Full name of the contact'),
    },

    email: z.string().describe('Contact email address'),

    company: {
      searchable: true,
      schema: z.string().describe('Company or organization name'),
    },

    // -- AI-enriched fields (populated by the enrichment pipeline) --

    industry: z.string().optional().describe('AI-classified industry (e.g. Technology, Healthcare, Finance)'),

    useCase: z.string().optional().describe('AI-classified use case (e.g. Customer Support, Sales Automation)'),

    score: z.string().optional().describe('AI-assigned lead score: high, medium, or low'),

    enrichedAt: z.string().optional().describe('ISO timestamp of when this contact was last enriched'),
  },
})
