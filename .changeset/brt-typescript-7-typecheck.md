---
"@holocronlab/brt": patch
---

Run `brt deploy --adk` type checking through the project's own `tsc` executable, adding compatibility with native TypeScript 7 while preserving TypeScript 5/6 diagnostics and `--noEmit` safety.
