---
"@holocronlab/botruntime-runtime": patch
---

`Chat.addMessage` now upserts by message id instead of silently no-op'ing on a
repeat id: if the redelivered message's content or attachments differ from what
is already in the transcript, the existing entry is replaced in place (position
preserved) rather than left on its first, partial version. This unblocks the
platform's trailing-edge redelivery of a scheduled message (e.g. a Telegram
album `bloc` whose payload grows between deliveries) — without it, the agent
would keep seeing the first, incomplete album. Identical redeliveries (same
content and attachments) remain a no-op, preserving prior dedup behavior.
