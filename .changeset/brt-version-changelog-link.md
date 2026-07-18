---
"@holocronlab/brt": patch
---

`brt --version` now prints a link to this package's CHANGELOG.md alongside the bare version, so
"what changed?" has an answer without leaving the terminal. `CLI_VERSION` itself (used for the ADK
compatibility check) is unchanged; only the `--version` flag's display string gained the link.
