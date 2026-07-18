---
"@holocronlab/brt": patch
---

`brt --help` now ends with a link to this package's CHANGELOG.md, so "what changed?" has an answer
without leaving the terminal. `brt --version` stays a bare, machine-readable semver string (`CLI_VERSION`,
also used for the ADK compatibility check) — the link never appears in its output.
