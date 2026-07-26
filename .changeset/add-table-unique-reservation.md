---
"@holocronlab/botruntime-client": minor
"@holocronlab/botruntime-runtime": minor
"@holocronlab/botruntime-adk": minor
---

Added typed table key reservation with mandatory idempotency, an exact
`{ row, created: boolean }` result, and stable table conflict classification.

Table declarations can opt new tables into physical key uniqueness with
`keyColumn: { name, unique: true }`. ADK preserves that contract through
generation and creation, and fails closed when an existing table requires the
staged server-side contract transition.

Generated table row types now expose mandatory row metadata. The client
generation pipeline reapplies and verifies the handwritten table contract
patches so regeneration cannot silently remove the capability.
