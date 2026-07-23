# @holocronlab/botruntime-llmz

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-llmz`.

An LLM-native TypeScript VM (code-generation agent framework) built on `@holocronlab/botruntime-zui`.
See README.md.

## 0.1.5 (current) — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.48.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.4

## 0.1.4 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.3

## 0.1.3 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.2

## 0.1.2 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.1

## 0.1.1 — 2026-07-21

- Обновлены внутренние зависимости: @holocronlab/botruntime-zui@2.3.1

## 0.1.0 — 2026-07-20

- Forward incoming PDF files to multimodal models through the existing URL and MIME-type contract, including PDFs inside bloc messages. Images remain native, while unsupported files such as DOCX stay available only as structured message metadata.

## 0.0.89 — 2026-07-20

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
