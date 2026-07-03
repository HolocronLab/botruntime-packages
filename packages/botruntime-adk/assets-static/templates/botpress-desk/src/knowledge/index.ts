// import { Knowledge, DataSource } from '@botpress/runtime'
//
// /**
//  * Add FAQ documents (.md, .txt, .pdf) to this folder and the bot will search them
//  * automatically before escalating to a support agent, reducing ticket volume.
//  *
//  * Sync your knowledge base:
//  *   adk kb sync      (manual sync)
//  *   adk dev          (auto-syncs on startup and file changes)
//  */
// const faqSource = DataSource.Directory.fromPath('src/knowledge', {
//   id: 'faq',
//   filter: (filePath) => filePath.endsWith('.md') || filePath.endsWith('.pdf') || filePath.endsWith('.txt'),
// })
//
// export const FaqKB = new Knowledge({
//   name: 'faqKB',
//   description: 'FAQ documents for answering common support questions',
//   sources: [faqSource],
// })
