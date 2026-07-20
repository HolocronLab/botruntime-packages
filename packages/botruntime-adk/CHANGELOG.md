# @holocronlab/botruntime-adk

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-adk`.

Fork of the `@botpress/adk` dependency closure (see `feat(botruntime): fork @botpress/adk closure ->
botruntime-{adk,jex,analytics}`, 38d2c83). This is a library consumed by `brt`, not a second CLI —
see README.md for the split between `brt` (the executable) and this package (project loading,
code-gen, dependency reconciliation, runtime helpers).

## 2.3.0 (current) — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.3.0

## 2.2.14 — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.2.14

## 2.2.13 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.46.7
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.7.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.2.13
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.7

## 2.2.12 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.2.12
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.6

## 2.2.11 — 2026-07-18

- `chat.clearTranscript()` now checkpoints a stable Cloud message cursor together with the cleared LLM transcript. Long-lived channel history can no longer be re-imported after a reset when an integration refreshes conversation tags; generated bot definitions include the backward-compatible cursor field.

## 2.2.9

- fix(runtime): fence tracked state snapshots (#102)
- fix(evals): preserve nested checkpoint yields (#103)
- fix(brt): manage production integrations with workspace PAT (#104)
