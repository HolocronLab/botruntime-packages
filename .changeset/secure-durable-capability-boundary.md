---
"@holocronlab/botruntime-client": patch
"@holocronlab/botruntime-sdk": major
---

Made durable file streams resume the exact pinned generation after a bounded
transport interruption.

Durable operation handlers now receive an `abortSignal` for cooperative
cancellation and no longer receive the general integration client. The
operation token remains private to the scoped files and checkpoint transports.
