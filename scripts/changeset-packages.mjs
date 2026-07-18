// Shared package-discovery helper for the changeset gate (changeset-lint.mjs) and
// the changeset version/changelog script (changeset-version.mjs). "Public" here
// means "npm-published" (private !== true) — e.g. botruntime-api is a build-time-only
// codegen seam (ADR-0005) and never reaches the registry, so it is excluded the same
// way publish-public-packages.yml's PACKAGE_ORDER excludes it.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function readPublicPackages(root) {
  return readPublicPackageManifests(root).map((pkg) => ({ name: pkg.manifest.name, dir: pkg.dir }))
}

// Adds each package's own version and its LOCAL (file:) dependency edges — the
// same file:-dependency graph release-version-closure.mjs walks to prove a
// changed dependency's version bump propagates to every runtime consumer.
// changeset-version.mjs walks the reverse of this graph to auto patch-bump
// consumers that a changeset didn't explicitly declare (DEVLP-174 follow-up:
// publish rewrites file: deps to exact versions, so an un-bumped consumer would
// otherwise fail release-version-closure.mjs after changeset-version.mjs runs).
export function readPublicPackagesWithLocalDependencies(root) {
  return readPublicPackageManifests(root).map((pkg) => {
    const localDependencies = ['dependencies', 'optionalDependencies', 'peerDependencies']
      .flatMap((field) => Object.entries(pkg.manifest[field] ?? {}))
      .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
      .map(([name]) => name)
    return { name: pkg.manifest.name, dir: pkg.dir, version: pkg.manifest.version, localDependencies }
  })
}

function readPublicPackageManifests(root) {
  const packagesDir = resolve(root, 'packages')
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dir: entry.name, manifestPath: resolve(packagesDir, entry.name, 'package.json') }))
    .filter((pkg) => existsSync(pkg.manifestPath))
    .map((pkg) => ({ ...pkg, manifest: JSON.parse(readFileSync(pkg.manifestPath, 'utf8')) }))
    .filter((pkg) => pkg.manifest.private !== true)
}
