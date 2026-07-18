// Shared package-discovery helper for the changeset gate (changeset-lint.mjs) and
// the changeset version/changelog script (changeset-version.mjs). "Public" here
// means "npm-published" (private !== true) — e.g. botruntime-api is a build-time-only
// codegen seam (ADR-0005) and never reaches the registry, so it is excluded the same
// way publish-public-packages.yml's PACKAGE_ORDER excludes it.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export function readPublicPackages(root) {
  const packagesDir = resolve(root, 'packages')
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({ dir: entry.name, manifestPath: resolve(packagesDir, entry.name, 'package.json') }))
    .filter((pkg) => existsSync(pkg.manifestPath))
    .map((pkg) => ({ ...pkg, manifest: JSON.parse(readFileSync(pkg.manifestPath, 'utf8')) }))
    .filter((pkg) => pkg.manifest.private !== true)
    .map((pkg) => ({ name: pkg.manifest.name, dir: pkg.dir }))
}
