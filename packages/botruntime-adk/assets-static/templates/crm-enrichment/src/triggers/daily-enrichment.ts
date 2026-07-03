import { Trigger } from '@botpress/runtime'
import { EnrichmentPipeline } from '../workflows/enrichment-pipeline'

/**
 * Fires on bot registration (startup) to kick off an initial enrichment run.
 *
 * The enrichment pipeline also has its own cron schedule ("0 9 * * *"),
 * which handles recurring daily runs automatically. This trigger ensures the
 * pipeline runs once immediately when the bot first starts -- useful during
 * development and after fresh deployments.
 *
 * To add more trigger events:
 *   - "user.created" -- enrich new contacts as they arrive
 *   - Custom events from integrations (e.g. "salesforce:contactCreated")
 */
export default new Trigger({
  name: 'dailyEnrichment',
  description: 'Starts the enrichment pipeline on bot registration for an initial run',
  events: ['register'],

  handler: async () => {
    console.log('Bot registered. Starting initial enrichment pipeline run...')

    const instance = await EnrichmentPipeline.start({
      batchSize: 50,
    })

    console.log(`Enrichment pipeline started: ${instance.id}`)
  },
})
