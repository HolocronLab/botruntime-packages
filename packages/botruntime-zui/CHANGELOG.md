# @holocronlab/botruntime-zui

Changelog starts 2026-07-18 (DEVLP-174) — earlier history: `git log -- packages/botruntime-zui`.

A fork of Zod with additional features. Fork of `@bpinternal/zui`, synchronized through 2.3.1
from source (34k LOC, zero deps). See README.md.

## 2.3.1 (current) — 2026-07-21

- Port Botpress fixes for recursive ZUI schemas, JSON Schema `oneOf`, stale micropatch line references, bounded rewrite output, and slow CLI API operations while preserving local compatibility contracts.

## 2.3.0

- feat(botruntime): fork leaf deps -> `@holocronlab/botruntime-*` (phase 1) (e3694c9)
- chore(botruntime): normalize package repository -> botruntime-packages (pre-publish)
- Fix BRT and ADK platform contracts (#21)
