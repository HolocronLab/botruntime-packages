---
"@holocronlab/botruntime-client": patch
"@holocronlab/botruntime-sdk": patch
"@holocronlab/botruntime-runtime": patch
---

Wait through the complete integration host lifecycle and advertise a bounded, relative action-response budget derived from the effective transport and current runtime invocation deadlines. Replay action calls only when Cloud explicitly reports that execution was not started and is retryable; workflow steps now stop on non-retryable or outcome-unknown integration execution failures.
