# @holocronlab/brt

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/brt`.

Full fork of `@botpress/cli` (MIT), rebranded and repointed at our cloudapi (botruntime.ru). Keeps
the native build (codegen + esbuild bundle), local dev/serve, and the cloud deploy/login flow
against our host. **Zero** `@botpress/*` / `@bpinternal/*` deps. See README.md.

## 0.7.17 (current) — 2026-07-19

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
