# @holocronlab/botruntime-api

Build-time-only bootstrap seam (see `docs/adr/0005-opapi-as-source-of-truth.md`).

Re-exports the upstream opapi definitions pinned to the exact version that
produced `@botpress/client@1.46.0` (`@botpress/api@1.108.0`), and provides a
`gen` script that emits the canonical OpenAPI 3 documents into `openapi/`:

- `openapi/public.json`
- `openapi/runtime.json`
- `openapi/admin.json`
- `openapi/files.json`
- `openapi/tables.json`
- `openapi/billing.json`
- `openapi/openapi.json` (public + admin + runtime combined)

This package is `private: true` and is never published or consumed as a
runtime dependency. Its `@botpress/api` / `@bpinternal/opapi` dependencies are
a documented, temporary bootstrap exception (ADR-0005): they exist only to
produce the frozen canonical spec that downstream `botruntime-*` packages are
generated from. Nothing here ships to end users.

## Usage

```sh
bun install
bun run gen
```
