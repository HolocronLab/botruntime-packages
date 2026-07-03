import { Action, z, context } from '@botpress/runtime'
import { DocsKB } from '../knowledge/docs'

/**
 * Search the knowledge base programmatically.
 *
 * This action provides API-level access to the documentation search,
 * useful for integrations, workflows, or external systems that need
 * to query the knowledge base outside of a conversation.
 */
export const searchDocs = new Action({
  name: 'searchDocs',
  description: 'Search the documentation knowledge base',

  input: z.object({
    query: z.string().describe('The search query'),
    limit: z.number().min(1).max(20).default(5).describe('Maximum number of results to return'),
  }),

  output: z.object({
    results: z.array(
      z.object({
        content: z.string().describe('The matched passage content'),
        source: z.string().describe('The source file path'),
        score: z.number().describe('Relevance score'),
      })
    ),
  }),

  async handler({ input }) {
    const client = context.get('client')

    const { passages } = await client.searchFiles({
      query: input.query,
      tags: {
        source: 'knowledge-base',
        kbName: [DocsKB.name],
      },
      limit: input.limit,
    })

    return {
      results: passages.map((p) => ({
        content: p.content,
        source: p.file.key,
        score: p.score,
      })),
    }
  },
})
