#!/usr/bin/env node
// Rewrite packages/brt/package.json's local `file:../botruntime-*` deps to the
// published registry versions (^<version> read from each sibling package.json)
// so the published @holocronlab/brt tarball resolves its deps from public npm.
//
// Run in CI right before `npm publish` (on a throwaway checkout — no revert needed).
// Locally, it prints the diff; pass --write to actually rewrite.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const brtPath = join(root, 'packages/brt/package.json')
const brt = JSON.parse(readFileSync(brtPath, 'utf8'))

const siblingVersion = (name) => {
  const dir = name.replace('@holocronlab/', '') // botruntime-*
  const p = join(root, 'packages', dir, 'package.json')
  return JSON.parse(readFileSync(p, 'utf8')).version
}

let changed = 0
for (const field of ['dependencies', 'devDependencies']) {
  const deps = brt[field]
  if (!deps) continue
  for (const [name, spec] of Object.entries(deps)) {
    if (typeof spec === 'string' && spec.startsWith('file:') && name.startsWith('@holocronlab/')) {
      const ver = `^${siblingVersion(name)}`
      console.log(`  ${name}: ${spec} -> ${ver}`)
      deps[name] = ver
      changed++
    }
  }
}

if (process.argv.includes('--write')) {
  writeFileSync(brtPath, JSON.stringify(brt, null, 2) + '\n')
  console.log(`rewrote ${changed} file: dep(s) to registry versions in packages/brt/package.json`)
} else {
  console.log(`(dry run — ${changed} file: dep(s) would be rewritten; pass --write to apply)`)
}
