---
"@holocronlab/brt": minor
"@holocronlab/botruntime-adk": minor
---

Added `brt run` for one-shot agent scripts with explicit dev/prod target
selection, development config-var inheritance and child exit-code propagation.

Added `brt workflows run|list|show|wait` over the existing durable workflow
engine. Creation is idempotency-keyed and request-fingerprinted; history is
cursor-paginated; observation deadlines never cancel durable execution; default
output and step projections omit arbitrary workflow data and raw error text.

Script runtime setup now supports strict configuration loading so auth or
network failures stop before user code executes instead of silently substituting
an empty configuration.
