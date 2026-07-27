# @holocronlab/botruntime-client

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-client`.

Fork of `@botpress/client@1.46.0` src; `gen/` is codegenerated from the pinned API. Byte-exact type
surface (71 `/v1` path templates) — see `docs/adr/0005-opapi-as-source-of-truth.md` and README.md.

## 1.55.0 (current) — 2026-07-27

- Added the durable integration-operation v1 boundary: operation-scoped streaming
access to pinned file generations, fenced append-only checkpoints, strict
sanitized handler envelopes, and schema-declared FileRef admission.

## 1.54.1 — 2026-07-27

- Made classic `brt dev` apply and verify table key contracts instead of reporting schema-only updates as successful. Generated bots now use the canonical string `keyColumn` plus `keyColumnUnique` shape, and the control-plane client exposes the durable unique-key transition required for existing development tables. `brt dev --check` now fails closed when the cached development target differs from the declared contract, while production table publishing remains verify-only and directs changes through staged ADK deployments.

## 1.54.0 — 2026-07-27

- Raised the Tables schema limit from 20 to 64 user-defined columns. The four system fields (`id`, `rowVersion`, `createdAt`, and `updatedAt`) do not count toward this limit.

## 1.53.0 — 2026-07-27

- Added typed table key reservation with mandatory idempotency, an exact
`{ row, created: boolean }` result, and stable table conflict classification.

Table declarations can opt new tables into physical key uniqueness with
`keyColumn: { name, unique: true }`. ADK preserves that contract through
generation and creation, and fails closed when an existing table requires the
staged server-side contract transition.

Generated table row types now expose mandatory row metadata. The client
generation pipeline reapplies and verifies the handwritten table contract
patches so regeneration cannot silently remove the capability.

Added a typed, idempotent `tables.atomic` batch for single-transaction writes
across multiple tables, including reserve-key result references and durable
replay of the committed result.

Table filters and ordering now accept the physical system fields `id`,
`rowVersion`, and `createdAt` through a closed typed allowlist. BRT deploys
table contract changes through the durable stage, fence, drain, transition,
schema, and activation protocol instead of exposing an intermediate contract.

The SDK dynamic client dispatcher now preserves its operation-specific
input/output correlation when the underlying client exposes generic table
operations.

## 1.52.0 — 2026-07-24

- Added an optional integration operation `resourceKey` so callers can serialize concurrent work targeting the same external resource.

## 1.51.0 — 2026-07-23

- Added authenticated exact-FileRef streaming to the public client and typed bot/integration SDK clients. The method returns a raw Web ReadableStream and never materializes the file as base64, Buffer, or ArrayBuffer. The read-only operation status union also recognizes the platform's audited `abandoned` terminal state; no client-side abandon mutation is exposed.

## 1.50.0 — 2026-07-23

- Added typed public and bot SDK methods to start, inspect, and cancel durable integration operations.

## 1.49.0 — 2026-07-23

- Added optional optimistic concurrency tokens to State API reads and writes. `TrackedState` now echoes server-issued versions on subsequent saves, detects concurrent updates without replaying them, and falls back to legacy last-write-wins behavior when connected to an older server. Oversized snapshots use version-scoped content-addressed files, clean up superseded generations after successful CAS, and recover once when a concurrent save removes a stale file pointer.

## 1.48.0 — 2026-07-23

- Added a definition-owned `maxConcurrency` contract for integrations. Definitions remain serial by default and can opt in to at most four concurrent invocations.

## 1.47.2 — 2026-07-23

- Wait through the complete integration host lifecycle and advertise a bounded, relative action-response budget derived from the effective transport and current runtime invocation deadlines. Replay action calls only when Cloud explicitly reports that execution was not started and is retryable; workflow steps now stop on non-retryable or outcome-unknown integration execution failures.

## 1.47.1 — 2026-07-22

- Extended the default HTTP timeout beyond the Cloud host-call deadline so long-running actions can return their terminal response instead of being disconnected after 60 seconds. Explicit client timeouts are unchanged.

## 1.47.0 — 2026-07-22

- Added definition-owned `maxExecutionTime` for integration operations. The SDK
validates the platform deadline and BRT preserves it on
create/update/dry-run requests, including resetting removed overrides to the
45-second platform default.

## 1.46.7 — 2026-07-19

- Preserve exact HTTP error envelopes through Bun-safe Cognitive v2 transport normalization, and disable automatic retries for non-idempotent generation requests.

## 1.46.6

- fix runtime client scope and dev diagnostics (#93)
- fix(client): authenticate same-origin file uploads (#43)
- feat: add hosted eval and chat platform support (ec9d6d4)
