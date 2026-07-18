import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import {
  bumpVersion,
  buildChangelogSection,
  buildReleasePlan,
  combineBumps,
  computeAutoBumps,
  insertChangelogSection,
  parseChangesetFile,
} from './changeset-version.mjs'

test('parses a single-package changeset', () => {
  const { bumps, summary } = parseChangesetFile('---\n"@holocronlab/brt": patch\n---\n\nFix a thing.\n')
  assert.deepEqual([...bumps], [['@holocronlab/brt', 'patch']])
  assert.equal(summary, 'Fix a thing.')
})

test('parses a multi-package changeset', () => {
  const { bumps } = parseChangesetFile(
    '---\n"@holocronlab/brt": patch\n"@holocronlab/botruntime-adk": minor\n---\n\nText.\n'
  )
  assert.deepEqual(
    [...bumps].sort(),
    [
      ['@holocronlab/botruntime-adk', 'minor'],
      ['@holocronlab/brt', 'patch'],
    ].sort()
  )
})

test('rejects a changeset with no frontmatter', () => {
  assert.throws(() => parseChangesetFile('no frontmatter here'), /missing --- frontmatter/)
})

test('rejects an invalid bump level', () => {
  assert.throws(
    () => parseChangesetFile('---\n"@holocronlab/brt": nonsense\n---\n\nText.\n'),
    /invalid changeset frontmatter line/
  )
})

test('combineBumps takes the highest severity across changesets for the same package', () => {
  const combined = combineBumps([
    new Map([['@holocronlab/brt', 'patch']]),
    new Map([['@holocronlab/brt', 'major']]),
    new Map([['@holocronlab/brt', 'minor']]),
  ])
  assert.equal(combined.get('@holocronlab/brt'), 'major')
})

test('bumpVersion increments the requested component and resets lower ones', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4')
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0')
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0')
})

test('bumpVersion fails closed on a non-plain-semver version', () => {
  assert.throws(() => bumpVersion('1.2.3-beta.1', 'patch'), /cannot bump non-plain-semver version/)
})

test('buildChangelogSection renders a version heading with bullet summaries', () => {
  const section = buildChangelogSection('1.2.4', '2026-07-18', ['Fixed a thing.', 'Also this.'])
  assert.equal(section, '## 1.2.4 (current) — 2026-07-18\n\n- Fixed a thing.\n- Also this.')
})

test('insertChangelogSection prepends above the first existing heading and demotes it', () => {
  const existing = '# @holocronlab/brt\n\nIntro line.\n\n## 1.2.3 (current) — 2026-07-01\n\n- Old entry.\n'
  const updated = insertChangelogSection(existing, '## 1.2.4 (current) — 2026-07-18\n\n- New entry.')
  assert.equal(
    updated,
    '# @holocronlab/brt\n\nIntro line.\n\n## 1.2.4 (current) — 2026-07-18\n\n- New entry.\n\n## 1.2.3 — 2026-07-01\n\n- Old entry.\n'
  )
})

test('insertChangelogSection appends when the CHANGELOG has no version heading yet', () => {
  const existing = '# @holocronlab/brt\n\nIntro line.\n'
  const updated = insertChangelogSection(existing, '## 1.0.0 (current) — 2026-07-18\n\n- First entry.')
  assert.equal(updated, '# @holocronlab/brt\n\nIntro line.\n\n## 1.0.0 (current) — 2026-07-18\n\n- First entry.\n')
})

