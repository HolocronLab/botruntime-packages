# ADR-0006: один CLI (brt), движки-библиотеки, MCP как второй фасад

Status: Accepted (2026-07-03, решение заказчика)
Branch: `fork-botpress-deps`

## Context

У Botpress **два** developer-инструмента: `bp` (@botpress/cli — интеграции, плагины,
интерфейсы, классические боты) и `adk` (@botpress/adk — среда разработки агентов:
agent.config.ts + примитивы @botpress/runtime, dev-сервер, Dev Console, трейсы,
эвалы). Исследование 03.07.2026 показало, что это НЕ два параллельных стека:

- `adk` **встраивает** запиненный `bp` и шеллаутится в него для build/deploy/dev/add;
  сборка агента = генерация синтетического классического bp-бота (`.adk/bot`:
  bot.definition.ts + ~12 шимов) + обычный `bp build` (esbuild).
- Вся сборка/типогенерация — отделяемая библиотека `@botpress/adk` (npm, **MIT**;
  ~4.9k строк ядра: AgentProject, BotGenerator, generateLocalTypes). Бинарь CLI —
  тонкая приватная обёртка. Полные исходники восстановимы из sourcemaps npm-тарболов.
  ⚠️ GitHub-репо botpress/adk БЕЗ файла LICENSE (examples+бинари) — форкаем строго
  npm-артефакты.
- Типогенерация: рантайм несёт permissive-заглушки `_types/*`, проектные `.adk/*.d.ts`
  уточняют их ambient module augmentation'ами (zui `toTypescriptType`).

Наше состояние: `packages/brt` — полный форк bp + bespoke cloudapi-провод
(provision-bot, link, config/secret, integrations install/register/publish-bundle,
`deploy --adk`); клозур рантайма форкнут и опубликован
(`@holocronlab/botruntime-runtime@2.0.2` + evals/cognitive/zai/llmz/...); форк
@botpress/adk → `@holocronlab/botruntime-adk` поручён (map-reconstruction).
Единственная дыра: `brt deploy --adk` сегодня шеллаутится в **конкурентский бинарь
adk** за сборкой (`src/adk-bundle.ts`).

Директива заказчика: bp/adk — утилиты конкурентов, в нашем цикле их быть не должно;
легаси «двух CLI» не наследуем — «сразу сделать хорошо».

## Decision

1. **Один бинарь — `brt`.** Второго CLI (bdk и т.п.) не существует. brt распознаёт
   пятый манифест — `agent.config.ts` (agent-проект) — в дополнение к
   integration/interface/bot/plugin, и даёт для него те же глаголы:
   `build`/`check`/`dev`/`deploy`/`chat`.
2. **Движки — библиотеки, не бинари.** Agent-команды brt зовут
   `@holocronlab/botruntime-adk` (форк-библиотеку сборки/типогена) напрямую, как
   приватный cli Botpress зовёт @botpress/adk. Shell-out'ов в чужие бинари нет;
   `src/adk-bundle.ts` заменяется на generateBotProject + наш esbuild-путь.
   Генерённый обёрточный бот таргетит `@holocronlab/botruntime-sdk`.
3. **Облачные привязки adk заменяются нашими 1:1:** dependencies-каталог → hub API
   cloudapi; deployed-agent-manifest → наш Files API; evals → botruntime-evals;
   chat → botruntime-chat; dev-трейсы/логи → cloudapi + веб-консоль (НЕ локальный
   SQLite); туннель → наш /hooks + register.
4. **Не тащим:** второй бинарь; agent0/встроенный OpenCode (роль выполняет Claude
   Code снаружи); их Dev Console UI (растим свою веб-консоль); self-upgrade/
   telemetry/theme.
5. **MCP — второй фасад** над тем же command-core: команды brt — тонкие обёртки
   библиотек, MCP-сервер собирается из тех же кирпичей (дистрибуция платформы —
   MCP-first по стратегии).

## Phases

- **Ф1 (снимает adk с dev-машин):** cutover lawyer-bot на botruntime-runtime →
  brt: agent-тип проекта, build/check через botruntime-adk. DoD: типы и бандл
  бит-в-бит с `adk build` на живом lawyer-bot; adk удалён.
- **Ф2:** `brt dev` для агентов против локального стека (runtime-host+cloudapi,
  watch/rebuild), `brt chat`, logs/traces из cloudapi.
- **Ф3:** `brt evals`; kb/assets — по реальной потребности.
- **Ф4:** command-core → MCP-фасад.

## Consequences

- Внешний разработчик видит ОДИН инструмент на все типы проектов; ментальная
  модель «проект + платформа», без наследования сегментации Botpress.
- Апстрим-velocity (150+ версий adk за 8 мес.) гасим пиннингом; апгрейды — той же
  sourcemap-реконструкцией (проверено на runtime-клозуре).
- brt получает зависимость от botruntime-adk (file: в монорепо, registry при
  публикации — как остальные форки, ADR-0005 publish-coupling).
