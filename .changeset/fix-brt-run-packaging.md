---
"@holocronlab/brt": patch
---

Fixed `brt run` regeneration by using BRT's native dependency installer and build command in-process instead of asking ADK to launch a second cached CLI.
