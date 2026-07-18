#!/usr/bin/env node
// CI gate for DEVLP-174: "no CHANGELOG anywhere, so an updated brt/ADK ships with
// no record of what changed or what could break." A PR that touches a published
// package's source without a .changeset/*.md entry merges silently — the same
// silent-degradation failure mode this repo already fails loud on elsewhere
// (release-version-closure.mjs). Fail loud here too, before merge.
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { readPublicPackages } from './changeset-packages.mjs'
import { parseChangesetFile } from './changeset-parse.mjs'
import { bumpVersion, combineBumps } from './changeset-version.mjs'

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
  /(\.test\.|\.spec\.|\/(__tests__|tests?)\/|\/node_modules\/|\/CHANGELOG\.md$|\/README\.md$)/i

// dist/ — отдельно от общего фильтра: у пакетов С src/ это сборочный артефакт,
// а у vendored-пакетов без src/ (botruntime-chat/verel/yargs-extra) tracked
// dist/ и ЕСТЬ публикуемая реализация — её правка обязана требовать changeset.
const DIST_PATH_PATTERN = /\/dist\//

export function isReleaseRelevantPath(path, pkg) {
  const dir = typeof pkg === 'string' ? pkg : pkg.dir
  const hasSrc = typeof pkg === 'string' ? true : pkg.hasSrc !== false
  const prefix = `packages/${dir}/`
  if (!path.startsWith(prefix)) return false
  // Корневой манифест исключается НЕ здесь безусловно, а в main() — и только
  // когда его дифф против base сводится к полю version (релизный артефакт
  // version-скрипта). Правка exports/bin/files/deps — consumer-facing и требует
  // changeset. Вложенные package.json (brt/templates/* — SDK-пины генерируемых
  // проектов) всегда релевантны.
  if (hasSrc && DIST_PATH_PATTERN.test(path)) return false
  return !IGNORED_PATH_PATTERN.test(path)
}

