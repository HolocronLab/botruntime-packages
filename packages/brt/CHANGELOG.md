# @holocronlab/brt

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/brt`.

Full fork of `@botpress/cli` (MIT), rebranded and repointed at our cloudapi (botruntime.ru). Keeps
the native build (codegen + esbuild bundle), local dev/serve, and the cloud deploy/login flow
against our host. **Zero** `@botpress/*` / `@bpinternal/*` deps. See README.md.

## 0.7.24 (current) — 2026-07-21

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
