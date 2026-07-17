# Agent instructions

## Formatting safety

Do not run `oxfmt` from the repository root or across `packages/`, `integrations/`,
or `scripts/`. This repository does not have a single formatter baseline yet. The
`oxfmt` dependency belongs to the ADK code generator; it is not a repository-wide
formatter.

The root `.oxfmtrc.json` intentionally ignores the entire checkout so an accidental
CLI invocation fails closed instead of rewriting unrelated files. Preserve the local
style of files you edit. Use a package-owned formatter only when that package exposes
an explicit formatting script and scope it to the files you changed.

Do not weaken or remove this guard as part of an unrelated change. A future
repository-wide formatting migration must be a dedicated change with its own baseline.
