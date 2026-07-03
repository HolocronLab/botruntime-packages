import { bot, Workflow, z, actions } from '@botpress/runtime'
import { ContactsTable } from '../tables/contacts'

/**
 * Enrichment pipeline workflow.
 *
 * This scheduled workflow:
 *   1. Fetches contacts that have not been enriched yet.
 *   2. Enriches each contact via the enrichContact action (AI classification).
 *   3. Writes the enrichment results back to the ContactsTable.
 *   4. Updates bot state with run metadata and logs a summary.
 *
 * The workflow uses steps for each phase so progress is checkpointed. If it
 * crashes mid-run, it resumes from the last completed step on restart.
 *
 * Schedule: daily at 9:00 AM UTC (edit the cron expression below).
 * Timeout: 2 hours to handle large contact lists.
 */
export const EnrichmentPipeline = new Workflow({
  name: 'enrichmentPipeline',
  description: 'Fetches unenriched CRM contacts, classifies them with AI, and writes results back',

  // Runs every day at 9:00 AM UTC.
  // Change to "*/30 * * * *" for every 30 minutes during development.
  schedule: '0 9 * * *',

  // Allow up to 2 hours for large batches.
  timeout: '2h',

  input: z.object({
    batchSize: z.number().default(50).describe('Max number of contacts to enrich per run'),
  }),

  state: z.object({
    contactsFetched: z.number().default(0),
    contactsEnriched: z.number().default(0),
    errors: z.array(z.string()).default([]),
  }),

  output: z.object({
    enriched: z.number().describe('Number of contacts enriched this run'),
    errors: z.number().describe('Number of contacts that failed enrichment'),
    summary: z.string().describe('Human-readable run summary'),
  }),

  async handler({ input, state, step }) {
    // ---------------------------------------------------------------
    // Step 1: Fetch unenriched contacts
    // ---------------------------------------------------------------
    const unenrichedContacts = await step('fetch-unenriched-contacts', async () => {
      const { rows } = await ContactsTable.findRows({
        filter: { enrichedAt: null as unknown as string },
        limit: input.batchSize,
      })

      return rows
    })

    state.contactsFetched = unenrichedContacts.length

    if (unenrichedContacts.length === 0) {
      console.log('No unenriched contacts found. Skipping run.')
      return {
        enriched: 0,
        errors: 0,
        summary: 'No unenriched contacts to process.',
      }
    }

    console.log(`Found ${unenrichedContacts.length} unenriched contacts. Starting enrichment...`)

    // ---------------------------------------------------------------
    // Step 2: Enrich each contact via the action
    // ---------------------------------------------------------------
    const enrichmentResults = await step('enrich-contacts', async () => {
      const results: Array<{
        id: number
        industry: string
        useCase: string
        score: string
        success: boolean
        error?: string
      }> = []

      for (const contact of unenrichedContacts) {
        try {
          const enriched = await actions.enrichContact({
            name: contact.name,
            email: contact.email,
            company: contact.company,
          })

          results.push({
            id: contact.id,
            industry: enriched.industry,
            useCase: enriched.useCase,
            score: enriched.score,
            success: true,
          })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          console.error(`Failed to enrich contact ${contact.id} (${contact.name}): ${message}`)
          results.push({
            id: contact.id,
            industry: '',
            useCase: '',
            score: '',
            success: false,
            error: message,
          })
        }
      }

      return results
    })

    // ---------------------------------------------------------------
    // Step 3: Write enrichment results back to the table
    // ---------------------------------------------------------------
    await step('update-contacts', async () => {
      const now = new Date().toISOString()
      const successfulResults = enrichmentResults.filter((r) => r.success)

      if (successfulResults.length === 0) {
        console.log('No successful enrichments to write back.')
        return
      }

      await ContactsTable.updateRows({
        rows: successfulResults.map((r) => ({
          id: r.id,
          industry: r.industry,
          useCase: r.useCase,
          score: r.score,
          enrichedAt: now,
        })),
      })

      console.log(`Updated ${successfulResults.length} contacts in the table.`)
    })

    // ---------------------------------------------------------------
    // Step 4: Update bot state and log summary
    // ---------------------------------------------------------------
    const successCount = enrichmentResults.filter((r) => r.success).length
    const errorCount = enrichmentResults.filter((r) => !r.success).length

    state.contactsEnriched = successCount
    state.errors = enrichmentResults.filter((r) => !r.success).map((r) => `Contact ${r.id}: ${r.error}`)

    // Persist metadata in global bot state for cross-run tracking.
    bot.state.lastEnrichmentRunAt = new Date().toISOString()
    bot.state.totalContactsEnriched = (bot.state.totalContactsEnriched ?? 0) + successCount

    const summary = [
      `Enrichment run complete.`,
      `Processed: ${unenrichedContacts.length}`,
      `Enriched: ${successCount}`,
      `Errors: ${errorCount}`,
      `Total enriched (all-time): ${bot.state.totalContactsEnriched}`,
    ].join(' | ')

    console.log(summary)

    return {
      enriched: successCount,
      errors: errorCount,
      summary,
    }
  },
})
