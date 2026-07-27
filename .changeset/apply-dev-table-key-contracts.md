---
"@holocronlab/botruntime-client": patch
"@holocronlab/botruntime-adk": patch
"@holocronlab/brt": patch
---

Made classic `brt dev` apply and verify table key contracts instead of reporting schema-only updates as successful. Generated bots now use the canonical string `keyColumn` plus `keyColumnUnique` shape, and the control-plane client exposes the durable unique-key transition required for existing development tables. `brt dev --check` now fails closed when the cached development target differs from the declared contract, while production table publishing remains verify-only and directs changes through staged ADK deployments.
