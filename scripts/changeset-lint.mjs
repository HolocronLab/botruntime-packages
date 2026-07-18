#!/usr/bin/env node
// CI gate for DEVLP-174: "no CHANGELOG anywhere, so an updated brt/ADK ships with
// no record of what changed or what could break." A PR that touches a published
// package's source without a .changeset/*.md entry merges silently — the same
// silent-degradation failure mode this repo already fails loud on elsewhere
// (release-version-closure.mjs). Fail loud here too, before merge.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { readPublicPackages } from './changeset-packages.mjs'
import { parseChangesetFile } from './changeset-parse.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Path filter (not a --empty bypass): tests, generated/vendored output, and the
// changelog/readme files themselves are not release-relevant, so touching only
// those never demands a changeset. Any other src change under a published
// package's directory does — including "just a refactor", per CLAUDE.md TDD/
// review discipline: a silent behavior-neutral change is still worth one line.
// package.json is ignored too: changeset-version.mjs itself bumps it as a release
// artifact (and deletes the consumed .changeset entries in the same commit), so
// the committed result would otherwise look like "src changed, no changeset" to
// this gate. A content-bearing dependency edit always ships alongside a src
// change that already trips the gate, so this can't mask a real missing entry.
// Case-insensitive (readme.md/README.md/Readme.MD are the same file on the
// filesystems that matter here), and test dirs match this repo's ACTUAL
// convention — `test/`/`tests/` (see packages/botruntime-chat/test,
// botruntime-zui/.../test), not just __tests__ — so a docs/test-only PR never
// needs a placeholder changeset (DEVLP-174 review round 2, defect #5).
const IGNORED_PATH_PATTERN =
  /(\.test\.|\.spec\.|\/(__tests__|tests?)\/|\/(dist|node_modules)\/|\/CHANGELOG\.md$|\/README\.md$|\/package\.json$)/i

export function isReleaseRelevantPath(path, packageDir) {
  const prefix = `packages/${packageDir}/`
  if (!path.startsWith(prefix)) return false
  return !IGNORED_PATH_PATTERN.test(path)
}

export function findMissingChangesets({ changedPaths, publicPackages, declaredPackageNames }) {
  const touched = publicPackages.filter((pkg) => changedPaths.some((path) => isReleaseRelevantPath(path, pkg.dir)))
  return touched
    .map((pkg) => pkg.name)
    .filter((name) => !declaredPackageNames.has(name))
    .sort()
}

// Runs the same STRICT parser changeset-version.mjs uses to cut a release
// (changeset-parse.mjs). A malformed pending changeset must fail this gate now,
// not silently pass lint and only blow up later when someone runs the release
// script — that's a red PR today instead of a stuck release tomorrow.
export function parseDeclaredPackages(changesetContents) {
  const declared = new Set()
  for (const content of changesetContents) {
    const { bumps } = parseChangesetFile(content)
    for (const name of bumps.keys()) declared.add(name)
  }
  return declared
}

function isChangesetPath(path) {
  return path.startsWith('.changeset/') && path.endsWith('.md') && path !== '.changeset/README.md'
}

// Parses `git diff --name-status` output into {status, path} entries. Single
// status letter (A/M/D/...); for a rename line (`R100\told\tnew`, score
// suffix + two paths) the NEW path is what matters here.
export function parseGitStatus(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const columns = line.split('\t')
      return { status: columns[0][0], path: columns[columns.length - 1] }
    })
}

// DEVLP-174 review round 2, defect #1: only a changeset file ADDED by this
// PR's diff can declare a package. Reading every *.md file that survives on
// disk (the pre-fix behavior) let a pending changeset for package X already
// on main between releases (added by an earlier, already-merged PR) silently
// "cover" any later PR that touches X without its own note.
export function filterAddedChangesetPaths(statusEntries) {
  return statusEntries.filter((entry) => entry.status === 'A' && isChangesetPath(entry.path)).map((entry) => entry.path)
}

export function filterDeletedChangesetPaths(statusEntries) {
  return statusEntries.filter((entry) => entry.status === 'D' && isChangesetPath(entry.path)).map((entry) => entry.path)
}

const RELEASE_ARTIFACT_PATTERN = /^packages\/[^/]+\/(package\.json|CHANGELOG\.md)$/

