# @holocronlab/botruntime-evals

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-evals`.

Evaluation definitions and runner for `brt`-based botruntime agents: author evals with a small
declarative `Eval` API, run them against a live agent through the native platform eval transport and
a trace collector. See README.md.

## 2.1.20 (current) — 2026-07-20

- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.8.0
- Обновлены внутренние зависимости: @holocronlab/botruntime-zai@2.8.3

## 2.1.19 — 2026-07-19

- Обновлены внутренние зависимости: @holocronlab/botruntime-client@1.46.7
- Обновлены внутренние зависимости: @holocronlab/botruntime-cognitive@0.7.2
- Обновлены внутренние зависимости: @holocronlab/botruntime-zai@2.8.2

## 2.1.18

- fix(evals): preserve nested checkpoint yields (#103)
- fix(evals): checkpoint finalized hosted eval entries (#101)
- fix(platform): restore eval control and action trace correlation (#98)
