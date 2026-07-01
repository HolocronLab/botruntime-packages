import { BaseWorkflow } from '../../primitives/workflow'
import { z } from '@holocronlab/botruntime-sdk'
import { adk } from '../adk'
import { SyncInput, SyncOutput } from '../../primitives/data-sources/source-base'

/**
 * Built-in workflow for orchestrating knowledge base data source synchronization
 * This workflow triggers sync workflows for all data sources in a knowledge base
 */
export const KnowledgeIndexingWorkflow = new BaseWorkflow({
  name: 'builtin_knowledge_indexing' as const,
  description: 'Built-in workflow to re-index all data sources in a knowledge base',
  input: z.object({
    kbName: z.string(),
    kbId: z.string(),
    force: z.boolean().optional().describe("Force re-indexing even if files haven't changed").default(false),
  }),
  timeout: '180m',
  output: SyncOutput,
  handler: async ({ input, step }) => {
    const { kbName, kbId } = input

    const kb = adk.project.knowledge.find((x) => x.name === kbName)

    if (!kb) {
      throw new Error(`Knowledge base '${kbName}' not found`)
    }

    const workflows = await step.map(
      'index-sources',
      kb.sources,
      async (source) => {
        const workflowId = await step(
          'create-sync-workflow',
          async () =>
            await source.syncWorkflow
              .getOrCreate({
                key: `${kbName}:${source.id}`,
                statuses: ['in_progress', 'listening', 'pending', 'paused'],
                input: {
                  kbName,
                  kbId,
                  dsId: source.id,
                  force: input.force || false,
                } satisfies SyncInput,
              })
              .then((x) => x.id)
        )

        return await step.waitForWorkflow(source.id, workflowId).then((x) => x.output as SyncOutput)
      },
      { concurrency: 10, maxAttempts: 1 }
    )

    return {
      errors: workflows.flatMap((w) => w.errors || []),
      processed: workflows.reduce((a, w) => a + (w.processed || 0), 0),
      added: workflows.flatMap((w) => w.added || []),
      updated: workflows.flatMap((w) => w.updated || []),
      deleted: workflows.flatMap((w) => w.deleted || []),
    }
  },
})
