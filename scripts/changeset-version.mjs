#!/usr/bin/env node
// Consumes accumulated .changeset/*.md entries (DEVLP-174), bumps each referenced
// package's package.json version, and prepends a CHANGELOG.md section. Run by a
// maintainer before tagging a release (mirrors this repo's existing pattern of
// manually-committed exact versions, e.g. prepare-package-publish.mjs) — this
// script does not publish anything and is not wired into CI.
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { readPublicPackagesWithLocalDependencies } from './changeset-packages.mjs'
import { parseChangesetFile } from './changeset-parse.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const SEVERITY = { patch: 1, minor: 2, major: 3 }

// Re-exported for changeset-version.test.mjs and any other existing importer:
// the parser itself now lives in changeset-parse.mjs so changeset-lint.mjs can
// share it without importing this release script.
export { parseChangesetFile }

export function combineBumps(bumpsList) {
  const combined = new Map()
  for (const bumps of bumpsList) {
    for (const [name, level] of bumps) {
      const current = combined.get(name)
      if (!current || SEVERITY[level] > SEVERITY[current]) combined.set(name, level)
    }
  }
  return combined
}

export function bumpVersion(version, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`cannot bump non-plain-semver version: ${version}`)
  let [major, minor, patch] = match.slice(1).map(Number)
  if (level === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (level === 'minor') {
    minor += 1
    patch = 0
  } else if (level === 'patch') {
    patch += 1
  } else {
    throw new Error(`unknown bump level: ${level}`)
  }
  return `${major}.${minor}.${patch}`
}

export function buildChangelogSection(version, date, summaries) {
  const bullets = summaries.map((line) => `- ${line}`).join('\n')
  return `## ${version} (current) — ${date}\n\n${bullets}`
}

