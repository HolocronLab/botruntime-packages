# @holocronlab/botruntime-client

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-client`.

Fork of `@botpress/client@1.46.0` src; `gen/` is codegenerated from the pinned API. Byte-exact type
surface (71 `/v1` path templates) — see `docs/adr/0005-opapi-as-source-of-truth.md` and README.md.

## 1.46.6 (current)

- fix runtime client scope and dev diagnostics (#93)
- fix(client): authenticate same-origin file uploads (#43)
- feat: add hosted eval and chat platform support (ec9d6d4)
