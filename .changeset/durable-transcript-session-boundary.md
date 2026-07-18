---
"@holocronlab/botruntime-runtime": patch
"@holocronlab/botruntime-adk": patch
---

`chat.clearTranscript()` now checkpoints a stable Cloud message cursor together with the cleared LLM transcript. Long-lived channel history can no longer be re-imported after a reset when an integration refreshes conversation tags; generated bot definitions include the backward-compatible cursor field.
