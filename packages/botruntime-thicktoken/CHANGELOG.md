# @holocronlab/botruntime-thicktoken

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-thicktoken`.

Tiktoken but thicker — a self-contained fork with the WASM tokenizer inlined into the bundle so
consumers don't need extra asset wiring. See README.md.

## 2.0.0 (current)

- feat(botruntime): fork the `@botpress/runtime` dependency closure (zero-botpress cascade) (6495425)
- Fix BRT and ADK platform contracts (#21)