test('computeAutoBumps patch-bumps every transitive consumer along a reverse file:-dependency chain', () => {
  const packages = [
    { name: '@holocronlab/cognitive', localDependencies: [] },
    { name: '@holocronlab/sdk', localDependencies: ['@holocronlab/cognitive'] },
    { name: '@holocronlab/runtime', localDependencies: ['@holocronlab/sdk'] },
    { name: '@holocronlab/adk', localDependencies: ['@holocronlab/runtime'] },
    { name: '@holocronlab/brt', localDependencies: ['@holocronlab/adk'] },
  ]
  const explicitBumps = new Map([['@holocronlab/cognitive', 'patch']])

  const { allBumps, triggeredBy } = computeAutoBumps(explicitBumps, packages)

  assert.equal(allBumps.get('@holocronlab/cognitive'), 'patch')
  assert.equal(allBumps.get('@holocronlab/sdk'), 'patch')
  assert.equal(allBumps.get('@holocronlab/runtime'), 'patch')
  assert.equal(allBumps.get('@holocronlab/adk'), 'patch')
  assert.equal(allBumps.get('@holocronlab/brt'), 'patch')

  assert.deepEqual([...triggeredBy.get('@holocronlab/sdk')], ['@holocronlab/cognitive'])
  assert.deepEqual([...triggeredBy.get('@holocronlab/runtime')], ['@holocronlab/sdk'])
})

test('computeAutoBumps never adds an auto entry for a package with its own explicit changeset', () => {
  const packages = [
    { name: '@holocronlab/cognitive', localDependencies: [] },
    { name: '@holocronlab/sdk', localDependencies: ['@holocronlab/cognitive'] },
  ]
  const explicitBumps = new Map([
    ['@holocronlab/cognitive', 'patch'],
    ['@holocronlab/sdk', 'minor'],
  ])

  const { allBumps, triggeredBy } = computeAutoBumps(explicitBumps, packages)

  assert.equal(allBumps.get('@holocronlab/sdk'), 'minor')
  assert.equal(triggeredBy.has('@holocronlab/sdk'), false)
})

test('buildReleasePlan fails closed before computing anything when a changeset references an unknown package', () => {
  assert.throws(
    () =>
      buildReleasePlan({
        packages: [{ name: '@holocronlab/brt', dir: 'brt', version: '1.0.0', localDependencies: [] }],
        explicitBumps: new Map([['@holocronlab/does-not-exist', 'patch']]),
        summariesByPackage: new Map(),
      }),
    /unknown or non-public package/
  )
})

