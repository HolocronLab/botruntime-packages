# @holocronlab/botruntime-sdk

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-sdk`.

Fork of `@botpress/sdk@6.13.0` src, repointed at `botruntime-client` + `botruntime-zui`. SDK for
building bots and integrations on botruntime. See README.md.

## 7.0.0 (current) — 2026-07-28

- Made durable file streams resume the exact pinned generation after a bounded
transport interruption.

Durable operation handlers now receive an `abortSignal` for cooperative
cancellation and no longer receive the general integration client. The
operation token remains private to the scoped files and checkpoint transports.

## 6.20.0 — 2026-07-27

- Added the durable integration-operation v1 boundary: operation-scoped streaming
access to pinned file generations, fenced append-only checkpoints, strict
sanitized handler envelopes, and schema-declared FileRef admission.

## 6.19.7 — 2026-07-27

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.54.1

## 6.19.6 — 2026-07-27

- Synchronized runtime-owned workflow status updates with the SDK handler state chain so downstream handlers observe completed, failed, listening, and in-progress states without stale pending warnings.

## 6.19.5 — 2026-07-27

- Exposed `reserveTableKey` and `atomicTables` on `BotSpecificClient`, preserving client hooks and receiver binding so runtime table consistency primitives work in generated bots.

## 6.19.4 — 2026-07-27

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.54.0

## 6.19.3 — 2026-07-27

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

## 6.19.2 — 2026-07-24

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.52.0

## 6.19.1 — 2026-07-24

- Forward the runtime-host abort signal to native integration operation handlers so long-running providers can stop cooperatively without changing delivery outcome classification.

## 6.19.0 — 2026-07-23

- Added authenticated exact-FileRef streaming to the public client and typed bot/integration SDK clients. The method returns a raw Web ReadableStream and never materializes the file as base64, Buffer, or ArrayBuffer. The read-only operation status union also recognizes the platform's audited `abandoned` terminal state; no client-side abandon mutation is exposed.

## 6.18.0 — 2026-07-23

- Added typed public and bot SDK methods to start, inspect, and cancel durable integration operations.

## 6.17.0 — 2026-07-23

- Added optional optimistic concurrency tokens to State API reads and writes. `TrackedState` now echoes server-issued versions on subsequent saves, detects concurrent updates without replaying them, and falls back to legacy last-write-wins behavior when connected to an older server. Oversized snapshots use version-scoped content-addressed files, clean up superseded generations after successful CAS, and recover once when a concurrent save removes a stale file pointer.

## 6.16.0 — 2026-07-23

- Added a definition-owned `maxConcurrency` contract for integrations. Definitions remain serial by default and can opt in to at most four concurrent invocations.

## 6.15.2 — 2026-07-23

- Wait through the complete integration host lifecycle and advertise a bounded, relative action-response budget derived from the effective transport and current runtime invocation deadlines. Replay action calls only when Cloud explicitly reports that execution was not started and is retryable; workflow steps now stop on non-retryable or outcome-unknown integration execution failures.

## 6.15.1 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.1

## 6.15.0 — 2026-07-22

- Added definition-owned `maxExecutionTime` for integration operations. The SDK
validates the platform deadline and BRT preserves it on
create/update/dry-run requests, including resetting removed overrides to the
45-second platform default.

## 6.14.0 — 2026-07-22

- Added typed `maxExecutionTime` configuration for classic bot definitions and
ADK agents. `brt dev` and `brt deploy --adk` now carry the configured
per-invocation deadline to the platform instead of silently dropping it.

## 6.13.8 — 2026-07-21

- Обновлены внутренние зависимости: @holocronlab/botruntime-zui@2.3.1

## 6.13.7 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.46.7

## 6.13.6 — 2026-07-19

- Added a typed integration delivery outcome contract and returned provider ACK tags to the host so Cloud can distinguish definitive failures from ambiguous post-dispatch timeouts without unsafe automatic retries.

## 6.13.5

- feat(sdk,brt): egress network policy в контракте определения интеграции (DEVLP-145) (d1e2c94)
- feat(integrations): publish provider-verified webhook contract (8e5f126)
- feat: add hosted eval and chat platform support (ec9d6d4)
