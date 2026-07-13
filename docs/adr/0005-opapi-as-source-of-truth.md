# ADR-0005: opapi definitions as the single source of truth for the Botpress-shaped API

Status: Accepted (2026-07-01)
Branch: `fork-botpress-deps`

## Context

`packages/brt` (fork of `@botpress/cli`, published as `@holocronlab/brt`) must have
**zero** `@botpress/*` and `@bpinternal/*` runtime dependencies. Its typed API surface
comes from `@botpress/client@1.46.0`, whose types are **codegenerated**: `client/src/index.ts`
imports `./gen/public/models` etc., and `gen/` is produced by `client/openapi.ts`, which
imports `{ runtimeApi, adminApi, filesApi, tablesApi, api, billingApi }` from `@botpress/api`
and calls `exportClient()` on each (via `@bpinternal/opapi`, MIT). `gen/` is gitignored and
absent from source, so the client cannot be forked from source without running that codegen.

Constraints discovered:
- npm's `@botpress/api` ships **only compiled dist** (`main=dist/index.js`), **not** the
  opapi definition source (`models/`, `operations/`, `api.ts`). Latest is `1.112.0`.
- The `@botpress/api` version aligned to `client@1.46.0` by publish date is **`1.108.0`**
  (published 2026-05-25, ~4.5h before client 1.46.0 the same day).
- `@bpinternal/opapi@1.0.0` is public and MIT.
- Hard requirement: the regenerated client must be **byte-identical** to the installed
  `@botpress/client@1.46.0` oracle (`index.d.ts` = 39,674 lines; 71 `/v1` path templates)
  so `sdk`/`brt` remain drop-in.

## Decision

Adopt **Option A + a migration gate** (informed by an OpenAI Codex architecture consult).

1. **Bootstrap oracle (temporary, build-time only):** `packages/botruntime-api` pins
   `@botpress/api@1.108.0` as a **build-time devDependency**. Its `gen` script calls
   `exportClient()` → `gen/` and `exportOpenapi()` → `openapi.json`.
2. **Shipped artifacts carry zero runtime Botpress deps:** `packages/botruntime-client`
   ships the generated `gen/` + forked client source; `openapi.json` is committed.
3. **Chosen over TypeSpec** because only opapi yields the byte-exact client the fork needs;
   TypeSpec would give clean OpenAPI but a differently-shaped client, breaking the drop-in
   fork. (Keep TypeSpec for our OWN dashboard/human API.)
4. **Durable owned source of truth is GENERATED, not hand-written:** once byte-equivalence
   is proven, the pinned `openapi.json` becomes the frozen canonical spec, and owned opapi
   definitions are produced by a deterministic `openapi → opapi DSL` generator. Hand-rebuilding
   71 endpoints / 39k-line types is explicitly rejected (byte-drift risk).

### Sync mechanism (strength order)
1. Go compiler via generated `ServerInterface` — `openapi.json` → `oapi-codegen`
   (`-generate types,server`) → Go `ServerInterface`; cloudapi handlers implement it, so
   add/rename/remove endpoint ⇒ Go build fails until handlers match. (Go side lives in the
   **botforge** repo, not here.)
2. CI drift-check: regenerate all, `git diff` must be clean.
3. Golden contract tests: real client against cloudapi.

### Golden checks (CI must fail on drift)
- generated `botruntime-client` `index.d.ts` **byte-equals** installed `@botpress/client@1.46.0`.
- normalized `openapi.json` contains the expected **71 `/v1` paths**.
- generated `botruntime-client` has **no** runtime `@botpress/*` or `@bpinternal/*`.
- opapi generator options pinned exactly: `ignoreDefaultParameters`, `ignoreSecurity`,
  `generator: 'opapi'`.

## Consequences / temporary exception

- A backend-compatible extension absent from the pinned upstream schema must be
  deterministic, tested, and applied by `scripts/regen.sh` to both OpenAPI and
  generated client sources. The first such extension is the system
  `rowVersion` optimistic-CAS field, implemented in
  `scripts/apply-table-row-version-extension.mjs`. Direct hand edits to
  generated files remain forbidden and fail the drift check.
- `packages/botruntime-api` has a **build-time** `@botpress/api@1.108.0` dependency. This is a
  documented, temporary ADR exception — **not** a runtime dependency and not present in any
  published package's runtime deps. It is removed once the `openapi → opapi` generator lands
  and equivalence is proven from the frozen spec.
- Pin exact versions + lockfile integrity; mirror/cache the `@botpress/api` tarball for
  reproducibility; keep upstream license notices.

## Wire contract (must never change — contract, not branding)
- HTTP path strings (`/v1/...`), `x-*` headers (`x-bot-id`, `x-integration-id`,
  `x-integration-alias`, `x-workspace-id`), and `BP_*` env vars (`BP_API_URL`, `BP_TOKEN`,
  `BP_BOT_ID`, `BP_INTEGRATION_ID`, `BP_WORKSPACE_ID`). Only the baked-in default URL changes:
  `api.botpress.cloud` → `https://botruntime.ru` (client `src/common/config.ts`).
