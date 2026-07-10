# Project contract

The main files are:

- `agent.config.ts` for agent metadata, model selection, state, and declared dependencies;
- `src/conversations/` for channel handlers;
- `src/actions/` for reusable typed work;
- `src/workflows/` for resumable multi-step work;
- `src/triggers/` for events;
- `src/tables/` for durable structured data;
- `src/knowledge/` for retrieval sources;
- `.adk/` for generated local metadata and dependency snapshots.

Do not edit generated `.adk/` snapshots by hand. Use static imports from
`@holocronlab/botruntime-runtime`, inspect generated types when a signature is
unclear, and keep development and production credentials isolated.
