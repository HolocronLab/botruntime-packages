# Changesets

This directory holds one Markdown file per pending release note, in the same
frontmatter shape popularized by `@changesets/cli` — familiar if you've used
that tool elsewhere. This repo does **not** depend on `@changesets/cli`
itself: there's no root workspace here (every `packages/*` and `integrations/*`
directory is its own standalone project with its own `bun.lock`), which is
exactly the shape that tool's package discovery assumes and doesn't have. See
`docs/adr/` for the repo's actual release model (manually-committed exact
versions, closure-checked by `scripts/release-version-closure.mjs`). The two
scripts in `../scripts/changeset-*.mjs` are a small bespoke mechanism that fits
that model instead of fighting it.

## Adding a changeset

Create a file here, e.g. `.changeset/fix-telegram-webhook-retry.md`:

```
---
"@holocronlab/brt": patch
---

Fixed a race in `brt deploy --adk` that could double-apply a bundle on retry.
```

- The frontmatter keys are npm package names under `packages/*` (must be a
  currently-published one — `private: false` in that package's
  `package.json`). List more than one if the change spans packages.
- Bump levels follow semver: `patch` (fix, no API change), `minor` (new,
  backward-compatible capability), `major` (breaking change).
- The body is free text: what changed and, importantly, what a consumer
  updating past this version should watch for. This is the text that ends up
  in the package's `CHANGELOG.md`.
- One changeset can cover a whole PR; you don't need one file per commit.

## When a changeset is required

CI (`changeset-gate` in `.github/workflows/ci.yml`) fails the PR if it touches
a published package's source (`packages/<name>/**`, excluding tests, `dist/`,
`CHANGELOG.md`, `README.md`) without an accompanying changeset file declaring
that package. There is no `--empty` bypass here — if the change is a "no
functional change" refactor, that's still worth one honest changeset line
("Internal refactor, no behavior change.").

Changes that never touch a published package's `src` (docs, `integrations/*`,
CI-only edits, other repo tooling) never trip the gate and need no changeset.

## Releasing

`node scripts/changeset-version.mjs` (run locally by whoever is about to cut a
release) consumes every pending changeset, bumps each referenced package's
`package.json` version, prepends the corresponding `CHANGELOG.md` section, and
deletes the consumed files. Pass `--dry-run` to preview without writing. This
script only edits the working tree — it does not commit, tag, or publish;
publishing stays the existing manual `npm publish` / tag-triggered
`publish-public-packages.yml` flow (see the root README).
