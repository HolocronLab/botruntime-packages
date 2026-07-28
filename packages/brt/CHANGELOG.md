# @holocronlab/brt

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/brt`.

Full fork of `@botpress/cli` (MIT), rebranded and repointed at our cloudapi (botruntime.ru). Keeps
the native build (codegen + esbuild bundle), local dev/serve, and the cloud deploy/login flow
against our host. **Zero** `@botpress/*` / `@bpinternal/*` deps. See README.md.

## 0.12.3 (current) — 2026-07-28

- Кодовые production-деплои теперь устанавливают traffic fence и дожидаются завершения закреплённых за старым bundle задач перед активацией новой версии.

## 0.12.2 — 2026-07-28

- Исправлены повторный production deploy legacy agent targets с подтверждённо пустым plugin snapshot, атомарное восстановление plugin definition без перезаписи конкурентных изменений и чтение `brt link --key-stdin` из перенаправленного stdin.

## 0.12.1 — 2026-07-28

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.9.6
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.55.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.34
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@7.0.0

## 0.12.0 — 2026-07-27

- Added the durable integration-operation v1 boundary: operation-scoped streaming
access to pinned file generations, fenced append-only checkpoints, strict
sanitized handler envelopes, and schema-declared FileRef admission.

## 0.11.6 — 2026-07-27

- Added `brt bots deployments abort` as a fail-closed recovery path for safely
abandoning pre-schema staged deployments. It preserves the active version,
uses the current environment fence generation after confirmation, supports an
already-performed traffic unfence, and accepts only the exact durable aborted
terminal state.

## 0.11.5 — 2026-07-27

- Made classic `brt dev` apply and verify table key contracts instead of reporting schema-only updates as successful. Generated bots now use the canonical string `keyColumn` plus `keyColumnUnique` shape, and the control-plane client exposes the durable unique-key transition required for existing development tables. `brt dev --check` now fails closed when the cached development target differs from the declared contract, while production table publishing remains verify-only and directs changes through staged ADK deployments.

## 0.11.4 — 2026-07-27

- Updated the coherent BRT/ADK runtime train to deliver synchronized workflow handler state tracking.

## 0.11.3 — 2026-07-27

- Fixed `brt run` for agents installed with Bun's isolated workspace linker so generated runners no longer require manually hoisted internal runtime packages, including cached runs, and made dev readiness reject stale generated dependency links.

## 0.11.2 — 2026-07-27

- Fixed `brt run` regeneration by using BRT's native dependency installer and build command in-process instead of asking ADK to launch a second cached CLI.

## 0.11.1 — 2026-07-27

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.9.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.54.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.31
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.19.4

## 0.11.0 — 2026-07-27

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

## 0.10.0 — 2026-07-26

- Added `brt run` for one-shot agent scripts with explicit dev/prod target
selection, development config-var inheritance and child exit-code propagation.
- Added `brt workflows run|list|show|wait` over the existing durable workflow
engine with idempotent starts, separate observation and execution deadlines,
bounded history, and privacy-safe default projections.

## 0.9.8 — 2026-07-24

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.6.4
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.52.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.29
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.19.2

## 0.9.7 — 2026-07-24

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.6.3
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.19.1

## 0.9.6 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.6.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.51.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.28
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.19.0

## 0.9.5 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.6.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.50.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.27
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.18.0

## 0.9.4 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.6.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.49.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.26
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.17.0

## 0.9.3 — 2026-07-23

- Added a definition-owned `maxConcurrency` contract for integrations. Definitions remain serial by default and can opt in to at most four concurrent invocations.
- Made `brt conversations show` bounded to 20 trace rows by default and added shared `since`, `until`, `limit`, and resumable `nextToken` filters without expanding the metadata-only timeline.

## 0.9.2 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.5.3
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.24
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.15.2

## 0.9.1 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.5.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.23
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.15.1

## 0.9.0 — 2026-07-22

- Added definition-owned `maxExecutionTime` for integration operations. The SDK
validates the platform deadline and BRT preserves it on
create/update/dry-run requests, including resetting removed overrides to the
45-second platform default.

## 0.8.0 — 2026-07-22

- Added typed `maxExecutionTime` configuration for classic bot definitions and
ADK agents. `brt dev` and `brt deploy --adk` now carry the configured
per-invocation deadline to the platform instead of silently dropping it.

## 0.7.25 — 2026-07-21

- Port Botpress fixes for recursive ZUI schemas, JSON Schema `oneOf`, stale micropatch line references, bounded rewrite output, and slow CLI API operations while preserving local compatibility contracts.

## 0.7.24 — 2026-07-21

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.4.1

## 0.7.23 — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.4.0

## 0.7.22 — 2026-07-20

- Persist the current production webhook secret returned by `brt integrations register` in the exact profile and bot credential entry without printing it.

## 0.7.21 — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.2.15
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.20

## 0.7.20 — 2026-07-20

- Keep hosted-eval terminal polling alive across bounded transient read failures, return the linked terminal EvalRun when Cloud has already finalized it, and stop requesting unsupported Files expiry for runtime-owned state and Telegram image swaps.

## 0.7.19 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.2.13
- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.46.7
- Обновлены внутренние зависимости: @holocronlab/botruntime-evals@2.1.19
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.7

## 0.7.18 — 2026-07-19

- Accept canonical `integration_delivery` / `integration.delivery` rows and filters so `brt traces` can inspect outbound provider receipts without rejecting the Cloud response.

## 0.7.17 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-adk@2.2.12
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.6

## 0.7.16 — 2026-07-19

- Run `brt deploy --adk` type checking through the project's own `tsc` executable, adding compatibility with native TypeScript 7 while preserving TypeScript 5/6 diagnostics and `--noEmit` safety.

## 0.7.15 — 2026-07-18

- Removed `templates/empty-bot` and its dead `bot` entry in `ProjectTemplates`: `brt init` for a bot
project has always generated an ADK project in-process (`AgentProjectGenerator`, template `blank`/
`hello-world`) and never read this table, so the template was unreachable scaffold-copy code left
over from the pre-ADK-collapse Botpress-native bot architecture (`BotDefinition` + `.botpress/`).
Also added a CI gate (`scripts/botpress-banlist.mjs`) that fails the build if a real `@botpress/*`
import ever lands in `packages/brt/templates/` or the vendored ADK skill docs again.
- Parse relative `logs --since/--until` durations into RFC3339 using the same validated time-filter contract as traces and conversations.

## 0.7.14 — 2026-07-18

- `brt --help` now ends with a link to this package's CHANGELOG.md, so "what changed?" has an answer
without leaving the terminal. `brt --version` stays a bare, machine-readable semver string (`CLI_VERSION`,
also used for the ADK compatibility check) — the link never appears in its output.

## 0.7.12

- brt deploy --adk: блокирующая проверка типов до сборки (DEVLP-173) (#108)
- fix(brt): allow multiple integration installs (#107)
- fix(brt): provision production chat / manage production config / manage production integrations
  with workspace PAT (#104-#106) — workspace-PAT parity across chat, config, and integrations
