# {{projectName}}

A backend CRM enrichment agent built with the Botpress ADK. This agent runs scheduled workflows to classify, score, and enrich contacts in a table using AI -- no chat interface required.

## How It Works

1. **Contacts table** (`src/tables/contacts.ts`) stores raw and enriched contact data.
2. **Enrich action** (`src/actions/enrich-contact.ts`) uses Zai to classify a single contact's use case, industry, and lead score.
3. **Enrichment pipeline** (`src/workflows/enrichment-pipeline.ts`) fetches unenriched contacts, enriches each one, and writes results back.
4. **Daily trigger** (`src/triggers/daily-enrichment.ts`) kicks off the pipeline on a schedule and on initial bot registration.

## Getting Started

1. Install dependencies:

   ```bash
   {{packageManager}} install
   ```

2. Start development server:

   ```bash
   adk dev
   ```

3. Add some contacts to the `ContactsTable` (via `adk run` script or the dev UI), then watch the enrichment pipeline process them.

4. Deploy your agent:
   ```bash
   adk deploy
   ```

## Customizing the Enrichment Logic

The core AI classification lives in `src/actions/enrich-contact.ts`. You can customize:

- **Use case categories** -- edit the `useCase` enum in the Zai extract schema to match your business.
- **Industry list** -- expand or narrow the `industry` enum.
- **Scoring criteria** -- change the `score` enum and the `instructions` string to reflect your ideal customer profile.
- **Additional fields** -- add more columns to the table and more fields to the extract schema.

## Scheduling

The workflow runs on a cron schedule defined in `src/workflows/enrichment-pipeline.ts`:

```typescript
schedule: '0 9 * * *' // Every day at 9:00 AM UTC
```

Common alternatives:

- `"0 */6 * * *"` -- every 6 hours
- `"0 9 * * 1-5"` -- weekday mornings only
- `"*/30 * * * *"` -- every 30 minutes

The trigger in `src/triggers/daily-enrichment.ts` also fires on `register` (bot startup) so the pipeline runs once immediately during development.

## Adding Integrations

This template starts with no integrations. To extend it:

```bash
# Send enrichment reports to Slack
adk integrations add slack@latest

# Sync contacts from a CRM
adk integrations add salesforce@latest

# Send email summaries
adk integrations add sendgrid@latest
```

## Project Structure

- `src/tables/` -- ContactsTable schema
- `src/actions/` -- AI enrichment action
- `src/workflows/` -- Enrichment pipeline workflow
- `src/triggers/` -- Scheduled trigger
- `src/conversations/` -- Unused (backend agent)
- `src/knowledge/` -- Unused (no RAG needed)

## Learn More

- [ADK Documentation](https://botpress.com/docs/adk)
- [Botpress Platform](https://botpress.com)
