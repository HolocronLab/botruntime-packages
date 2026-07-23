#!/usr/bin/env bash
set -euo pipefail
# Regenerate all codegen artifacts from the pinned bootstrap API (see docs/adr/0005).
#
#   botruntime-api  --(exportOpenapi)--> openapi/*.json      (frozen canonical spec)
#   botruntime-api  --(exportClient)---> botruntime-client/src/gen  (typed client)
#
# Deterministic: same generator + same pinned @botpress/api@1.108.0 => identical output.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "[regen] 1/3 botruntime-api: emit canonical OpenAPI spec and build the local package"
# botruntime-client consumes botruntime-api through a file: dependency whose package
# entrypoints live under dist/. A clean checkout has no dist, so build it before the
# client installs/resolves the local package. Reusing a developer's stale dist would
# make drift-check pass locally and fail only in CI.
( cd "$ROOT/packages/botruntime-api" && bun install >/dev/null 2>&1 && bun run gen && bun run build )

echo "[regen] applying integration network contract extension"
node "$ROOT/scripts/apply-integration-network-extension.mjs" --openapi-only

echo "[regen] applying state CAS contract extension"
node "$ROOT/scripts/apply-state-cas-extension.mjs" --openapi-only

echo "[regen] 2/3 botruntime-client: regenerate typed client (src/gen) via the botruntime-api seam"
( cd "$ROOT/packages/botruntime-client" && bun install >/dev/null 2>&1 && bun run generate )

echo "[regen] applying integration network client extension"
node "$ROOT/scripts/apply-integration-network-extension.mjs" --client-only

echo "[regen] applying state CAS client extension"
node "$ROOT/scripts/apply-state-cas-extension.mjs" --client-only

echo "[regen] applying botruntime rowVersion contract extension"
node "$ROOT/scripts/apply-table-row-version-extension.mjs"

echo "[regen] 3/3 botruntime-client: rebuild dist"
( cd "$ROOT/packages/botruntime-client" && bun run build )

echo "[regen] done. Review 'git diff' for drift; run scripts/check-drift.sh in CI."
