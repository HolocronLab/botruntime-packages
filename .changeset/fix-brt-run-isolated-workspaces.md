---
"@holocronlab/brt": patch
---

Fixed `brt run` for agents installed with Bun's isolated workspace linker so generated runners no longer require manually hoisted internal runtime packages, including cached runs, and made dev readiness reject stale generated dependency links.
