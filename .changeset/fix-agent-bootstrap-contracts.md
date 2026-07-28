---
"@holocronlab/botruntime-adk": patch
"@holocronlab/brt": patch
---

Исправлены повторный production deploy старых agent targets с подтверждённо пустым plugin snapshot, атомарное восстановление plugin definition без перезаписи конкурентных изменений и чтение `brt link --key-stdin` из перенаправленного stdin.
