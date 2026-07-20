# @holocronlab/botruntime-llmz

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-llmz`.

An LLM-native TypeScript VM (code-generation agent framework) built on `@holocronlab/botruntime-zui`.
See README.md.

## 0.0.89 (current) — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.0

## 0.0.88 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.46.7
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.7.2

## 0.0.87

- fix(botruntime-llmz): restore Botpress source-map-js patch (0.0.85) — re-applies the upstream
  esbuild `keepNames`/minify patch that the fork had lost, root cause of a prod
  `i is not defined` outage on every code-generation turn (52afff9)
- feat(botruntime): fork the `@botpress/runtime` dependency closure (zero-botpress cascade) (6495425)
- fix release train closure and mask secret prompts (#95)
