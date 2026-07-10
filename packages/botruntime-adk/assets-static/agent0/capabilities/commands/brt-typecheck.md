---
name: brt-typecheck
description: Type-check the current Holocron agent without deploying it
---

Inspect the changed project files and run `tsc --noEmit`. Report the first
actionable failure with its file and cause. Do not claim runtime or deployment
readiness from a TypeScript-only result.
