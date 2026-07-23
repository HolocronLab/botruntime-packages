---
"@holocronlab/botruntime-client": minor
"@holocronlab/botruntime-sdk": minor
"@holocronlab/botruntime-runtime": minor
---

Added optional optimistic concurrency tokens to State API reads and writes. `TrackedState` now echoes server-issued versions on subsequent saves, detects concurrent updates without replaying them, and falls back to legacy last-write-wins behavior when connected to an older server. Oversized snapshots use version-scoped content-addressed files, clean up superseded generations after successful CAS, and recover once when a concurrent save removes a stale file pointer.
