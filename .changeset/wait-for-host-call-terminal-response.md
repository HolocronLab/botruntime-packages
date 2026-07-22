---
"@holocronlab/botruntime-client": patch
---

Extended the default HTTP timeout beyond the Cloud host-call deadline so long-running actions can return their terminal response instead of being disconnected after 60 seconds. Explicit client timeouts are unchanged.
