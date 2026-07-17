import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

import { findReleaseVersionClosureViolations } from './release-version-closure.mjs'

const packageGraph = ({ cognitiveVersion = '1.0.0', runtimeVersion = '1.0.0' } = {}) => [
  { name: '@example/client', version: '2.0.0', localDependencies: [] },
  {
    name: '@example/cognitive',
    version: cognitiveVersion,
    localDependencies: ['@example/client'],
  },
  {
    name: '@example/runtime',
    version: runtimeVersion,
    localDependencies: ['@example/cognitive'],
  },
]

const baseVersions = new Map([
  ['@example/client', '1.0.0'],
  ['@example/cognitive', '1.0.0'],
  ['@example/runtime', '1.0.0'],
])

test('requires every direct reverse dependency of a bumped package to bump', () => {
  assert.deepEqual(findReleaseVersionClosureViolations(packageGraph(), baseVersions), [
    {
      dependency: '@example/client',
      dependencyVersion: '2.0.0',
      consumer: '@example/cognitive',
      consumerVersion: '1.0.0',
    },
  ])
})

test('walks the reverse dependency closure through newly bumped consumers', () => {
  assert.deepEqual(
    findReleaseVersionClosureViolations(packageGraph({ cognitiveVersion: '1.0.1' }), baseVersions),
    [
      {
        dependency: '@example/cognitive',
        dependencyVersion: '1.0.1',
        consumer: '@example/runtime',
        consumerVersion: '1.0.0',
      },
    ]
  )

  assert.deepEqual(
    findReleaseVersionClosureViolations(
      packageGraph({ cognitiveVersion: '1.0.1', runtimeVersion: '1.0.1' }),
      baseVersions
    ),
    []
  )
})

test('fails closed when the requested base commit is unavailable', () => {
  const result = spawnSync(
    process.execPath,
    ['scripts/release-version-closure.mjs', '--base=definitely-not-a-real-ref'],
    { cwd: new URL('../', import.meta.url), encoding: 'utf8' }
  )

  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /base commit is unavailable/)
})
