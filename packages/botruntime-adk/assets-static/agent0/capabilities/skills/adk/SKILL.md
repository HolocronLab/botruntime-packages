---
name: adk
description: Build and diagnose Holocron TypeScript agents using the shipped runtime and brt CLI
---

# Holocron agent development

Use this skill for projects built on `@holocronlab/botruntime-runtime`.

## Rules

- Read `agent.config.ts` and the relevant `src/` files before editing.
- Import runtime primitives only from `@holocronlab/botruntime-runtime`.
- Treat `brt` as the only executable CLI. The library package does not expose a
  second command.
- Run `tsc --noEmit` for local type validation.
- Use `brt dev` for a stateful development run. Use `brt dev --check` only after
  that state exists and a read-only readiness check is appropriate.
- Use `brt deploy --adk` for an ADK production deployment.
- Confirm operations that deploy, install integrations, send messages, or
  otherwise change remote state unless the developer already requested them.

## Available evidence

Project files, process output, real integration round-trips, and the web console
are valid evidence. `brt chat` is experimental, interactive, and starts a new
conversation. Runtime logs are deployment- and profile-dependent.

There are no structured CLI commands for trace queries, conversation queries,
workflow execution, eval execution, or project status. Do not invent them.

Read [cli.md](references/cli.md) for the supported command subset and
[project.md](references/project.md) for project conventions.
