---
name: brt-validate
description: Validate the current Holocron agent without deploying it
---

Run `tsc --noEmit`. If the project already has development target metadata,
also run `brt dev --check`. Explain whether each failure is local TypeScript,
local target state, authentication, or a remote readiness problem.
