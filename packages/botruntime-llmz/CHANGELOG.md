# @holocronlab/botruntime-llmz

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-llmz`.

An LLM-native TypeScript VM (code-generation agent framework) built on `@holocronlab/botruntime-zui`.
See README.md.

## 0.0.87 (current)

- fix(botruntime-llmz): restore Botpress source-map-js patch (0.0.85) — re-applies the upstream
  esbuild `keepNames`/minify patch that the fork had lost, root cause of a prod
  `i is not defined` outage on every code-generation turn (52afff9)
- feat(botruntime): fork the `@botpress/runtime` dependency closure (zero-botpress cascade) (6495425)
- fix release train closure and mask secret prompts (#95)
