import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { findMissingChangesets, isReleaseRelevantPath, parseDeclaredPackages } from './changeset-lint.mjs'

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

test('parses package names out of changeset frontmatter, ignoring the free-text body', () => {
  const declared = parseDeclaredPackages([
    '---\n"@holocronlab/brt": patch\n"@holocronlab/botruntime-adk": minor\n---\n\nSummary mentioning "@holocronlab/not-a-real-name": major inside prose.\n',
  ])
  assert.deepEqual([...declared].sort(), ['@holocronlab/botruntime-adk', '@holocronlab/brt'])
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
