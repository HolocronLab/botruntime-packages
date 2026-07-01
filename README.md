# botruntime-packages

Public packages for the **botruntime** platform. MIT-derived from [Botpress](https://github.com/botpress/botpress).

The proprietary platform (cloudapi backend, bot domain) lives in a separate private repo; only the
public, reusable pieces live here.

## Contents

### The CLI + integrations

| Package | What |
|---|---|
| `packages/brt` | The `brt` CLI — a fork of `@botpress/cli` repointed to the botruntime cloud (native `build` = codegen + bundle, `deploy`, `integrations`, …). Fully self-contained: **zero** `@botpress/*` / `@bpinternal/*` deps. |
| `integrations/telegram` | Telegram channel integration (fork of `@botpress/telegram`), patched for the botruntime cloudapi. |
| `integrations/megaplan` | Megaplan CRM integration. |
| `integrations/yadisk` | Yandex.Disk storage integration. |

### The runtime libraries (forked Botpress deps → `@holocronlab/botruntime-*`)

`brt` no longer depends on any `@botpress/*` / `@bpinternal/*` package. Its dependency tree was
forked, MIT-attributed, and repointed:

| Package | Source | Approach |
|---|---|---|
| `botruntime-client` | `@botpress/client@1.46.0` | fork src; `gen/` codegenerated from the pinned API. Byte-exact type surface (71 `/v1` path templates). |
| `botruntime-sdk` | `@botpress/sdk@6.13.0` | fork src; repoint client + zui. |
| `botruntime-zui` | `@bpinternal/zui@2.3.0` | fork from source (34k LOC, zero deps). |
| `botruntime-chat` | `@botpress/chat@0.5.5` | vendor dist (not the byte oracle). |
| `botruntime-tunnel` | `@bpinternal/tunnel@0.1.25` | fork from npm source. |
| `botruntime-verel` | `@bpinternal/verel@0.2.0` | vendor dist (VRL/wasm executor). |
| `botruntime-yargs-extra` | `@bpinternal/yargs-extra@0.0.21` | vendor dist. |
| `botruntime-const` | `@bpinternal/const` | reimplement the one used symbol (`prefixToObjectMap`). |
| `botruntime-api` | `@botpress/api` (build-time pin) | opapi bootstrap; emits the canonical OpenAPI spec. See ADR-0005. |

Cross-package deps use `file:` specs for local dev; publishing converts them to registry versions.

## API source of truth & codegen

The Botpress-shaped API is defined via opapi and is the single source of truth for **both** the
byte-exact TS client and the OpenAPI spec that drives the Go cloudapi. See
[`docs/adr/0005-opapi-as-source-of-truth.md`](docs/adr/0005-opapi-as-source-of-truth.md).

- **Regenerate** everything: `scripts/regen.sh`
  (`botruntime-api` emits `openapi/*.json`; `botruntime-client` regenerates `src/gen` + `dist`).
- **CI drift-check**: `scripts/check-drift.sh` (regenerate, `git diff --exit-code`).
- **Go side** (in the `botforge` repo): `packages/botruntime-api/oapi-codegen.yaml` +
  [`docs/handoff/go-cloudapi-serverinterface.md`](docs/handoff/go-cloudapi-serverinterface.md).

Bundles are built with `brt build` (the native Botpress pipeline) and published to the botruntime
cloud catalog via `brt integrations publish`; the runtime-host pulls them by ref.

## License

MIT. Portions derived from Botpress (`@botpress/*`, `@bpinternal/*`), also MIT — each forked package
keeps a `LICENSE` with the Botpress copyright plus a HolocronLab attribution line.
