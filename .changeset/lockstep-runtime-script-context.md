---
"@holocronlab/botruntime-runtime": patch
---

Added the runtime-owned script context initializer used by generated one-shot scripts and test runtimes, keeping client, SDK, cognitive, logging and citations construction inside the runtime dependency boundary.
