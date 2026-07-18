# @holocronlab/botruntime-cognitive

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-cognitive`.

Wrapper around `@holocronlab/botruntime-client` for calling LLMs, forked as part of the
`@botpress/runtime` dependency closure (zero-`@botpress` cascade, 6495425). See README.md.

## 0.7.1 (current)

- feat(botruntime): fork the `@botpress/runtime` dependency closure (zero-botpress cascade) (6495425)
- feat(runtime): remove legacy cognitive and config fallbacks (#90)
- fix release train closure and mask secret prompts (#95)
