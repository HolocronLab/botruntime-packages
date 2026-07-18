# @holocronlab/botruntime-analytics

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-analytics`.

Minimal fork of `@botpress/analytics` (MIT). The original bundles PostHog event tracking and error
sanitization; `@holocronlab/botruntime-adk` only ever imported `AdkError`/`isAdkError`, so this fork
keeps just the shared `AdkError` base error class. See README.md.

## 0.1.1 (current)

- feat(botruntime): fork `@botpress/adk` closure -> botruntime-{adk,jex,analytics} (38d2c83)
- Fix BRT and ADK platform contracts (#21)
- chore(release): bump analytics for OIDC verification
