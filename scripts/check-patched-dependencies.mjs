#!/usr/bin/env node
// DEVLP-159: the class of bug this guards against already happened once — botruntime-llmz's
// bun/pnpm-style patch on source-map-js@1.2.1 (packages/botruntime-llmz/patches/) was lost
// during the fork, and nothing caught it until the prod bot went silent on every turn (fixed
// in 52afff9). `patchedDependencies` in a package.json is this repo's ONLY patch mechanism —
// there is no root workspace, no pnpm-workspace.yaml, no separate `.patches/` convention; each
// forked package/integration owns its own `patches/*.patch` files and bun.lock. A patch here
// is silent by construction: if the pinned "name@version" key stops matching what actually
// resolves, bun/pnpm just doesn't apply it — no error, the dependency quietly reverts to
// upstream unpatched behavior. This gate makes that failure mode loud instead: for every
// package.json that declares patchedDependencies, it checks (1) the patch file exists, (2)
// the sibling bun.lock declares the identical patch (catches an edited package.json whose
// lockfile was never regenerated), and (3) the lockfile's resolved dependency graph actually
// contains that exact "name@version" (catches a patch key that no longer matches anything
// installed, e.g. after an unrelated bump moved the transitive version).
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export const SCAN_ROOT_DIRS = ['packages', 'integrations']

export function findPackageJsonDirs(root, scanRootDirs = SCAN_ROOT_DIRS) {
  const dirs = []
  for (const scanRoot of scanRootDirs) {
    const scanRootPath = resolve(root, scanRoot)
    if (!existsSync(scanRootPath)) continue
    for (const entry of readdirSync(scanRootPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const pkgDir = join(scanRootPath, entry.name)
      if (existsSync(join(pkgDir, 'package.json'))) dirs.push(pkgDir)
    }
  }
  return dirs
}

// bun.lock is JSONC-flavored (trailing commas after the last array/object member), not
// strict JSON. This strips only that one deviation — it is not a general JSON5 parser and
// deliberately doesn't try to be, since bun.lock's shape is narrow and machine-generated.
export function parseBunLock(text) {
  return JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'))
}

// Every resolved "name@version" string bun.lock ever recorded, direct or transitive
// (nested/aliased entries like "@scope/pkg/node-fetch" resolve to their own name@version too).
export function resolvedVersionSpecs(bunLock) {
  const packages = bunLock?.packages
  if (packages === null || typeof packages !== 'object' || Array.isArray(packages)) {
    throw new TypeError('bun.lock "packages" must be an object')
  }
  return new Set(Object.values(packages).map((entry) => entry[0]))
}

export function checkPatchedDependencies(pkgDir, { readFile = (p) => readFileSync(p, 'utf8') } = {}) {
  const violations = []
  const packageJsonPath = join(pkgDir, 'package.json')
  const packageJson = JSON.parse(readFile(packageJsonPath))
  const patchedDependencies = packageJson.patchedDependencies
  if (patchedDependencies === undefined) return violations
  if (patchedDependencies === null || typeof patchedDependencies !== 'object' || Array.isArray(patchedDependencies)) {
    violations.push(`${packageJsonPath}: patchedDependencies must be an object`)
    return violations
  }

  const bunLockPath = join(pkgDir, 'bun.lock')
  let bunLock
  try {
    bunLock = parseBunLock(readFile(bunLockPath))
  } catch (error) {
    violations.push(
      `${pkgDir}: package.json declares patchedDependencies but bun.lock is missing or unparsable (${error.message}) — a patch key can silently stop applying with no record of it`
    )
    bunLock = null
  }

  const lockPatched = bunLock?.patchedDependencies ?? {}
  let resolved
  if (bunLock) {
    try {
      resolved = resolvedVersionSpecs(bunLock)
    } catch (error) {
      violations.push(`${bunLockPath}: ${error.message}`)
      resolved = new Set()
    }
  } else {
    resolved = new Set()
  }

  for (const [spec, patchPath] of Object.entries(patchedDependencies)) {
    if (!existsSync(join(pkgDir, patchPath))) {
      violations.push(`${packageJsonPath}: patchedDependencies["${spec}"] points at missing file ${patchPath}`)
    }

    if (bunLock && lockPatched[spec] !== patchPath) {
      violations.push(
        `${pkgDir}: package.json and bun.lock disagree on patch "${spec}" ` +
          `(package.json -> ${patchPath ?? '(missing)'}, bun.lock -> ${lockPatched[spec] ?? '(missing)'}) — ` +
          're-run bun install so the lockfile records the same patch, or the patch may silently stop applying'
      )
    }

    if (bunLock && !resolved.has(spec)) {
      violations.push(
        `${pkgDir}: patchedDependencies["${spec}"] does not match any resolved dependency in bun.lock — ` +
          'this patch cannot be applying to anything; the pinned version likely drifted out from under it'
      )
    }
  }

  return violations
}

function main() {
  const pkgDirs = findPackageJsonDirs(root)
  const allViolations = pkgDirs.flatMap((pkgDir) => checkPatchedDependencies(pkgDir))

  if (allViolations.length > 0) {
    process.stderr.write('Patched-dependency gate failed:\n\n')
    for (const violation of allViolations) process.stderr.write(`  - ${violation}\n`)
    process.exitCode = 1
    return
  }

  const patchedCount = pkgDirs.filter((dir) => {
    const packageJson = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
    return packageJson.patchedDependencies !== undefined
  }).length
  process.stdout.write(
    `[check-patched-dependencies] clean — ${patchedCount} package(s) with patchedDependencies, all patches present and lockfile-consistent.\n`
  )
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
