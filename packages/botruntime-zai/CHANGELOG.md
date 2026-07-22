# @holocronlab/botruntime-zai

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-zai`.

Zui AI (zai) — an LLM utility library built on Zui and the botruntime Cognitive client. See
README.md.

## 2.8.5 (current) — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.1

## 2.8.4 — 2026-07-21

- Port Botpress fixes for recursive ZUI schemas, JSON Schema `oneOf`, stale micropatch line references, bounded rewrite output, and slow CLI API operations while preserving local compatibility contracts.

## 2.8.3 — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.0

## 2.8.2 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.7.2

## 2.8.1

- feat(runtime): remove legacy cognitive and config fallbacks (#90)
- fix release train closure and mask secret prompts (#95)
- feat(botruntime): fork the `@botpress/runtime` dependency closure (zero-botpress cascade) (6495425)
