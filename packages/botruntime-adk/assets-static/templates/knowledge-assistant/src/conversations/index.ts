import { Conversation } from '@botpress/runtime'
import { DocsKB } from '../knowledge/docs'

/**
 * Main conversation handler for the knowledge assistant.
 *
 * Uses execute() with the DocsKB knowledge base. The AI automatically
 * gets a search tool for the KB — no custom action needed.
 *
 * Handles all channels (chat, webchat, etc.) via the wildcard channel.
 */
export default new Conversation({
  channel: '*',

  async handler({ execute }) {
    await execute({
      instructions: `You are a company knowledge assistant. You answer employee questions using the company documentation.

Lead with example questions, to assist the user in asking good questions. For example:
- "What is the company's remote work policy?"
- "How do I request time off?"
- "What are the steps to set up my email on a new device?"
Rules:
- Search the knowledge base for every question. Do not guess or use general knowledge.
- If the answer is in the docs, quote the relevant policy or section.
- If the docs don't cover it, say "I don't have information about that in our docs" and suggest who to ask (HR, manager, IT, etc).
- Be direct. Lead with the answer, then provide context.
- Use short paragraphs. Bullet points for lists.`,

      knowledge: [DocsKB],
    })
  },
})
