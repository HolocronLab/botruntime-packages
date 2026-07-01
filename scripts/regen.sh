#!/usr/bin/env bash
set -euo pipefail
# Regenerate all codegen artifacts from the pinned bootstrap API (see docs/adr/0005).
#
#   botruntime-api  --(exportOpenapi)--> openapi/*.json      (frozen canonical spec)
#   botruntime-api  --(exportClient)---> botruntime-client/src/gen  (typed client)
#
# Deterministic: same generator + same pinned @botpress/api@1.108.0 => identical output.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[regen] 1/3 botruntime-api: emit canonical OpenAPI spec (openapi/*.json)"
( cd "$ROOT/packages/botruntime-api" && bun install >/dev/null 2>&1 && bun run gen )

echo "[regen] 2/3 botruntime-client: regenerate typed client (src/gen) via the botruntime-api seam"
( cd "$ROOT/packages/botruntime-client" && bun install >/dev/null 2>&1 && bun run generate )

echo "[regen] 3/3 botruntime-client: rebuild dist"
( cd "$ROOT/packages/botruntime-client" && bun run build )

echo "[regen] done. Review 'git diff' for drift; run scripts/check-drift.sh in CI."