test('CLI end-to-end: a changeset on a low-level package auto patch-bumps its whole reverse file:-dependency chain, without duplicating an explicitly-declared consumer', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'changeset-version-closure-'))
  try {
    // Real package.json fixtures wired by file: deps (not a hardcoded graph in
    // the test): cognitive <- sdk <- runtime <- adk <- brt, mirroring the shape
    // release-version-closure.mjs enforces at publish time.
    const chain = [
      { dir: 'cognitive', name: '@holocronlab/cognitive', dependsOn: null },
      { dir: 'sdk', name: '@holocronlab/sdk', dependsOn: 'cognitive' },
      { dir: 'runtime', name: '@holocronlab/runtime', dependsOn: 'sdk' },
      { dir: 'adk', name: '@holocronlab/adk', dependsOn: 'runtime' },
      { dir: 'brt', name: '@holocronlab/brt', dependsOn: 'adk' },
    ]
    for (const pkg of chain) {
      const pkgDir = join(tmpRoot, 'packages', pkg.dir)
      mkdirSync(pkgDir, { recursive: true })
      const dependency = chain.find((entry) => entry.dir === pkg.dependsOn)
      const manifest = {
        name: pkg.name,
        version: '1.0.0',
        private: false,
        ...(dependency ? { dependencies: { [dependency.name]: `file:../${dependency.dir}` } } : {}),
      }
      writeFileSync(join(pkgDir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`)
      writeFileSync(join(pkgDir, 'CHANGELOG.md'), `# ${pkg.name}\n\nAnchor entry.\n`)
    }

    const changesetDir = join(tmpRoot, '.changeset')
    mkdirSync(changesetDir, { recursive: true })
    writeFileSync(
      join(changesetDir, 'bump-cognitive.md'),
      '---\n"@holocronlab/cognitive": patch\n---\n\nFixed a cognitive bug.\n'
    )
    // runtime consumes sdk (which auto-bumps) but is ALSO explicitly declared —
    // its own changeset/summary must win, with no auto note appended on top.
    writeFileSync(
      join(changesetDir, 'bump-runtime.md'),
      '---\n"@holocronlab/runtime": minor\n---\n\nAdded a runtime feature.\n'
    )

    const scriptPath = new URL('./changeset-version.mjs', import.meta.url).pathname
    const result = spawnSync(process.execPath, [scriptPath, `--root=${tmpRoot}`], { encoding: 'utf8' })
    assert.equal(result.status, 0, result.stderr)

    const versionOf = (dir) => JSON.parse(readFileSync(join(tmpRoot, 'packages', dir, 'package.json'), 'utf8')).version
    const changelogOf = (dir) => readFileSync(join(tmpRoot, 'packages', dir, 'CHANGELOG.md'), 'utf8')

    assert.equal(versionOf('cognitive'), '1.0.1')
    assert.equal(versionOf('sdk'), '1.0.1')
    assert.equal(versionOf('runtime'), '1.1.0')
    assert.equal(versionOf('adk'), '1.0.1')
    assert.equal(versionOf('brt'), '1.0.1')

    assert.match(changelogOf('sdk'), /Обновлены внутренние зависимости: @holocronlab\/cognitive@1\.0\.1/)
    assert.match(changelogOf('adk'), /Обновлены внутренние зависимости: @holocronlab\/runtime@1\.1\.0/)
    assert.match(changelogOf('brt'), /Обновлены внутренние зависимости: @holocronlab\/adk@1\.0\.1/)

    const runtimeChangelog = changelogOf('runtime')
    assert.match(runtimeChangelog, /Added a runtime feature\./)
    assert.doesNotMatch(runtimeChangelog, /Обновлены внутренние зависимости/)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('CLI fails closed atomically: an unknown package in one changeset leaves an earlier valid entry unwritten', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'changeset-version-atomic-'))
  try {
    const pkgDir = join(tmpRoot, 'packages', 'demo-pkg')
    mkdirSync(pkgDir, { recursive: true })
    const originalManifest = `${JSON.stringify({ name: '@holocronlab/demo-pkg', version: '1.0.0', private: false }, null, 2)}\n`
    writeFileSync(join(pkgDir, 'package.json'), originalManifest)
    const originalChangelog = '# @holocronlab/demo-pkg\n\nAnchor entry.\n'
    writeFileSync(join(pkgDir, 'CHANGELOG.md'), originalChangelog)

    const changesetDir = join(tmpRoot, '.changeset')
    mkdirSync(changesetDir, { recursive: true })
    writeFileSync(join(changesetDir, 'a-valid.md'), '---\n"@holocronlab/demo-pkg": patch\n---\n\nA fix.\n')
    writeFileSync(
      join(changesetDir, 'b-invalid.md'),
      '---\n"@holocronlab/does-not-exist": patch\n---\n\nText.\n'
    )

    const scriptPath = new URL('./changeset-version.mjs', import.meta.url).pathname
    const result = spawnSync(process.execPath, [scriptPath, `--root=${tmpRoot}`], { encoding: 'utf8' })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unknown or non-public package/)
    assert.equal(readFileSync(join(pkgDir, 'package.json'), 'utf8'), originalManifest)
    assert.equal(readFileSync(join(pkgDir, 'CHANGELOG.md'), 'utf8'), originalChangelog)
    assert.equal(readFileSync(join(changesetDir, 'a-valid.md'), 'utf8'), '---\n"@holocronlab/demo-pkg": patch\n---\n\nA fix.\n')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('CLI end-to-end: bumps version, writes CHANGELOG, and consumes the changeset in an isolated temp root', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'changeset-version-'))
  try {
    const pkgDir = join(tmpRoot, 'packages', 'demo-pkg')
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(
      join(pkgDir, 'package.json'),
      `${JSON.stringify({ name: '@holocronlab/demo-pkg', version: '1.0.0', private: false }, null, 2)}\n`
    )
    writeFileSync(join(pkgDir, 'CHANGELOG.md'), '# @holocronlab/demo-pkg\n\nAnchor entry.\n')

    const changesetDir = join(tmpRoot, '.changeset')
    mkdirSync(changesetDir, { recursive: true })
    writeFileSync(
      join(changesetDir, 'demo-change.md'),
      '---\n"@holocronlab/demo-pkg": minor\n---\n\nAdded a demo feature.\n'
    )

    const scriptPath = new URL('./changeset-version.mjs', import.meta.url).pathname
    const result = spawnSync(process.execPath, [scriptPath, `--root=${tmpRoot}`], { encoding: 'utf8' })

    assert.equal(result.status, 0, result.stderr)

    const manifest = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'))
    assert.equal(manifest.version, '1.1.0')

    const changelog = readFileSync(join(pkgDir, 'CHANGELOG.md'), 'utf8')
    assert.match(changelog, /## 1\.1\.0 \(current\)/)
    assert.match(changelog, /Added a demo feature\./)
    assert.match(changelog, /Anchor entry\./)

    assert.throws(() => readFileSync(join(changesetDir, 'demo-change.md')))
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('CLI dry run leaves package.json, CHANGELOG.md, and the changeset file untouched', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'changeset-version-dry-'))
  try {
    const pkgDir = join(tmpRoot, 'packages', 'demo-pkg')
    mkdirSync(pkgDir, { recursive: true })
    const originalManifest = `${JSON.stringify({ name: '@holocronlab/demo-pkg', version: '1.0.0', private: false }, null, 2)}\n`
    writeFileSync(join(pkgDir, 'package.json'), originalManifest)
    const originalChangelog = '# @holocronlab/demo-pkg\n\nAnchor entry.\n'
    writeFileSync(join(pkgDir, 'CHANGELOG.md'), originalChangelog)

    const changesetDir = join(tmpRoot, '.changeset')
    mkdirSync(changesetDir, { recursive: true })
    writeFileSync(
      join(changesetDir, 'demo-change.md'),
      '---\n"@holocronlab/demo-pkg": patch\n---\n\nA fix.\n'
    )

    const scriptPath = new URL('./changeset-version.mjs', import.meta.url).pathname
    const result = spawnSync(process.execPath, [scriptPath, `--root=${tmpRoot}`, '--dry-run'], { encoding: 'utf8' })

    assert.equal(result.status, 0, result.stderr)
    assert.equal(readFileSync(join(pkgDir, 'package.json'), 'utf8'), originalManifest)
    assert.equal(readFileSync(join(pkgDir, 'CHANGELOG.md'), 'utf8'), originalChangelog)
    assert.equal(readFileSync(join(changesetDir, 'demo-change.md'), 'utf8'), '---\n"@holocronlab/demo-pkg": patch\n---\n\nA fix.\n')
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})

test('CLI fails closed when a changeset references an unknown package', () => {
  const tmpRoot = mkdtempSync(join(tmpdir(), 'changeset-version-unknown-'))
  try {
    mkdirSync(join(tmpRoot, 'packages'), { recursive: true })
    const changesetDir = join(tmpRoot, '.changeset')
    mkdirSync(changesetDir, { recursive: true })
    writeFileSync(join(changesetDir, 'demo-change.md'), '---\n"@holocronlab/does-not-exist": patch\n---\n\nText.\n')

    const scriptPath = new URL('./changeset-version.mjs', import.meta.url).pathname
    const result = spawnSync(process.execPath, [scriptPath, `--root=${tmpRoot}`], { encoding: 'utf8' })

    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /unknown or non-public package/)
  } finally {
    rmSync(tmpRoot, { recursive: true, force: true })
  }
})
