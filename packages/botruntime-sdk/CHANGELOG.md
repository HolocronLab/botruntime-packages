# @holocronlab/botruntime-sdk

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-sdk`.

Fork of `@botpress/sdk@6.13.0` src, repointed at `botruntime-client` + `botruntime-zui`. SDK for
building bots and integrations on botruntime. See README.md.

## 6.19.0 (current) — 2026-07-23

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