// True only for a diff that actually bumps both a package.json AND a
// CHANGELOG.md (changeset-version.mjs always writes both, in the same
// commit, for every package it touches) — the signature of a real release
// commit, as opposed to any other diff that happens to delete a changeset.
export function isReleaseVersionCommit(statusEntries) {
  const bumps = statusEntries.filter((entry) => entry.status !== 'D' && RELEASE_ARTIFACT_PATTERN.test(entry.path))
  return bumps.some((entry) => entry.path.endsWith('/package.json')) && bumps.some((entry) => entry.path.endsWith('/CHANGELOG.md'))
}

// DEVLP-174 review round 2, defect #2: a pending changeset can only ever be
// legitimately removed by changeset-version.mjs, which consumes it AND writes
// the package.json/CHANGELOG.md bumps in the same commit. A diff that deletes
// a .changeset/*.md without those bumps loses the release note silently and
// permanently — that must be a red PR, not a quiet pass.
export function findOrphanedChangesetDeletions(statusEntries) {
  const deleted = filterDeletedChangesetPaths(statusEntries)
  if (deleted.length === 0) return []
  return isReleaseVersionCommit(statusEntries) ? [] : deleted
}

// DEVLP-174 review round 2, defect #3: a declared package name that matches
// no published package (typo, private, or nonexistent) must fail the gate
// now, with a clear message — today that only surfaces later, when a
// maintainer runs changeset-version.mjs to cut a release, and blocks it.
export function findUnknownDeclaredPackages(declaredPackageNames, publicPackages) {
  const knownNames = new Set(publicPackages.map((pkg) => pkg.name))
  return [...declaredPackageNames].filter((name) => !knownNames.has(name)).sort()
}

function readGitStatusEntries(base) {
  const output = execFileSync('git', ['diff', '--name-status', base, 'HEAD'], { cwd: root, encoding: 'utf8' })
  return parseGitStatus(output)
}

function readAddedChangesetContents(statusEntries) {
  return filterAddedChangesetPaths(statusEntries).map((path) => readFileSync(resolve(root, path), 'utf8'))
}

function assertBaseCommit(base) {
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: root, stdio: 'ignore' })
  } catch {
    throw new Error(`base commit is unavailable: ${base}`)
  }
}

async function main() {
  const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length)
  if (!base) throw new Error('usage: changeset-lint.mjs --base=<git-sha>')

  assertBaseCommit(base)
  const statusEntries = readGitStatusEntries(base)
  const changedPaths = statusEntries.map((entry) => entry.path)
  const publicPackages = readPublicPackages(root)
  const declaredPackageNames = parseDeclaredPackages(readAddedChangesetContents(statusEntries))

  const unknownDeclared = findUnknownDeclaredPackages(declaredPackageNames, publicPackages)
  if (unknownDeclared.length > 0) {
    const details = unknownDeclared.map((name) => `  - ${name}`).join('\n')
    throw new Error(
      `changeset declares unknown or non-published package(s):\n${details}\n\n` +
        'Check the spelling against the "name" field in packages/*/package.json, and confirm the package ' +
        'is actually published (private !== true).\n'
    )
  }

  const orphanedDeletions = findOrphanedChangesetDeletions(statusEntries)
  if (orphanedDeletions.length > 0) {
    const details = orphanedDeletions.map((path) => `  - ${path}`).join('\n')
    throw new Error(
      `pending changeset(s) deleted without a matching release commit:\n${details}\n\n` +
        'A .changeset/*.md entry is only ever consumed by scripts/changeset-version.mjs, which bumps the ' +
        'package.json version and prepends a CHANGELOG.md section in the SAME commit. This diff deletes the ' +
        'file without those bumps, which would lose the release note permanently. Restore the file, or include ' +
        'the release bump in this diff.\n'
    )
  }

  const missing = findMissingChangesets({ changedPaths, publicPackages, declaredPackageNames })
  if (missing.length > 0) {
    const details = missing.map((name) => `  - ${name}`).join('\n')
    throw new Error(
      `missing .changeset entry for published package(s) with source changes:\n${details}\n\n` +
        'Add a file to .changeset/ describing the change (see .changeset/README.md), e.g.:\n\n' +
        `  ---\n  "${missing[0]}": patch\n  ---\n\n  Describe the change and why it matters to consumers.\n`
    )
  }

  process.stdout.write(`changeset gate: ${publicPackages.length} published package(s) checked, none missing an entry\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
