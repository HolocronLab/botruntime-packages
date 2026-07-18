#!/usr/bin/env node
// Discovers packages/* with a "test" script (the fork-package-catalog job in
// ci.yml) and orders them per scripts/package-order.mjs. Enumerates the real
// packages/* tree, not the allowlist: a test-bearing package missing from
// PACKAGE_ORDER must fail the gate loudly, not be silently skipped by
// filtering the stale list.
import { existsSync, readFileSync, readdirSync } from 'node:fs'

import { PACKAGE_ORDER } from './package-order.mjs'

const tested = readdirSync('packages', { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((name) => {
    const packageJsonPath = `packages/${name}/package.json`
    if (!existsSync(packageJsonPath)) return false
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
    return Boolean(manifest.scripts && manifest.scripts.test)
  })

const missing = tested.filter((name) => !PACKAGE_ORDER.includes(name))
if (missing.length > 0) {
  console.error(
    `::error::packages with a test script are missing from PACKAGE_ORDER: ${missing.join(', ')} — add them to scripts/package-order.mjs`
  )
  process.exit(1)
}

console.log(JSON.stringify(PACKAGE_ORDER.filter((name) => tested.includes(name))))
