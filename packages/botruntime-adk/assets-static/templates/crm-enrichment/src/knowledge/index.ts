// This template does not use a knowledge base.
// If you want to ground the enrichment logic with domain-specific documents
// (e.g. an ICP definition, industry taxonomy, or company database), you can
// add a knowledge base here and reference it in the enrichment action.
//
// import { Knowledge, DataSource } from '@botpress/runtime'
//
// const icpDocs = DataSource.Directory.fromPath('src/knowledge', {
//   id: 'icp-docs',
//   filter: (filePath) => filePath.endsWith('.md') || filePath.endsWith('.pdf'),
// })
//
// export const IcpKnowledge = new Knowledge({
//   name: 'icp-knowledge',
//   description: 'Ideal Customer Profile definitions and industry taxonomy',
//   sources: [icpDocs],
// })
