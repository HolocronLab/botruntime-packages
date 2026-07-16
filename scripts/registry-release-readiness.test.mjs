import assert from 'node:assert/strict'
import test from 'node:test'

import { registryDependencySpecs, waitForRegistryDependencies } from './registry-release-readiness.mjs'

test('projects scoped registry dependencies after local links are rewritten', () => {
  assert.deepEqual(
    registryDependencySpecs({
      dependencies: {
        '@holocronlab/botruntime-adk': '^2.1.17',
        '@holocronlab/botruntime-evals': '^2.1.5',
        chalk: '^4.1.2',
      },
    }),
    ['@holocronlab/botruntime-adk@^2.1.17', '@holocronlab/botruntime-evals@^2.1.5']
  )
})

test('rejects an unreplaced local dependency before registry polling', () => {
  assert.throws(
    () =>
      registryDependencySpecs({
        dependencies: { '@holocronlab/botruntime-adk': 'file:../botruntime-adk' },
      }),
    /local dependency/i
  )
})

test('waits until every dependency is anonymously visible', async () => {
  const checks = []
  const delays = []
  const attempts = new Map()

  const result = await waitForRegistryDependencies({
    specs: ['@holocronlab/a@^1.0.0', '@holocronlab/b@^2.0.0'],
    attempts: 3,
    delayMs: 25,
    isAvailable: async (spec) => {
      checks.push(spec)
      const count = (attempts.get(spec) ?? 0) + 1
      attempts.set(spec, count)
      return spec.endsWith('a@^1.0.0') || count >= 2
    },
    sleep: async (delayMs) => delays.push(delayMs),
  })

  assert.deepEqual(result, { attemptsUsed: 2 })
  assert.deepEqual(checks, [
    '@holocronlab/a@^1.0.0',
    '@holocronlab/b@^2.0.0',
    '@holocronlab/a@^1.0.0',
    '@holocronlab/b@^2.0.0',
  ])
  assert.deepEqual(delays, [25])
})

test('fails after the bounded wait with the missing specs', async () => {
  await assert.rejects(
    waitForRegistryDependencies({
      specs: ['@holocronlab/missing@^3.0.0'],
      attempts: 2,
      delayMs: 1,
      isAvailable: async () => false,
      sleep: async () => {},
    }),
    /@holocronlab\/missing@\^3\.0\.0/
  )
})
