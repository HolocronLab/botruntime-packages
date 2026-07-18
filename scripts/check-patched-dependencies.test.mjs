import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import test from 'node:test'

import { checkPatchedDependencies, findPackageJsonDirs, parseBunLock, resolvedVersionSpecs } from './check-patched-dependencies.mjs'

function makeTempPackage({ packageJson, bunLock, patchFiles = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'patch-gate-'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify(packageJson, null, 2))
  if (bunLock !== undefined) writeFileSync(join(dir, 'bun.lock'), bunLock)
  for (const relPath of patchFiles) {
    const absPath = join(dir, relPath)
    mkdirSync(dirname(absPath), { recursive: true })
    writeFileSync(absPath, '--- fake patch ---\n')
  }
  return dir
}

test('parseBunLock tolerates bun.lock trailing commas that break strict JSON.parse', () => {
  const text = '{\n  "a": 1,\n  "b": [1, 2,],\n}\n'
  assert.deepEqual(parseBunLock(text), { a: 1, b: [1, 2] })
})

test('resolvedVersionSpecs collects every name@version bun.lock resolved', () => {
  const bunLock = { packages: { 'source-map-js': ['source-map-js@1.2.1', '', {}, 'sha512-x'] } }
  assert.deepEqual(resolvedVersionSpecs(bunLock), new Set(['source-map-js@1.2.1']))
})

test('resolvedVersionSpecs rejects a malformed packages field instead of silently returning nothing', () => {
  assert.throws(() => resolvedVersionSpecs({ packages: null }), /must be an object/)
})

test('a package.json with no patchedDependencies field is a clean no-op', () => {
  const dir = makeTempPackage({ packageJson: { name: 'no-patches' } })
  try {
    assert.deepEqual(checkPatchedDependencies(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('flags a patch file that patchedDependencies references but does not exist', () => {
  const dir = makeTempPackage({
    packageJson: {
      name: 'missing-patch-file',
      patchedDependencies: { 'source-map-js@1.2.1': 'patches/source-map-js@1.2.1.patch' },
    },
    bunLock: JSON.stringify({
      patchedDependencies: { 'source-map-js@1.2.1': 'patches/source-map-js@1.2.1.patch' },
      packages: { 'source-map-js': ['source-map-js@1.2.1', '', {}, 'sha512-x'] },
    }),
    // patch file intentionally not written
  })
  try {
    const violations = checkPatchedDependencies(dir)
    assert.equal(violations.length, 1)
    assert.match(violations[0], /missing file/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('flags package.json/bun.lock disagreeing on a patch — the exact "edited but never reinstalled" shape', () => {
  const dir = makeTempPackage({
    packageJson: {
      name: 'stale-lockfile',
      patchedDependencies: { 'source-map-js@1.2.2': 'patches/source-map-js@1.2.2.patch' },
    },
    bunLock: JSON.stringify({
      // lockfile still has the OLD patch entry — package.json moved on without a reinstall
      patchedDependencies: { 'source-map-js@1.2.1': 'patches/source-map-js@1.2.1.patch' },
      packages: { 'source-map-js': ['source-map-js@1.2.2', '', {}, 'sha512-x'] },
    }),
    patchFiles: ['patches/source-map-js@1.2.2.patch'],
  })
  try {
    const violations = checkPatchedDependencies(dir)
    assert.equal(violations.length, 1)
    assert.match(violations[0], /disagree on patch/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('flags a patch pinned to a version bun.lock no longer resolves — the DEVLP-159 llmz precedent shape', () => {
  const dir = makeTempPackage({
    packageJson: {
      name: 'drifted-resolution',
      patchedDependencies: { 'source-map-js@1.2.1': 'patches/source-map-js@1.2.1.patch' },
    },
    bunLock: JSON.stringify({
      patchedDependencies: { 'source-map-js@1.2.1': 'patches/source-map-js@1.2.1.patch' },
      // an unrelated bump moved the resolved version to 1.2.3; the patch key is now orphaned
      packages: { 'source-map-js': ['source-map-js@1.2.3', '', {}, 'sha512-x'] },
    }),
    patchFiles: ['patches/source-map-js@1.2.1.patch'],
  })
  try {
    const violations = checkPatchedDependencies(dir)
    assert.equal(violations.length, 1)
    assert.match(violations[0], /does not match any resolved dependency/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a coherent patch (file present, lockfile agrees, version resolved) passes clean', () => {
  const dir = makeTempPackage({
    packageJson: {
      name: 'coherent',
      patchedDependencies: { 'node-fetch@2.7.0': 'patches/node-fetch@2.7.0.patch' },
    },
    bunLock: JSON.stringify({
      patchedDependencies: { 'node-fetch@2.7.0': 'patches/node-fetch@2.7.0.patch' },
      packages: { 'node-fetch': ['node-fetch@2.7.0', '', {}, 'sha512-x'] },
    }),
    patchFiles: ['patches/node-fetch@2.7.0.patch'],
  })
  try {
    assert.deepEqual(checkPatchedDependencies(dir), [])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('flags a missing/unparsable bun.lock instead of silently skipping the lockfile checks', () => {
  const dir = makeTempPackage({
    packageJson: {
      name: 'no-lockfile',
      patchedDependencies: { 'source-map-js@1.2.1': 'patches/source-map-js@1.2.1.patch' },
    },
    patchFiles: ['patches/source-map-js@1.2.1.patch'],
    // bun.lock intentionally omitted
  })
  try {
    const violations = checkPatchedDependencies(dir)
    assert.equal(violations.length, 1)
    assert.match(violations[0], /bun\.lock is missing or unparsable/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('findPackageJsonDirs discovers the real repo packages and integrations with a package.json', () => {
  const root = new URL('..', import.meta.url).pathname
  const dirs = findPackageJsonDirs(root)
  const names = dirs.map((dir) => dir.split('/').slice(-2).join('/'))
  assert.ok(names.includes('packages/botruntime-llmz'))
  assert.ok(names.includes('integrations/telegram'))
})

test('the real repo has zero patched-dependency violations right now (regression guard)', () => {
  const root = new URL('..', import.meta.url).pathname
  const violations = findPackageJsonDirs(root).flatMap((dir) => checkPatchedDependencies(dir))
  assert.deepEqual(violations, [])
})
