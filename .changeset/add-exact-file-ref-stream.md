---
"@holocronlab/botruntime-client": minor
"@holocronlab/botruntime-sdk": minor
---

Added authenticated exact-FileRef streaming to the public client and typed bot/integration SDK clients. The method returns a raw Web ReadableStream and never materializes the file as base64, Buffer, or ArrayBuffer. The read-only operation status union also recognizes the platform's audited `abandoned` terminal state; no client-side abandon mutation is exposed.
