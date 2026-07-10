# Holocron agent project

This TypeScript project uses `@holocronlab/botruntime-runtime`. Treat `brt` as
the only executable CLI; the framework library does not expose another one.

## Project map

- `agent.config.ts` — metadata, models, state, and declared dependencies
- `src/conversations/` — channel handlers
- `src/actions/` — reusable typed operations
- `src/workflows/` — resumable multi-step work
- `src/triggers/` — event handlers
- `src/tables/` — durable structured data
- `src/knowledge/` — retrieval sources
- `.adk/` — generated target metadata and dependency snapshots

Do not edit `.adk/` snapshots manually. Development and production are separate
targets and must use separate credentials.

## Supported commands

```bash
brt dev               # stateful development reconciliation and watch loop
brt dev --check       # read-only readiness check after development state exists
tsc --noEmit          # local TypeScript validation
brt deploy --adk      # production reconciliation and deployment
brt profiles active   # selected CLI profile
```

`brt integrations list`, `brt integrations get <id>`, and
`brt integrations install <name>` are real integration surfaces. Installation
changes remote state and requires confirmation unless explicitly requested.

`brt chat` is experimental, interactive, and starts a new conversation. Use a
real configured channel for acceptance testing. `brt logs` is
deployment- and profile-dependent; report an authentication or route rejection
instead of presenting logs as universally available.

The current CLI has no structured trace queries, conversation queries,
workflow execution, eval execution, or project-status command. Do not invent
commands or flags for those features. Use project files, process output, exact
integration round-trips, and the web console when available.

## Engineering rules

- Read `agent.config.ts` and relevant source files before editing.
- Import framework primitives from `@holocronlab/botruntime-runtime`.
- Inspect generated types or installed package declarations when an API is
  unclear; do not guess signatures.
- Run `tsc --noEmit` before declaring code complete.
- Confirm deployment, integration installation, message sending, and other
  remote mutations unless already authorized.
- Never read or display credentials or `.env` contents.
