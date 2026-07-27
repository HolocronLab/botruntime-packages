---
"@holocronlab/botruntime-sdk": patch
---

Exposed `reserveTableKey` and `atomicTables` on `BotSpecificClient`, preserving client hooks and receiver binding so runtime table consistency primitives work in generated bots.
