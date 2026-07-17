#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Publishing replaces every runtime file: edge with the dependency's exact
// immutable version. A changed dependency therefore requires a new version for
// every consumer in its reverse closure, even when that consumer's code is unchanged.
export function findReleaseVersionClosureViolations(packages, baseVersions) {
  const changed = new Set(
    packages
      .filter((pkg) => baseVersions.get(pkg.name) !== pkg.version)
      .map((pkg) => pkg.name)
  )

  return packages
    .flatMap((consumer) =>
      consumer.localDependencies
        .filter((dependency) => changed.has(dependency) && !changed.has(consumer.name))
        .map((dependency) => ({
          dependency,
          dependencyVersion: packages.find((pkg) => pkg.name === dependency)?.version,
          consumer: consumer.name,
          consumerVersion: consumer.version,
        }))
    )
    .sort((left, right) =>
      `${left.dependency}:${left.consumer}`.localeCompare(`${right.dependency}:${right.consumer}`)
    )
}

function readPackages() {
  const packagesDir = resolve(root, 'packages')
  return readdirSync(packagesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => resolve(packagesDir, entry.name, 'package.json'))
    .filter(existsSync)
    .map((manifestPath) => {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
      // devDependencies are build-only and never enter the installed release graph.
      const localDependencies = ['dependencies', 'optionalDependencies', 'peerDependencies']
        .flatMap((field) => Object.entries(manifest[field] ?? {}))
        .filter(([, spec]) => typeof spec === 'string' && spec.startsWith('file:'))
        .map(([name]) => name)
      return { name: manifest.name, version: manifest.version, localDependencies, manifestPath }
    })
    .filter((pkg) => pkg.name?.startsWith('@holocronlab/'))
}

function readBaseVersions(packages, base) {
  return new Map(
    packages.map((pkg) => {
      const manifestPath = relative(root, pkg.manifestPath)
      try {
        execFileSync('git', ['cat-file', '-e', `${base}:${manifestPath}`], { cwd: root, stdio: 'ignore' })
      }
      catch {
        return [pkg.name, undefined]
      }
      const manifest = JSON.parse(
        execFileSync('git', ['show', `${base}:${manifestPath}`], { cwd: root, encoding: 'utf8' })
      )
      return [pkg.name, manifest.version]
    })
  )
}

function assertBaseCommit(base) {
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: root, stdio: 'ignore' })
  }
  catch {
    throw new Error(`base commit is unavailable: ${base}`)
  }
}

async function main() {
  const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length)
  if (!base) throw new Error('usage: release-version-closure.mjs --base=<git-sha>')

  assertBaseCommit(base)
  const packages = readPackages()
  const violations = findReleaseVersionClosureViolations(packages, readBaseVersions(packages, base))
  if (violations.length > 0) {
    const details = violations
      .map(
        ({ dependency, dependencyVersion, consumer, consumerVersion }) =>
          `  ${consumer}@${consumerVersion} must bump because it publishes ${dependency}@${dependencyVersion}`
      )
      .join('\n')
    throw new Error(`release version closure is incomplete:\n${details}`)
  }

  process.stdout.write(`release version closure is complete against ${base}\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
