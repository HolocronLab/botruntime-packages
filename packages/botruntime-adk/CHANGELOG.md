# @holocronlab/botruntime-adk

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-adk`.

Fork of the `@botpress/adk` dependency closure (see `feat(botruntime): fork @botpress/adk closure ->
botruntime-{adk,jex,analytics}`, 38d2c83). This is a library consumed by `brt`, not a second CLI —
see README.md for the split between `brt` (the executable) and this package (project loading,
code-gen, dependency reconciliation, runtime helpers).

## 2.6.4 (current) — 2026-07-24

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.52.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.8
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.6.4
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.19.2

## 2.6.3 — 2026-07-24

- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.6.3
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.19.1

## 2.6.2 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.51.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.7
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.6.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.19.0

## 2.6.1 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.50.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.6
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.6.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.18.0

## 2.6.0 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.49.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.5
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.6.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.17.0

## 2.5.4 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.48.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.4
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.5.4
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.16.0

## 2.5.3 — 2026-07-23

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.3
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.5.3
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.15.2

## 2.5.2 — 2026-07-22

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.47.1
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.5.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.15.1

## 2.5.1 — 2026-07-22

- Allow ADK projects to run with the compatible BRT 0.9 release line while
continuing to reject the next unverified CLI compatibility line.

## 2.5.0 — 2026-07-22

- Added typed `maxExecutionTime` configuration for classic bot definitions and
ADK agents. `brt dev` and `brt deploy --adk` now carry the configured
per-invocation deadline to the platform instead of silently dropping it.
- Allow ADK projects to run with the compatible BRT 0.8 release line.

## 2.4.2 — 2026-07-21

- Обновлены внутренние зависимости: @holocronlab/botruntime-jex@1.3.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.4.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-sdk@6.13.8
- Обновлены внутренние зависимости: @holocronlab/botruntime-zui@2.3.1

## 2.4.1 — 2026-07-21

- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.4.1

## 2.4.0 — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-runtime@2.4.0

## 2.3.0 — 2026-07-20

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