export function findMissingChangesets({ changedPaths, publicPackages, declaredPackageNames }) {
  const touched = publicPackages.filter((pkg) => changedPaths.some((path) => isReleaseRelevantPath(path, pkg)))
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
// status letter (A/M/D/...) for a plain line. A rename line (`R100\told\tnew`,
// score suffix + two tab-separated paths) yields TWO entries, not one: the
// OLD path no longer exists there (a deletion), the NEW path exists there for
// the first time (an addition). Collapsing a rename to only its destination
// (DEVLP-174 review round 3, defect #1) let a rename from src -> test/ dodge
// the release-relevance gate (the destination alone reads as ignored-only)
// and let a rename of a pending .changeset/*.md out of .changeset/ dodge the
// orphaned-deletion check (the destination alone is no longer a changeset
// path at all) — both loopholes close once both sides are classified.
export function parseGitStatus(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      const columns = line.split('\t')
      if (columns.length === 3) {
        const [, oldPath, newPath] = columns
        return [
          { status: 'D', path: oldPath },
          { status: 'A', path: newPath },
        ]
      }
      return [{ status: columns[0][0], path: columns[columns.length - 1] }]
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

// DEVLP-174 review round 3, defect #2: a MODIFIED (status M) pending
// changeset never declares a package for THIS PR — defect #1's rule stands,
// only an ADDED file does, or a pending changeset already covering package X
// on main could be edited (not added) by an unrelated PR to "cover" it again.
// But an edit to an existing note still has to stay a valid, non-empty note:
// this is read separately (see findInvalidModifiedChangesets) purely to
// validate, never to declare.
export function filterModifiedChangesetPaths(statusEntries) {
  return statusEntries.filter((entry) => entry.status === 'M' && isChangesetPath(entry.path)).map((entry) => entry.path)
}

const RELEASE_ARTIFACT_PATTERN = /^packages\/([^/]+)\/(package\.json|CHANGELOG\.md)$/

// Per-package-dir bump state: a dir only counts as "released" once its OWN
// package.json AND its OWN CHANGELOG.md were both touched (non-delete) in
// this diff — changeset-version.mjs always writes both, in the same commit,
// for every package it touches.
export function computeBumpedPackageDirs(statusEntries) {
  const bumped = new Map()
  for (const entry of statusEntries) {
    if (entry.status === 'D') continue
    const match = RELEASE_ARTIFACT_PATTERN.exec(entry.path)
    if (!match) continue
    const [, dir, file] = match
    const state = bumped.get(dir) ?? { packageJson: false, changelog: false }
    if (file === 'package.json') state.packageJson = true
    else state.changelog = true
    bumped.set(dir, state)
  }
  return bumped
}

// DEVLP-174 review round 2, defect #2 / round 3, defect #3: a pending
// changeset can only ever be legitimately removed by changeset-version.mjs,
// which consumes it AND writes ITS OWN declared package(s)' package.json +
// CHANGELOG.md bumps in the same commit. Round 2's check accepted ANY
// manifest + ANY changelog bump anywhere in the diff — a PR could delete
// package X's changeset while only bumping unrelated package Y, and the
// global heuristic would wave it through. `deletedChangesetDeclarations`
// carries, per deleted path, the package names that changeset declared AS IT
// EXISTED IN BASE (before the deletion) — every one of them must show its own
// bump, or the deletion is orphaned.
// versionChangedByDir: «манифест тронут» — недостаточно (правка dep-спеки без
// бампа тоже трогает package.json); релизом считается только РЕАЛЬНО
// изменившаяся версия относительно base.
// expectedVersionByDir (опционально): фактический HEAD-бамп сверяется с
// АГРЕГИРОВАННЫМ заявленным уровнем всех удаляемых заметок пакета — иначе
// вручную собранный релизный коммит мог бы схлопнуть major-заметку в patch и
// навсегда занизить breaking-релиз.
export function findOrphanedChangesetDeletions({
  statusEntries,
  deletedChangesetDeclarations,
  publicPackages,
  versionChangedByDir,
  expectedVersionByDir,
}) {
  if (deletedChangesetDeclarations.length === 0) return []
  const bumpedDirs = computeBumpedPackageDirs(statusEntries)
  const dirByName = new Map(publicPackages.map((pkg) => [pkg.name, pkg.dir]))

  return deletedChangesetDeclarations
    .filter(({ packageNames }) =>
      !packageNames.every((name) => {
        const dir = dirByName.get(name)
        const state = dir && bumpedDirs.get(dir)
        if (!state?.packageJson || !state?.changelog) return false
        if (versionChangedByDir && versionChangedByDir.get(dir) !== true) return false
        if (expectedVersionByDir && expectedVersionByDir.has(dir)) {
          const { expected, head } = expectedVersionByDir.get(dir)
          if (expected !== head) return false
        }
        return true
      })
    )
    .map(({ path }) => path)
}

// Агрегированный ожидаемый semver: base-версия + combineBumps по всем
// удаляемым заметкам каждого пакета — против фактической HEAD-версии.
function computeExpectedVersionByDir(base, deletedChangesetDeclarations, publicPackages) {
  const dirByName = new Map(publicPackages.map((pkg) => [pkg.name, pkg.dir]))
  const bumpsByDir = new Map()
  for (const { bumps } of deletedChangesetDeclarations) {
    for (const [name, level] of bumps) {
      const dir = dirByName.get(name)
      if (!dir) continue
      const list = bumpsByDir.get(dir) ?? []
      list.push(new Map([[name, level]]))
      bumpsByDir.set(dir, list)
    }
  }
  const out = new Map()
  for (const [dir, bumpsList] of bumpsByDir) {
    const baseVersion = readBaseVersion(base, dir)
    if (!baseVersion) continue
    const combined = combineBumps(bumpsList)
    const level = [...combined.values()][0]
    let head = null
    try {
      head = JSON.parse(readFileSync(resolve(root, 'packages', dir, 'package.json'), 'utf8')).version
    } catch {
      head = null
    }
    out.set(dir, { expected: bumpVersion(baseVersion, level), head })
  }
  return out
}

// isVersionOnlyManifestChange: корневой манифест «чисто релизный», если base и
// HEAD совпадают после выкидывания version. Любое другое поле (exports/bin/
// files/deps) — consumer-facing изменение, требующее changeset.
export function isVersionOnlyManifestChange(baseContent, headContent) {
  let baseJson
  let headJson
  try {
    baseJson = JSON.parse(baseContent)
    headJson = JSON.parse(headContent)
  } catch {
    return false
  }
  delete baseJson.version
  delete headJson.version
  return JSON.stringify(baseJson) === JSON.stringify(headJson)
}

function readManifestPair(base, path) {
  let baseContent = null
  try {
    baseContent = execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8' })
  } catch {
    return null
  }
  let headContent = null
  try {
    headContent = readFileSync(resolve(root, path), 'utf8')
  } catch {
    return null
  }
  return { baseContent, headContent }
}

// Версии из base против HEAD для каталогов, чьи манифесты тронуты диффом.
function readVersionChangedByDir(base, statusEntries) {
  const changed = new Map()
  for (const entry of statusEntries) {
    const match = /^packages\/([^/]+)\/package\.json$/.exec(entry.path)
    if (!match || entry.status === 'D') continue
    const dir = match[1]
    let baseVersion = null
    try {
      baseVersion = JSON.parse(
        execFileSync('git', ['show', `${base}:${entry.path}`], { cwd: root, encoding: 'utf8' })
      ).version
    } catch {
      // Нового в base нет — любой HEAD-манифест считается изменившейся версией.
    }
    let headVersion = null
    try {
      headVersion = JSON.parse(readFileSync(resolve(root, entry.path), 'utf8')).version
    } catch {
      headVersion = null
    }
    changed.set(dir, baseVersion !== headVersion)
  }
  return changed
}

// DEVLP-174 review round 3, defect #2: runs the same STRICT parser as an
// added changeset, but only to validate — a modified pending note must stay
// well-formed and non-empty, or a since-broken edit to an existing entry
// merges silently and only blows up later at release time.
export function findInvalidModifiedChangesets(modifiedChangesetEntries, publicPackages) {
  const knownNames = publicPackages ? new Set(publicPackages.map((pkg) => pkg.name)) : null
  const invalid = []
  for (const { path, content } of modifiedChangesetEntries) {
    try {
      const parsed = parseChangesetFile(content)
      // Правка существующей заметки может подменить пакет на опечатку/private —
      // без кросс-чека это всплыло бы только при релизе и заблокировало его.
      if (knownNames) {
        for (const name of parsed.bumps.keys()) {
          if (!knownNames.has(name)) {
            throw new Error(`unknown or non-public package: ${name}`)
          }
        }
      }
    } catch (err) {
      invalid.push({ path, message: err.message })
    }
  }
  return invalid
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

function readModifiedChangesetEntries(statusEntries) {
  return filterModifiedChangesetPaths(statusEntries).map((path) => ({ path, content: readFileSync(resolve(root, path), 'utf8') }))
}

// Reads each DELETED changeset's content from BASE (via `git show`) — the
// working tree no longer has it, and it must be read as it existed before
// the deletion, not whatever (if anything) replaced it — then parses out the
// package names it declared, for findOrphanedChangesetDeletions to correlate
// against this diff's own release-artifact bumps.
function readDeletedChangesetDeclarations(base, statusEntries) {
  return filterDeletedChangesetPaths(statusEntries).map((path) => {
    const content = execFileSync('git', ['show', `${base}:${path}`], { cwd: root, encoding: 'utf8' })
    const { bumps } = parseChangesetFile(content)
    return { path, packageNames: [...bumps.keys()], bumps }
  })
}

// Версии пакетов из base (для сверки фактического бампа с заявленным уровнем).
function readBaseVersion(base, dir) {
  try {
    return JSON.parse(
      execFileSync('git', ['show', `${base}:packages/${dir}/package.json`], { cwd: root, encoding: 'utf8' })
    ).version
  } catch {
    return null
  }
}

function assertBaseCommit(base) {
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: root, stdio: 'ignore' })
  } catch {
    throw new Error(`base commit is unavailable: ${base}`)
  }
}

