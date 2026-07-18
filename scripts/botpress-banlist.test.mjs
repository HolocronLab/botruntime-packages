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

test('.md сканится только по fenced-блокам; комментарии в коде не считаются', () => {
  assert.equal(findBannedImports('a.md', "Migrate from '@botpress/runtime' to the fork").length, 0)
  assert.equal(findBannedImports('a.md', 'x\n```ts\nimport { z } from \'@botpress/sdk\'\n```').length, 1)
  assert.equal(findBannedImports('a.ts', "// import { x } from '@botpress/sdk'").length, 0)
})

test('side-effect импорт, require с пробелом и multiline-форма тоже ловятся', () => {
  const content = [
    "import '@botpress/runtime'",
    "const sdk = require ('@botpress/sdk')",
    'import { z } from',
    "  '@botpress/client'",
  ].join('\n')
  const violations = findBannedImports('some.ts', content)
  assert.equal(violations.length, 3)
  assert.equal(violations[2].line, 3)
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

test('template-literal динамический импорт и .mts/.cts тоже под гейтом', () => {
  const violations = findBannedImports('x.mts', 'const m = await import(`@botpress/runtime`)')
  assert.equal(violations.length, 1)
})

test('комментарий внутри импорта и npm-алиас в манифесте ловятся', () => {
  assert.equal(findBannedImports('a.ts', "import(/* webpackIgnore: true */ '@botpress/runtime')").length, 1)
  assert.equal(findBannedImports('a.json', '{"runtime": "npm:@botpress/runtime@1.0.0"}').length, 1)
})

test('проза с from не краснит, а line-comment в разрыве импорта ловится', () => {
  assert.equal(findBannedImports('a.md', "Migrate from '@botpress/runtime' to the fork").length, 0)
  assert.equal(findBannedImports('a.ts', "export { y } from '@botpress/sdk'").length, 1)
  assert.equal(findBannedImports('a.ts', "const m = await import( // lazy\n  '@botpress/runtime')").length, 1)
})

test('inline-код в md, dep-литерал в коде и четырёх-бэктичный fence ловятся', () => {
  assert.equal(findBannedImports('a.md', "Use `import { z } from '@botpress/runtime'` here").length, 1)
  assert.equal(findBannedImports('g.ts', "const deps = { '@botpress/sdk': version }").length, 1)
  const nested = '````md\nexample:\n```ts\nimport { z } from \'@botpress/x\'\n```\n````'
  assert.equal(findBannedImports('a.md', nested).length, 1)
})
