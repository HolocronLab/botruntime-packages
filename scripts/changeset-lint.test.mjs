import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import {
  filterAddedChangesetPaths,
  filterDeletedChangesetPaths,
  findMissingChangesets,
  findOrphanedChangesetDeletions,
  findUnknownDeclaredPackages,
  isReleaseRelevantPath,
  isReleaseVersionCommit,
  parseDeclaredPackages,
  parseGitStatus,
} from './changeset-lint.mjs'

test('a source change under a published package is release-relevant', () => {
  assert.equal(isReleaseRelevantPath('packages/brt/src/cli.ts', 'brt'), true)
})

test('test files, generated output, and docs are never release-relevant', () => {
  assert.equal(isReleaseRelevantPath('packages/brt/src/cli.test.ts', 'brt'), false)
  assert.equal(isReleaseRelevantPath('packages/brt/src/__tests__/fixture.ts', 'brt'), false)
  assert.equal(isReleaseRelevantPath('packages/brt/dist/index.js', 'brt'), false)
  assert.equal(isReleaseRelevantPath('packages/brt/CHANGELOG.md', 'brt'), false)
  assert.equal(isReleaseRelevantPath('packages/brt/README.md', 'brt'), false)
})

test('a path under a different package never matches', () => {
  assert.equal(isReleaseRelevantPath('packages/botruntime-adk/src/index.ts', 'brt'), false)
})

test('package.json is never release-relevant (it is the release script\'s own output)', () => {
  assert.equal(isReleaseRelevantPath('packages/brt/package.json', 'brt'), false)
})

test('a release commit that only bumps package.json (changeset-version.mjs output) does not trip the gate', () => {
  const missing = findMissingChangesets({
    changedPaths: ['packages/brt/package.json'],
    publicPackages: [{ name: '@holocronlab/brt', dir: 'brt' }],
    declaredPackageNames: new Set(),
  })
  assert.deepEqual(missing, [])
})

test('flags a touched package with no changeset entry', () => {
  const missing = findMissingChangesets({
    changedPaths: ['packages/brt/src/cli.ts'],
    publicPackages: [
      { name: '@holocronlab/brt', dir: 'brt' },
      { name: '@holocronlab/botruntime-adk', dir: 'botruntime-adk' },
    ],
    declaredPackageNames: new Set(),
  })
  assert.deepEqual(missing, ['@holocronlab/brt'])
})

test('passes once a changeset declares the touched package', () => {
  const missing = findMissingChangesets({
    changedPaths: ['packages/brt/src/cli.ts'],
    publicPackages: [{ name: '@holocronlab/brt', dir: 'brt' }],
    declaredPackageNames: new Set(['@holocronlab/brt']),
  })
  assert.deepEqual(missing, [])
})

test('a test-only change never requires a changeset', () => {
  const missing = findMissingChangesets({
    changedPaths: ['packages/brt/src/cli.test.ts', 'docs/adr/0009-x.md'],
    publicPackages: [{ name: '@holocronlab/brt', dir: 'brt' }],
    declaredPackageNames: new Set(),
  })
  assert.deepEqual(missing, [])
})

// DEVLP-174 review round 2, defect #5: README/CHANGELOG matching was
// case-sensitive, and only __tests__ (not test/ or tests/, the repo's actual
// convention — see packages/botruntime-chat/test, botruntime-zui/.../test)
// was exempted.
test('README/CHANGELOG are ignored case-insensitively', () => {
  assert.equal(isReleaseRelevantPath('packages/botruntime-client/readme.md', 'botruntime-client'), false)
  assert.equal(isReleaseRelevantPath('packages/botruntime-client/changelog.md', 'botruntime-client'), false)
  assert.equal(isReleaseRelevantPath('packages/brt/Readme.MD', 'brt'), false)
})

test('a /test/ or /tests/ directory (the repo\'s actual test-dir convention, not just __tests__) is never release-relevant', () => {
  assert.equal(isReleaseRelevantPath('packages/botruntime-chat/test/fixture.ts', 'botruntime-chat'), false)
  assert.equal(
    isReleaseRelevantPath('packages/botruntime-zui/src/transforms/zui-to-json-schema-legacy/test/x.ts', 'botruntime-zui'),
    false
  )
  assert.equal(isReleaseRelevantPath('packages/foo/tests/x.ts', 'foo'), false)
})

