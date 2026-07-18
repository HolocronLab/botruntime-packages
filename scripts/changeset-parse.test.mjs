import assert from 'node:assert/strict'
import test from 'node:test'

import { parseChangesetFile } from './changeset-parse.mjs'

// DEVLP-174 review round 3, defect #4: last-wins on a duplicate package line
// would silently let a later, weaker bump overwrite an earlier stronger one
// (e.g. a trailing "patch" line clobbering an earlier "major"), understating
// the release. Two lines for the same package must fail loud instead.
test('rejects a changeset that declares the same package twice in frontmatter', () => {
  assert.throws(
    () => parseChangesetFile('---\n"@holocronlab/brt": major\n"@holocronlab/brt": patch\n---\n\nText.\n'),
    /duplicate package in changeset frontmatter/
  )
})

test('accepts a changeset that declares distinct packages once each', () => {
  const { bumps } = parseChangesetFile(
    '---\n"@holocronlab/brt": major\n"@holocronlab/botruntime-adk": patch\n---\n\nText.\n'
  )
  assert.deepEqual(
    [...bumps].sort(),
    [
      ['@holocronlab/botruntime-adk', 'patch'],
      ['@holocronlab/brt', 'major'],
    ].sort()
  )
})

// DEVLP-174 review round 3, defect #5: an empty frontmatter block with a
// non-empty body passes the existing empty-body check but declares zero
// packages. changeset-version.mjs only ever picks up a package via its
// bumps map, so this note would silently vanish at release time instead of
// shipping the change it documents.
test('rejects a changeset with an empty frontmatter block but a non-empty body', () => {
  assert.throws(
    () => parseChangesetFile('---\n\n---\n\nThis never reaches any package.\n'),
    /must declare at least one package bump/
  )
})

test('rejects a changeset with a whitespace-only frontmatter block', () => {
  assert.throws(
    () => parseChangesetFile('---\n  \n\t\n---\n\nText.\n'),
    /must declare at least one package bump/
  )
})
