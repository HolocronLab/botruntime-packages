---
"@holocronlab/botruntime-sdk": minor
"@holocronlab/botruntime-runtime": minor
"@holocronlab/botruntime-adk": minor
"@holocronlab/brt": minor
---

Added typed `maxExecutionTime` configuration for classic bot definitions and
ADK agents. `brt dev` and `brt deploy --adk` now carry the configured
per-invocation deadline to the platform instead of silently dropping it.
