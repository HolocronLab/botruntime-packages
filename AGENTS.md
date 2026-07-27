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

## Worktree dependency safety

For a focused runtime-package checkout, install dependencies with:

```bash
bash scripts/install-package-for-worktree.sh <package-name>
```

The helper requires the same Bun version as CI, installs with `--no-save
--ignore-scripts`, supplies the shared patches directory only for the duration of
the install, and fails if `package.json` or `bun.lock` changes.

Never copy or symlink `node_modules` from another checkout or worktree. Do not
use `bun install --frozen-lockfile` for a focused package whose recursive
`file:` dependency graph hits Bun 1.3.14's nested-lock limitation.

When Codex runs with `workspace-write`, Git metadata (including an external
worktree's resolved `gitdir`) is protected. Prefer a Codex-managed worktree and
Handoff, or use narrowly scoped approval for the required Git operation; do not
work around the protection by sharing dependency directories.
