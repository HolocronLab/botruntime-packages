---
"@holocronlab/brt": patch
---

Removed `templates/empty-bot` and its dead `bot` entry in `ProjectTemplates`: `brt init` for a bot
project has always generated an ADK project in-process (`AgentProjectGenerator`, template `blank`/
`hello-world`) and never read this table, so the template was unreachable scaffold-copy code left
over from the pre-ADK-collapse Botpress-native bot architecture (`BotDefinition` + `.botpress/`).
Also added a CI gate (`scripts/botpress-banlist.mjs`) that fails the build if a real `@botpress/*`
import ever lands in `packages/brt/templates/` or the vendored ADK skill docs again.
