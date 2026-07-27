---
"@holocronlab/botruntime-sdk": patch
"@holocronlab/botruntime-runtime": patch
---

Synchronized runtime-owned workflow status updates with the SDK handler state chain so downstream handlers observe completed, failed, listening, and in-progress states without stale pending warnings.