test('a path segment that merely contains "test" as a substring (not the whole segment) still counts as release-relevant', () => {
  assert.equal(isReleaseRelevantPath('packages/foo/src/contest/x.ts', 'foo'), true)
  assert.equal(isReleaseRelevantPath('packages/foo/src/latest/x.ts', 'foo'), true)
})

test('parses package names out of changeset frontmatter, ignoring the free-text body', () => {
  const declared = parseDeclaredPackages([
    '---\n"@holocronlab/brt": patch\n"@holocronlab/botruntime-adk": minor\n---\n\nSummary mentioning "@holocronlab/not-a-real-name": major inside prose.\n',
  ])
  assert.deepEqual([...declared].sort(), ['@holocronlab/botruntime-adk', '@holocronlab/brt'])
})

test('fails loud on a malformed frontmatter line instead of silently ignoring it', () => {
  assert.throws(
    () =>
      parseDeclaredPackages([
        '---\n"@holocronlab/brt": patch\nthis is not a valid frontmatter line\n---\n\nText.\n',
      ]),
    /invalid changeset frontmatter line/
  )
})

// DEVLP-174 review round 2, defect #1: declarations must come ONLY from
// changeset files ADDED by this PR's diff (git diff --name-status base..HEAD,
// status A), not from every *.md file that happens to survive in .changeset/.
// Otherwise a pending changeset for package X sitting on main between releases
// (added by an earlier, already-merged PR) silently "covers" any later PR that
// touches X without its own note.
test('parseGitStatus turns `git diff --name-status` output into {status, path} entries', () => {
  const output = 'A\t.changeset/foo.md\nM\tpackages/brt/src/cli.ts\nD\t.changeset/bar.md\n'
  assert.deepEqual(parseGitStatus(output), [
    { status: 'A', path: '.changeset/foo.md' },
    { status: 'M', path: 'packages/brt/src/cli.ts' },
    { status: 'D', path: '.changeset/bar.md' },
  ])
})

test('parseGitStatus takes the new path for a rename line (score suffix, three tab-separated columns)', () => {
  const output = 'R100\told/path.md\tnew/path.md\n'
  assert.deepEqual(parseGitStatus(output), [{ status: 'R', path: 'new/path.md' }])
})

test('parseGitStatus ignores trailing blank lines', () => {
  assert.deepEqual(parseGitStatus(''), [])
  assert.deepEqual(parseGitStatus('\n'), [])
})

test('filterAddedChangesetPaths only returns changeset files with status A', () => {
  const statusEntries = [
    { status: 'M', path: 'packages/foo/src/index.ts' },
    { status: 'A', path: '.changeset/new-foo-fix.md' },
    { status: 'A', path: '.changeset/README.md' },
    { status: 'A', path: 'packages/foo/README.md' },
  ]
  assert.deepEqual(filterAddedChangesetPaths(statusEntries), ['.changeset/new-foo-fix.md'])
})

test('a changeset file that already existed on base (no status entry in this diff at all) is excluded — closes the stale-pending-changeset loophole', () => {
  const statusEntries = [{ status: 'M', path: 'packages/foo/src/index.ts' }]
  assert.deepEqual(filterAddedChangesetPaths(statusEntries), [])
})

test('regression: a PR touching package X is still flagged missing even though an unrelated, already-merged pending changeset for X exists on disk — it was not ADDED by this diff', () => {
  // Models the exact bug: before the fix, changeset-lint.mjs read every
  // surviving .changeset/*.md file from disk regardless of diff status. Here
  // the PR's diff contains no added changeset at all (the file for foo is
  // pre-existing, from an earlier merged-but-unreleased PR) — so the fixed
  // pipeline (filterAddedChangesetPaths -> parseDeclaredPackages) must yield
  // an empty declared set, and the touched package must be flagged.
  const statusEntries = [{ status: 'M', path: 'packages/foo/src/index.ts' }]
  const declaredPackageNames = parseDeclaredPackages(filterAddedChangesetPaths(statusEntries).map(() => ''))
  assert.deepEqual(declaredPackageNames, new Set())

  const missing = findMissingChangesets({
    changedPaths: statusEntries.map((entry) => entry.path),
    publicPackages: [{ name: '@holocronlab/foo', dir: 'foo' }],
    declaredPackageNames,
  })
  assert.deepEqual(missing, ['@holocronlab/foo'])
})

