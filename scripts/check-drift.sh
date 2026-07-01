#!/usr/bin/env bash
set -euo pipefail
# CI drift-check (see docs/adr/0005, golden checks).
#
# Regenerates deterministically and fails if the committed generated artifacts drift.
# Same generator + same pinned @botpress/api@1.108.0 => byte-identical output, so a raw
# `git diff` is the correct comparison HERE.
#
# NOTE: this is NOT the external-oracle byte check. Comparing OUR built client d.ts against
# the upstream @botpress/client@1.46.0 oracle requires NORMALIZATION — cosmetic key-ordering
# and `export {}` grouping differ purely by rollup-dts/TS version (proven semantically
# identical: same 71 /v1 path templates, same 68 exported names). Run that golden check only
# when bumping the pinned @botpress/api version, not on every CI.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bash "$ROOT/scripts/regen.sh"

# Only committed generated SOURCE is drift-checked: the frozen spec (openapi/) and the
# typed client (src/gen). botruntime-client/dist is a build artifact — gitignored and rebuilt
# at publish/CI time (package.json "files":["dist"]), never committed — so it cannot drift and
# is intentionally out of this pathspec.
if ! git -C "$ROOT" diff --exit-code -- \
      packages/botruntime-api/openapi \
      packages/botruntime-client/src/gen ; then
  echo "" >&2
  echo "DRIFT DETECTED: regenerated artifacts differ from the committed ones." >&2
  echo "Either commit the regeneration, or investigate why generation is non-deterministic." >&2
  exit 1
fi
echo "[check-drift] clean — generated artifacts match committed."
