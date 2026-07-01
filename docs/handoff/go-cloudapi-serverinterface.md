# Handoff: wiring the Go cloudapi to the botruntime OpenAPI contract

**Audience:** the `botforge` repo (Go `cloudapi`). This repo (`botruntime-packages`) owns the
API *definitions* and emits the *frozen canonical spec*; `botforge` implements the server side
of that spec and keeps it in lockstep via the Go compiler. See `docs/adr/0005-opapi-as-source-of-truth.md`.

## What this repo produces

| Artifact | Path | What |
|---|---|---|
| Canonical spec (merged) | `packages/botruntime-api/openapi/openapi.json` | The `/v1` server contract (admin+runtime+files+tables+public unioned). ~71 client path templates / 130 raw `/v1` paths. |
| Per-section specs | `packages/botruntime-api/openapi/{public,admin,runtime,files,tables,billing}.json` | Same, split by section. `billing` is `/v2`, versioned separately. |
| oapi-codegen config | `packages/botruntime-api/oapi-codegen.yaml` | Ready-to-use config (oapi-codegen v2.6.0). |

These are regenerated deterministically from the pinned bootstrap `@botpress/api@1.108.0` (the
version that produced `@botpress/client@1.46.0`) by `scripts/regen.sh`. The pin is a documented,
temporary, **build-time-only** exception (ADR-0005); nothing Botpress ships at runtime.

## The lockstep mechanism (strength order)

1. **Go compiler via the generated `ServerInterface`** — the primary guardrail.
2. **CI drift-check** — `scripts/check-drift.sh`: regenerate, `git diff --exit-code` must be clean.
3. **Golden contract tests** — the real `@holocronlab/botruntime-client` against a running cloudapi.

## Step-by-step (in botforge)

1. **Get the spec into botforge.** Either vendor `openapi/openapi.json` into botforge, add
   `botruntime-packages` as a git submodule, or publish the spec as a release asset and fetch it.
   Whichever you choose, pin it so drift is detectable.

2. **Generate the server interface.** Copy `oapi-codegen.yaml` next to the vendored spec and pick
   the server flavor that matches botforge's router (`std-http-server` by default; swap to
   `chi-server` / `echo-server` / `gin-server`). Then:

   ```bash
   oapi-codegen -config oapi-codegen.yaml path/to/openapi.json
   # -> gen/botruntime_api.gen.go  (models + ServerInterface, strict server)
   ```

3. **Implement `ServerInterface`.** Have the cloudapi handler struct implement every method of the
   generated `ServerInterface` (with `strict-server: true`, request/response types are generated too).
   Because the interface is exhaustive, **the Go build fails until every endpoint is implemented** —
   that is the enforcement. Register the generated router (`HandlerFromMux` / `RegisterHandlers`)
   on botforge's existing mux.

4. **Wire drift into CI (botforge side).** On each build, regenerate `gen/botruntime_api.gen.go`
   from the pinned spec and `git diff --exit-code`; fail on drift. When this repo bumps the pinned
   `@botpress/api` version and the spec changes, botforge's build breaks at exactly the handlers that
   no longer match — intended.

## Wire contract — do not alter

Preserved verbatim from upstream (contract, not branding):

- HTTP paths: `/v1/...` (and `/v2/...` for billing).
- Headers: `x-bot-id`, `x-integration-id`, `x-integration-alias`, `x-workspace-id`.
- The client sends `Authorization` / token + these headers exactly as upstream.

The only visible change is the default host (`api.botpress.cloud` → `botruntime.ru`), which lives in
the client's `src/common/config.ts` and is overridable via the `BP_API_URL` env var — **not** part
of the spec/server contract.

## Open coupling owned by botforge

- **Publishing.** `@holocronlab/botruntime-*` are consumed locally via `file:` specs. To publish
  (so `brt` and scaffolded bot projects can `npm install` them), convert `file:` → registry versions
  and publish `botruntime-{zui,tunnel,verel,yargs-extra,const,client,sdk,chat}` (GitHub Packages,
  per each package's `publishConfig.registry`). `brt`'s templates already reference
  `@holocronlab/botruntime-sdk@6.13.0` / `botruntime-client@1.46.0`.