// The previous topmost version is no longer current, and the new section goes
// above it — right after the title/intro block, before the first existing
// "## " heading (or at the end, for a CHANGELOG that has none yet).
export function insertChangelogSection(content, section) {
  const withoutCurrentMarker = content.replace(/^(## \S.*) \(current\)(.*)$/m, '$1$2')
  const headingIndex = withoutCurrentMarker.search(/^## /m)
  if (headingIndex === -1) {
    return `${withoutCurrentMarker.trimEnd()}\n\n${section}\n`
  }
  return `${withoutCurrentMarker.slice(0, headingIndex)}${section}\n\n${withoutCurrentMarker.slice(headingIndex)}`
}

// Reverse of the file:-dependency graph release-version-closure.mjs walks
// forward at publish time: dependency name -> set of packages that declare it
// as a `file:` dep. Walking this in reverse from a changed package finds every
// runtime consumer whose published file: reference will be rewritten to a new
// exact version — that consumer needs its own version bump too, or
// release-version-closure.mjs fails after this script has already run.
function buildReverseDependents(packages) {
  const reverse = new Map()
  for (const pkg of packages) {
    for (const dependency of pkg.localDependencies) {
      if (!reverse.has(dependency)) reverse.set(dependency, new Set())
      reverse.get(dependency).add(pkg.name)
    }
  }
  return reverse
}

// Walks the reverse dependency graph outward from every explicitly-bumped
// package (changesets), patch-bumping any transitive consumer that has no
// changeset of its own. `triggeredBy` records, per auto-bumped package, which
// of its direct dependencies changed — the CHANGELOG line names that specific
// dependency, not the whole transitive chain. A package with its own explicit
// changeset is never in `triggeredBy`: it keeps only its authored summary,
// per DEVLP-174 review ("явно заявленный потребитель НЕ дублируется").
export function computeAutoBumps(explicitBumps, packages) {
  const reverseGraph = buildReverseDependents(packages)
  const allBumps = new Map(explicitBumps)
  const triggeredBy = new Map()

  const queue = [...explicitBumps.keys()]
  const queued = new Set(queue)
  while (queue.length > 0) {
    const name = queue.shift()
    for (const consumer of reverseGraph.get(name) ?? []) {
      if (!explicitBumps.has(consumer)) {
        if (!triggeredBy.has(consumer)) triggeredBy.set(consumer, new Set())
        triggeredBy.get(consumer).add(name)
        if (!allBumps.has(consumer)) allBumps.set(consumer, 'patch')
      }
      if (!queued.has(consumer)) {
        queued.add(consumer)
        queue.push(consumer)
      }
    }
  }

  return { allBumps, triggeredBy }
}

// Builds the full release plan — every package.json bump and CHANGELOG section
// this run will write — WITHOUT writing anything. Every entry (explicit
// changesets + auto reverse-closure bumps) is validated and computed here
// first; main() only starts touching the filesystem once this returns
// successfully. That two-phase split is deliberate (DEVLP-174 review): a
// mid-run failure — an unknown package, a non-plain-semver version — must
// leave zero files written, not a half-applied release.
export function buildReleasePlan({ packages, explicitBumps, summariesByPackage }) {
  const byName = new Map(packages.map((pkg) => [pkg.name, pkg]))
  for (const name of explicitBumps.keys()) {
    if (!byName.has(name)) throw new Error(`changeset references unknown or non-public package: ${name}`)
  }

  const { allBumps, triggeredBy } = computeAutoBumps(explicitBumps, packages)

  const newVersions = new Map()
  for (const [name, level] of allBumps) {
    newVersions.set(name, bumpVersion(byName.get(name).version, level))
  }

  return [...allBumps.keys()].sort().map((name) => {
    const pkg = byName.get(name)
    const level = allBumps.get(name)
    const changelogLines = explicitBumps.has(name)
      ? summariesByPackage.get(name)
      : [...(triggeredBy.get(name) ?? [])]
          .sort()
          .map((dependency) => `Обновлены внутренние зависимости: ${dependency}@${newVersions.get(dependency)}`)
    return { name, dir: pkg.dir, oldVersion: pkg.version, newVersion: newVersions.get(name), level, changelogLines }
  })
}

function readChangesetFiles(changesetDir) {
  if (!existsSync(changesetDir)) return []
  return readdirSync(changesetDir).filter((name) => name.endsWith('.md') && name !== 'README.md')
}

async function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith('--root='))?.slice('--root='.length)
  const root = rootArg ? resolve(rootArg) : repoRoot
  const dryRun = process.argv.includes('--dry-run')
  const changesetDir = resolve(root, '.changeset')

  const files = readChangesetFiles(changesetDir)
  if (files.length === 0) {
    process.stdout.write('no .changeset entries to release\n')
    return
  }

  const parsed = files.map((name) => ({
    name,
    ...parseChangesetFile(readFileSync(resolve(changesetDir, name), 'utf8')),
  }))
  const explicitBumps = combineBumps(parsed.map((entry) => entry.bumps))

  const summariesByPackage = new Map()
  for (const { bumps, summary } of parsed) {
    for (const name of bumps.keys()) {
      if (!summariesByPackage.has(name)) summariesByPackage.set(name, [])
      summariesByPackage.get(name).push(summary)
    }
  }

  const packages = readPublicPackagesWithLocalDependencies(root)
  const date = new Date().toISOString().slice(0, 10)

  // Phase 1: compute and validate the whole plan. Nothing below this point
  // reads a package's own current CHANGELOG yet, so a throw here (unknown
  // package, non-plain-semver version) still leaves the filesystem untouched.
  const plan = buildReleasePlan({ packages, explicitBumps, summariesByPackage }).map((entry) => {
    const manifestPath = resolve(root, 'packages', entry.dir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const changelogPath = resolve(root, 'packages', entry.dir, 'CHANGELOG.md')
    const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : `# ${entry.name}\n\n`
    const section = buildChangelogSection(entry.newVersion, date, entry.changelogLines)
    return {
      ...entry,
      manifestPath,
      manifest,
      changelogPath,
      updatedChangelog: insertChangelogSection(changelog, section),
    }
  })

  for (const entry of plan) {
    console.log(`${entry.name}: ${entry.oldVersion} -> ${entry.newVersion} (${entry.level})`)
  }

  // Phase 2: write. Only reached once every entry above computed cleanly.
  if (dryRun) {
    process.stdout.write('(dry run — no files written; pass no --dry-run flag to apply)\n')
    return
  }

  for (const entry of plan) {
    entry.manifest.version = entry.newVersion
    writeFileSync(entry.manifestPath, `${JSON.stringify(entry.manifest, null, 2)}\n`)
    writeFileSync(entry.changelogPath, entry.updatedChangelog)
  }

  for (const name of files) unlinkSync(resolve(changesetDir, name))
  process.stdout.write(`consumed ${files.length} changeset file(s)\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
