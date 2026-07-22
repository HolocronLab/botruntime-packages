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
| `integrations/chat` | First-party HTTP Chat API channel integration, for CLIs, web applications and hosted evaluations. |
| `integrations/megaplan` | Megaplan CRM integration. |
| `integrations/yadisk` | Yandex.Disk storage integration. |
| `integrations/yookassa` | YooKassa payments with API-reverified `payment.succeeded` events. |
| `integrations/pochta` | Russian Post shipment tracking through the official SOAP API. |
| `integrations/territorial-jurisdiction` | Russian district court and magistrate jurisdiction lookup by address or coordinates. |
| `integrations/cloudconvert` | High-fidelity DOCX to PDF conversion through CloudConvert API v2. |

### The runtime libraries (forked Botpress deps → `@holocronlab/botruntime-*`)

`brt` no longer depends on any `@botpress/*` / `@bpinternal/*` package. Its dependency tree was
forked, MIT-attributed, and repointed:

| Package | Source | Approach |
|---|---|---|
| `botruntime-client` | `@botpress/client@1.46.0` | fork src; `gen/` codegenerated from the pinned API. Byte-exact type surface (71 `/v1` path templates). |
| `botruntime-sdk` | `@botpress/sdk@6.13.0` | fork src; repoint client + zui. |
| `botruntime-zui` | `@bpinternal/zui@2.3.1` | fork from source (34k LOC, zero deps). |
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

Classic integration bundles are built with `brt build` and published globally
from the platform workspace via `brt deploy --visibility public`; the
runtime-host pulls them by ref. Agent projects use `brt dev` for the tunnel loop and
`brt deploy --adk` for production — standalone `brt build` is not their entry
point.

## Бамп апстрима форка

Каждый пакет под `packages/*`/`integrations/*`, помеченный в этом README как форк/vendor
Botpress- или `@bpinternal`-пакета, — это скопированный исходник или dist, а не живая
npm-зависимость: апстрим не подтянется сам ни через `bun update`, ни через Renovate/Dependabot
(нечего бампить — нет ranges на реальные `@botpress/*`/`@bpinternal/*` в package.json, см.
`scripts/botpress-banlist.mjs`). `.github/workflows/upstream-watch.yml` еженедельно сверяет
`scripts/upstream-pins.json` с `npm view <пакет> version` и открывает/обновляет issue
`DEVLP-159` с готовой таблицей дрейфа — но фактический ресинк всегда ручной. Чек-лист:

1. **Обновить пин.** Прочитать diff апстрима между текущим `pinned` и целевой версией (issue
   от upstream-watch даёт обе). Перенести реальные изменения в форк (не просто поднять номер
   версии в `upstream-pins.json` — это только запись о факте, а не о работе).
2. **Явно пройтись по `patchedDependencies`.** Если у пакета есть `patches/*.patch`
   (`packages/botruntime-llmz`, `integrations/telegram` — на сегодня единственные два; ищи по
   `patchedDependencies` в package.json, это единственный патч-механизм в репозитории, root
   pnpm-workspace тут нет), проверь **каждый** патч: остаётся ли он актуальным после ресинка,
   нужно ли переприменить вручную. Прецедент, ради которого это правило существует: при форке
   `botruntime-llmz` патч на `source-map-js@1.2.1` потерялся молча, и прод-бот замолкал на
   каждой кодогенерации, пока это не поймали (52afff9). `node scripts/check-patched-dependencies.mjs`
   гейтит это машинно: файл патча существует, package.json и bun.lock согласованы, пин реально
   резолвится в lockfile, а обязательные патчи из baseline `scripts/required-patches.json` не
   могут исчезнуть даже вместе со всей декларацией `patchedDependencies` (снятие патча — это
   осознанная правка обоих мест). Гейт не проверяет только, что патч всё ещё *нужен* или
   *корректен* семантически.
3. **`bash scripts/check-drift.sh`** — если бампится `botruntime-api`/`botruntime-client`
   (ADR-0005), это обязательный шаг: регенерирует и падает на любом расхождении с закоммиченным.
4. **Тесты пакета** (`bun test` / `bun run check:type` в его директории) — форк должен
   типчекаться и проходить свой набор самостоятельно, апстрим-тесты не переносятся автоматически.
5. **Changeset.** Правка `src` публикуемого пакета без файла в `.changeset/` не пройдёт
   `changeset-gate` (см. «Версионирование и changelog» выше).

## Documentation contract

Every public `brt` command, flag, target/auth semantic, or remediation change
requires a linked change to Fumadocs in the public botruntime platform repo
(`docs-site/content/docs/cli/` and any affected quickstart). The code and docs
changes must both merge, and `task docs-build` must pass in the platform repo,
before publishing the `brt` release.

`packages/brt/brt-docs-contract.json` is the machine-readable inventory of the
live command tree plus curated public workflows, critical options and semantic
requirement IDs. Regenerate and verify it with:

```bash
cd packages/brt
bun run docs:contract:generate
bun run docs:contract:check
bun run docs:contract:test
```

CI also checks the contract against Fumadocs from public `HolocronLab/botforge`
`main`. For additions and semantic changes, merge backward-compatible docs
first and then the CLI/contract change. For removals, retain the old docs contract ID
or command path until the CLI/contract removal reaches this repository's
`main`, then remove the stale docs in a follow-up. The platform repository
documents the three-step bootstrap needed when enabling the gate for the first
time; after that bootstrap, cross-repo drift fails closed in both directions.

## Версионирование и changelog

Каждый публикуемый пакет (`packages/*` с `private: false`) хранит собственный
`CHANGELOG.md`. При правке, которая меняет `src` такого пакета, добавь файл в
`.changeset/` (формат и пример — `.changeset/README.md`): он описывает пакет,
уровень bump (`patch`/`minor`/`major`) и суть изменения для потребителя. CI-гейт
`changeset-gate` в `.github/workflows/ci.yml` падает, если правка затрагивает
`src` публикуемого пакета без такого файла. Перед релизом `node
scripts/changeset-version.mjs` собирает накопленные changeset-файлы, бампит
версии и дописывает `CHANGELOG.md`; сама публикация в npm остаётся ручной
(`npm publish` / тег-триггер `publish-public-packages.yml`) — версия-скрипт её
не запускает.

## License

MIT. Portions derived from Botpress (`@botpress/*`, `@bpinternal/*`), also MIT — each forked package
keeps a `LICENSE` with the Botpress copyright plus a HolocronLab attribution line.
