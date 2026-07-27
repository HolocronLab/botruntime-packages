# Agent instructions

## Platform applicability check

Treat all `botruntime` packages and integrations as multi-tenant platform
functionality. Design them for thousands of independently developed bots, with
thousands of users per bot, rather than for one bot, one customer, or the first
use case that exercises the feature.

For every new core, API, database, package, or integration contract, explicitly
separate:

- the reusable mechanism;
- versioned platform ceilings, quotas, tenant-isolation rules, and security
  policy;
- consumer-, provider-, action-, and workflow-specific semantics.

A path, limit, key, workflow, provider behavior, or naming convention from the
first consumer must not become a platform constant without a separate capacity
or security rationale. Before implementation, validate the mechanism against at
least two materially different scenario classes outside the original bot. A
variation of the same scenario or another step in the same workflow does not
count as a second class.

Keep genuinely consumer-specific behavior in the bot or in the narrow
provider/action adapter that owns it. Shared integration infrastructure and
published integrations must still be safe and reusable across arbitrary bots
and tenants; they must not encode a particular bot identity, customer workflow,
or deployment.

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
