import { Knowledge, DataSource } from '@botpress/runtime'

/**
 * Knowledge base that indexes all markdown files in the src/knowledge/ directory.
 *
 * Add your documents (markdown, PDF, text) to this folder and they will be
 * automatically indexed for semantic search. The AI uses this knowledge base
 * to answer questions with accurate, source-cited responses.
 *
 * Sync your knowledge base:
 *   adk kb sync      (manual sync)
 *   adk dev          (auto-syncs on startup and file changes)
 */
const docsSource = DataSource.Directory.fromPath('src/knowledge', {
  id: 'docs',
  filter: (filePath) => filePath.endsWith('.md') || filePath.endsWith('.pdf') || filePath.endsWith('.txt'),
})

export const DocsKB = new Knowledge({
  name: 'docsKB',
  description: 'Documentation and reference materials for answering user questions',
  sources: [docsSource],
})
