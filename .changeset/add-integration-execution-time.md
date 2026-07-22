---
"@holocronlab/botruntime-client": minor
"@holocronlab/botruntime-sdk": minor
"@holocronlab/brt": minor
---

Added definition-owned `maxExecutionTime` for integration operations. The SDK
validates the platform deadline and BRT preserves it on
create/update/dry-run requests, including resetting removed overrides to the
45-second platform default.
