---
"@holocronlab/botruntime-sdk": minor
"@holocronlab/botruntime-client": minor
"@holocronlab/brt": patch
---

Added a definition-owned `maxConcurrency` contract for integrations. Definitions remain serial by default and can opt in to at most four concurrent invocations.
