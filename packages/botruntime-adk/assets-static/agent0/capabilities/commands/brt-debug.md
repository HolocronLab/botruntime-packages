---
name: brt-debug
description: Diagnose a Holocron agent from available local and target evidence
---

Start from the reported error or wrong behavior. Inspect the relevant project
files and run `tsc --noEmit`. Use `brt dev --check` only when a successful
stateful development run has already created target metadata. Reproduce runtime
behavior through the exact configured integration. Runtime log access depends
on the selected deployment and profile, so report it as unavailable when the
server rejects the request.
