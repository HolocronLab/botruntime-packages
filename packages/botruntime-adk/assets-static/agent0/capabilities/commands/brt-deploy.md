---
name: brt-deploy
description: Validate and deploy the current Holocron agent
---

Run `tsc --noEmit`, summarize the target and expected external effect, and get
confirmation before deployment unless the developer already asked to deploy.
Then run `brt deploy --adk` and report the actual result.
