#!/usr/bin/env node
// Replace local file: dependencies with the sibling package versions that a
// registry consumer can resolve. The checkout is disposable in publish jobs;
// locally this is a dry run unless --write is passed.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registrySpecForLocalDependency } from './package-release-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageArg = process.argv.find((arg) => arg.startsWith('--package='))?.slice('--package='.length)
if (!packageArg) throw new Error('pass --package=packages/<name>')
const excludedNames = new Set(
  process.argv.filter((arg) => arg.startsWith('--exclude=')).map((arg) => arg.slice('--exclude='.length))
)

const packageDir = resolve(root, packageArg)
const relativeDir = relative(resolve(root, 'packages'), packageDir)
if (isAbsolute(relativeDir) || relativeDir.startsWith('..')) {
  throw new Error('package must be inside the repository packages directory')
}

const manifestPath = resolve(packageDir, 'package.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
let changed = 0

for (const field of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
  const dependencies = manifest[field]
  if (!dependencies) continue

  for (const [name, spec] of Object.entries(dependencies)) {
    if (excludedNames.has(name)) continue
    if (typeof spec !== 'string' || !spec.startsWith('file:')) continue
    const siblingManifestPath = resolve(packageDir, spec.slice('file:'.length), 'package.json')
    const sibling = JSON.parse(readFileSync(siblingManifestPath, 'utf8'))
    if (sibling.name !== name || typeof sibling.version !== 'string') {
      throw new Error(`${field}.${name} does not match ${siblingManifestPath}`)
    }
    const registrySpec = registrySpecForLocalDependency({
      field,
      dependencyName: name,
      siblingVersion: sibling.version,
    })
    console.log(`  ${name}: ${spec} -> ${registrySpec}`)
    dependencies[name] = registrySpec
    changed++
  }
}

if (process.argv.includes('--write')) {
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`rewrote ${changed} file: dependency spec(s) in ${relative(root, manifestPath)}`)
} else {
  console.log(`(dry run — ${changed} file: dependency spec(s) would be rewritten; pass --write to apply)`)
}