// --require-empty: релизный режим для publish-воркфлоу — публикация со
// свежим source под СТАРЫМ semver (npm-версия иммутабельна) молча съедала бы
// pending-заметки; релиз обязан начинаться с прогона changeset-version.mjs.
function requireEmptyChangesets() {
  // recursive: вложенный .changeset/dir/foo.md не должен прятаться от релизной
  // проверки (гейт его отклоняет, но релиз мог стартовать со старой базы).
  const pending = readdirSync(resolve(root, '.changeset'), { recursive: true })
    .map(String)
    .filter((name) => name.endsWith('.md') && name.toLowerCase() !== 'readme.md')
  if (pending.length > 0) {
    throw new Error(
      `pending changesets remain: ${pending.join(', ')}\n` +
      'Run `node scripts/changeset-version.mjs`, commit the version bumps and CHANGELOGs, then publish.'
    )
  }
  console.log('changeset gate: no pending changesets — publish may proceed')
}

// Вложенные пути в .changeset не поддерживаются НИГДЕ (version-скрипт и
// require-empty читают плоско): принять их в гейте значило бы молча потерять
// заметку при релизе.
export function findNestedChangesetPaths(statusEntries) {
  return statusEntries
    .filter((entry) => /^\.changeset\/.+\//.test(entry.path))
    .map((entry) => entry.path)
    .sort()
}

async function main() {
  if (process.argv.includes('--require-empty')) {
    requireEmptyChangesets()
    return
  }
  const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length)
  if (!base) throw new Error('usage: changeset-lint.mjs --base=<git-sha>')

  assertBaseCommit(base)
  const statusEntries = readGitStatusEntries(base)
  const nestedChangesets = findNestedChangesetPaths(statusEntries)
  if (nestedChangesets.length > 0) {
    throw new Error(`nested .changeset paths are unsupported: ${nestedChangesets.join(', ')}\nplace changesets flat in .changeset/<name>.md`)
  }
  const changedPathsRaw = statusEntries.map((entry) => entry.path)
  const rootManifestPattern = /^packages\/[^/]+\/package\.json$/
  const releaseOnlyManifests = new Set(
    changedPathsRaw.filter((path) => {
      if (!rootManifestPattern.test(path)) return false
      const pair = readManifestPair(base, path)
      return pair !== null && isVersionOnlyManifestChange(pair.baseContent, pair.headContent)
    })
  )
  const changedPaths = changedPathsRaw.filter((path) => !releaseOnlyManifests.has(path))
  const publicPackages = readPublicPackages(root)

  const invalidModified = findInvalidModifiedChangesets(readModifiedChangesetEntries(statusEntries), publicPackages)
  if (invalidModified.length > 0) {
    const details = invalidModified.map((entry) => `  - ${entry.path}: ${entry.message}`).join('\n')
    throw new Error(
      `modified .changeset entry is invalid:\n${details}\n\n` +
        'A pending changeset edited in this diff must stay a well-formed, non-empty note — it does not declare ' +
        'a package for THIS PR (only a newly added changeset does), but it still has to survive parsing when ' +
        'changeset-version.mjs eventually consumes it.\n'
    )
  }

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

  const deletedChangesetDeclarations = readDeletedChangesetDeclarations(base, statusEntries)
  const orphanedDeletions = findOrphanedChangesetDeletions({
    statusEntries,
    deletedChangesetDeclarations,
    publicPackages,
    versionChangedByDir: readVersionChangedByDir(base, statusEntries),
    expectedVersionByDir: computeExpectedVersionByDir(base, deletedChangesetDeclarations, publicPackages),
  })
  if (orphanedDeletions.length > 0) {
    const details = orphanedDeletions.map((path) => `  - ${path}`).join('\n')
    throw new Error(
      `pending changeset(s) deleted without a matching release commit for THEIR OWN package(s):\n${details}\n\n` +
        'A .changeset/*.md entry is only ever consumed by scripts/changeset-version.mjs, which bumps EACH package ' +
        'it declares (package.json + CHANGELOG.md, in the SAME commit). This diff deletes the file without those ' +
        'bumps for every package it declared, which would lose the release note permanently. Restore the file, or ' +
        'include the matching release bump(s) in this diff.\n'
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
