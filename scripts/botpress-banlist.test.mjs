import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { findBannedImports, scanDirectories } from './botpress-banlist.mjs'

test('findBannedImports flags a static import from an @botpress/* package', () => {
  const violations = findBannedImports('some.ts', "import { Table, z } from '@botpress/runtime'\n")
  assert.deepEqual(violations, [{ line: 1, text: "import { Table, z } from '@botpress/runtime'" }])
})

test('findBannedImports flags require() and dynamic/type-only import()', () => {
  const content = [
    "const sdk = require('@botpress/sdk')",
    "type Tool = import('@botpress/runtime').Autonomous.Tool",
  ].join('\n')
  const violations = findBannedImports('some.ts', content)
  assert.equal(violations.length, 2)
})

test('findBannedImports flags a package.json dependency entry', () => {
  const pkgJson = JSON.stringify({ dependencies: { '@botpress/client': '1.46.0' } }, null, 2)
  const violations = findBannedImports('package.json', pkgJson)
  assert.equal(violations.length, 1)
})

test('findBannedImports does not flag provenance prose or unscoped plugin-marketplace names', () => {
  const content = [
    '// Full fork of `@botpress/cli` (MIT), rebranded and repointed at our cloudapi.',
    'See CHANGELOG.md: fork of @botpress/adk closure.',
    'Install it with `npx skills add botpress/skills --skill adk-frontend`.',
    'contact test@botpress.com for support',
  ].join('\n')
  assert.deepEqual(findBannedImports('README.md', content), [])
})

test('findBannedImports does not flag an already-fixed @holocronlab/* import', () => {
  const violations = findBannedImports('some.ts', "import { Table, z } from '@holocronlab/botruntime-runtime'\n")
  assert.deepEqual(violations, [])
})

test('scanDirectories walks nested files across every target dir and reports repo-relative paths', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'botpress-banlist-'))
  try {
    mkdirSync(join(repoRoot, 'templates', 'empty-bot', 'src'), { recursive: true })
    writeFileSync(
      join(repoRoot, 'templates', 'empty-bot', 'src', 'index.ts'),
      "import { Table } from '@botpress/runtime'\n"
    )
    mkdirSync(join(repoRoot, 'skills', 'adk'), { recursive: true })
    writeFileSync(join(repoRoot, 'skills', 'adk', 'SKILL.md'), '```ts\nimport { z } from "@botpress/runtime"\n```\n')
    // node_modules under a target dir must never be walked.
    mkdirSync(join(repoRoot, 'templates', 'empty-bot', 'node_modules', '@botpress', 'runtime'), { recursive: true })
    writeFileSync(
      join(repoRoot, 'templates', 'empty-bot', 'node_modules', '@botpress', 'runtime', 'index.js'),
      "module.exports = require('@botpress/runtime')\n"
    )

    const violations = scanDirectories(['templates', 'skills'], { root: repoRoot })

    assert.deepEqual(
      violations.map((v) => v.file),
      ['skills/adk/SKILL.md', 'templates/empty-bot/src/index.ts']
    )
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})

test('scanDirectories fails loud when a configured target directory is missing', () => {
  const repoRoot = mkdtempSync(join(tmpdir(), 'botpress-banlist-missing-'))
  try {
    assert.throws(() => scanDirectories(['does-not-exist'], { root: repoRoot }), /does not exist/)
  } finally {
    rmSync(repoRoot, { recursive: true, force: true })
  }
})
