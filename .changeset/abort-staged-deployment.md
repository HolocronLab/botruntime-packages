---
"@holocronlab/brt": patch
---

Added `brt bots deployments abort` as a fail-closed recovery path for safely
abandoning pre-schema staged deployments. It preserves the active version,
uses the current environment fence generation after confirmation, supports an
already-performed traffic unfence, and accepts only the exact durable aborted
terminal state.