// DEVLP-174 review round 2, defect #2: deleting a pending .changeset/*.md
// without consuming it (i.e. without the matching package.json/CHANGELOG.md
// bumps changeset-version.mjs writes in the same commit) must fail the gate —
// otherwise the release note is lost silently and permanently.
test('filterDeletedChangesetPaths only returns changeset files with status D', () => {
  const statusEntries = [
    { status: 'D', path: '.changeset/foo-fix.md' },
    { status: 'D', path: '.changeset/README.md' },
    { status: 'M', path: 'packages/foo/package.json' },
  ]
  assert.deepEqual(filterDeletedChangesetPaths(statusEntries), ['.changeset/foo-fix.md'])
})

test('isReleaseVersionCommit is true only when both a package.json and a CHANGELOG.md bump are present', () => {
  assert.equal(isReleaseVersionCommit([{ status: 'M', path: 'packages/foo/package.json' }]), false)
  assert.equal(isReleaseVersionCommit([{ status: 'M', path: 'packages/foo/CHANGELOG.md' }]), false)
  assert.equal(
    isReleaseVersionCommit([
      { status: 'M', path: 'packages/foo/package.json' },
      { status: 'M', path: 'packages/foo/CHANGELOG.md' },
    ]),
    true
  )
})

test('isReleaseVersionCommit ignores a DELETED package.json/CHANGELOG.md (that is not a bump)', () => {
  assert.equal(
    isReleaseVersionCommit([
      { status: 'D', path: 'packages/foo/package.json' },
      { status: 'D', path: 'packages/foo/CHANGELOG.md' },
    ]),
    false
  )
})

test('deleting a pending changeset with no matching release bumps is flagged as an orphaned deletion', () => {
  const statusEntries = [{ status: 'D', path: '.changeset/foo-fix.md' }]
  assert.deepEqual(findOrphanedChangesetDeletions(statusEntries), ['.changeset/foo-fix.md'])
})

test('deleting a pending changeset with only a package.json bump but no CHANGELOG.md bump is still flagged', () => {
  const statusEntries = [
    { status: 'D', path: '.changeset/foo-fix.md' },
    { status: 'M', path: 'packages/foo/package.json' },
  ]
  assert.deepEqual(findOrphanedChangesetDeletions(statusEntries), ['.changeset/foo-fix.md'])
})

test('deleting a pending changeset alongside its package.json + CHANGELOG.md bump (a real changeset-version release commit) is legitimate', () => {
  const statusEntries = [
    { status: 'D', path: '.changeset/foo-fix.md' },
    { status: 'M', path: 'packages/foo/package.json' },
    { status: 'M', path: 'packages/foo/CHANGELOG.md' },
  ]
  assert.deepEqual(findOrphanedChangesetDeletions(statusEntries), [])
})

test('no deletions at all means nothing to flag', () => {
  assert.deepEqual(findOrphanedChangesetDeletions([{ status: 'A', path: '.changeset/x.md' }]), [])
})

// DEVLP-174 review round 2, defect #3: a declared package name that does not
// match any published package (typo, private, or nonexistent) must fail the
// gate now, with a clear message — not only surface later when a maintainer
// runs changeset-version.mjs to cut a release.
test('findUnknownDeclaredPackages flags a declared name that matches no published package', () => {
  const declared = new Set(['@holocronlab/brt', '@holocronlab/typo-pkg'])
  const publicPackages = [
    { name: '@holocronlab/brt', dir: 'brt' },
    { name: '@holocronlab/botruntime-adk', dir: 'botruntime-adk' },
  ]
  assert.deepEqual(findUnknownDeclaredPackages(declared, publicPackages), ['@holocronlab/typo-pkg'])
})

test('findUnknownDeclaredPackages passes when every declared name matches a published package', () => {
  const declared = new Set(['@holocronlab/brt'])
  const publicPackages = [{ name: '@holocronlab/brt', dir: 'brt' }]
  assert.deepEqual(findUnknownDeclaredPackages(declared, publicPackages), [])
})

test('CLI fails closed when the requested base commit is unavailable', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/changeset-lint.mjs', '--base=definitely-not-a-real-ref'],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /base commit is unavailable/)
})

test('CLI fails closed when no --base is given', () => {
  const result = spawnSync(process.execPath, ['scripts/changeset-lint.mjs'], {
    cwd: new URL('../', import.meta.url),
    encoding: 'utf8',
  })

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /usage: changeset-lint\.mjs --base=/)
})
