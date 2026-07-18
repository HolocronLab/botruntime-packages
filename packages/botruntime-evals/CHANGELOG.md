# @holocronlab/botruntime-evals

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-evals`.

Evaluation definitions and runner for `brt`-based botruntime agents: author evals with a small
declarative `Eval` API, run them against a live agent through the native platform eval transport and
a trace collector. See README.md.

## 2.1.18 (current)

- fix(evals): preserve nested checkpoint yields (#103)
- fix(evals): checkpoint finalized hosted eval entries (#101)
- fix(platform): restore eval control and action trace correlation (#98)
