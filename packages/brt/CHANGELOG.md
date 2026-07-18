# @holocronlab/brt

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/brt`.

Full fork of `@botpress/cli` (MIT), rebranded and repointed at our cloudapi (botruntime.ru). Keeps
the native build (codegen + esbuild bundle), local dev/serve, and the cloud deploy/login flow
against our host. **Zero** `@botpress/*` / `@bpinternal/*` deps. See README.md.

## 0.7.14 (current) — 2026-07-18

- `brt --help` now ends with a link to this package's CHANGELOG.md, so "what changed?" has an answer
without leaving the terminal. `brt --version` stays a bare, machine-readable semver string (`CLI_VERSION`,
also used for the ADK compatibility check) — the link never appears in its output.

## 0.7.12

- brt deploy --adk: блокирующая проверка типов до сборки (DEVLP-173) (#108)
- fix(brt): allow multiple integration installs (#107)
- fix(brt): provision production chat / manage production config / manage production integrations
  with workspace PAT (#104-#106) — workspace-PAT parity across chat, config, and integrations
