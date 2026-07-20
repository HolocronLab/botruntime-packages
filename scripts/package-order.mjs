#!/usr/bin/env node
// Single source of truth for the packages/* build order (DEVLP-162). This list
// used to be duplicated three times in .github/workflows/ (ci.yml's
// fork-package-catalog and fork-package-tests jobs, and
// publish-public-packages.yml) — a rename or reorder had to land in all three
// by hand, and a drift between copies would only surface as a build failure,
// not a review-time diff. Cross-package deps use file: links, which Bun
// resolves against each sibling's already-built dist/, so packages must be
// built in this order before a later package's install can succeed. ADK
// builds before the CLI that loads it; local file: links are rewritten to
// immutable registry versions only after build (publish-public-packages.yml).
export const PACKAGE_ORDER = [
  'botruntime-analytics',
  'botruntime-chat',
  'botruntime-client',
  'botruntime-cognitive',
  'botruntime-const',
  'botruntime-thicktoken',
  'botruntime-zui',
  'botruntime-zai',
  'botruntime-evals',
  'botruntime-jex',
  'botruntime-llmz',
  'botruntime-sdk',
  'botruntime-runtime',
  'botruntime-tunnel',
  'botruntime-verel',
  'botruntime-yargs-extra',
  'botruntime-adk',
  'brt',
]

// CLI entrypoint for workflow steps that only need the bash-loop shape
// (`for package in $PACKAGE_ORDER; do ...`), e.g.:
//   echo "list=$(node scripts/package-order.mjs)" >> "$GITHUB_OUTPUT"
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(PACKAGE_ORDER.join(' '))
}
