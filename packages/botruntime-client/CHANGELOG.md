# @holocronlab/botruntime-client

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-client`.

Fork of `@botpress/client@1.46.0` src; `gen/` is codegenerated from the pinned API. Byte-exact type
surface (71 `/v1` path templates) — see `docs/adr/0005-opapi-as-source-of-truth.md` and README.md.

## 1.51.0 (current) — 2026-07-23

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
