# @holocronlab/botruntime-runtime

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-runtime`.

Lightweight runtime library for `brt`-built botruntime agents: conversation, workflow, table and
knowledge-base primitives used both to describe an agent and at run time. See README.md.

## 2.2.11 (current) — 2026-07-18

- `chat.clearTranscript()` now checkpoints a stable Cloud message cursor together with the cleared LLM transcript. Long-lived channel history can no longer be re-imported after a reset when an integration refreshes conversation tags; generated bot definitions include the backward-compatible cursor field.

## 2.2.9

- fix(runtime): fence tracked state snapshots (#102)
- fix(evals): preserve nested checkpoint yields (#103)
- fix(brt): manage production integrations with workspace PAT (#104)
