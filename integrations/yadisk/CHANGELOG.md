# Changelog

## 0.3.0

- Replaced JSON/base64 document uploads with native durable-operation v1.
- Streams one immutable FileRef generation directly into one Yandex.Disk PUT.
- Verifies provider size and SHA-256 before reporting success.
- Preserves ambiguous handoffs as `outcome_unknown`; reconcile and cancel never replay the upload.
- Removed the base64 download action from this new integration version. Existing 0.2.3 installations remain unchanged.
