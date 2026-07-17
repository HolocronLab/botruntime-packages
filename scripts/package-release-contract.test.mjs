import assert from 'node:assert/strict'
import test from 'node:test'

import {
  registrySpecForLocalDependency,
  validateInstalledReleaseTrain,
} from './package-release-contract.mjs'

test('published Holocron runtime dependencies are pinned to their exact sibling version', () => {
  assert.equal(
    registrySpecForLocalDependency({
      field: 'dependencies',
      dependencyName: '@holocronlab/botruntime-evals',
      siblingVersion: '2.1.9',
    }),
    '2.1.9'
  )
})

test('third-party and peer dependencies retain compatible ranges', () => {
  assert.equal(
    registrySpecForLocalDependency({
      field: 'dependencies',
      dependencyName: 'example-library',
      siblingVersion: '3.4.5',
    }),
    '^3.4.5'
  )
  assert.equal(
    registrySpecForLocalDependency({
      field: 'peerDependencies',
      dependencyName: '@holocronlab/example-plugin-api',
      siblingVersion: '6.7.8',
    }),
    '^6.7.8'
  )
})

test('installed release train rejects a nested package from another train', () => {
  const expectedVersions = new Map([
    ['@holocronlab/brt', '0.6.27'],
    ['@holocronlab/botruntime-adk', '2.1.19'],
    ['@holocronlab/botruntime-runtime', '2.1.19'],
    ['@holocronlab/botruntime-evals', '2.1.9'],
  ])
  const tree = {
    name: 'release-smoke',
    dependencies: {
      '@holocronlab/brt': {
        version: '0.6.27',
        dependencies: {
          '@holocronlab/botruntime-adk': {
            version: '2.1.19',
            dependencies: {
              '@holocronlab/botruntime-runtime': {
                version: '2.1.19',
                dependencies: {
                  '@holocronlab/botruntime-evals': { version: '2.1.8' },
                },
              },
            },
          },
        },
      },
    },
  }

  assert.throws(
    () =>
      validateInstalledReleaseTrain(tree, expectedVersions, {
        requiredPackages: [...expectedVersions.keys()],
      }),
    /botruntime-runtime.*botruntime-evals: expected 2\.1\.9, installed 2\.1\.8/
  )
})

test('installed release train requires every runtime-critical package', () => {
  const expectedVersions = new Map([
    ['@holocronlab/brt', '0.6.27'],
    ['@holocronlab/botruntime-runtime', '2.1.19'],
  ])

  assert.throws(
    () =>
      validateInstalledReleaseTrain(
        {
          name: 'release-smoke',
          dependencies: { '@holocronlab/brt': { version: '0.6.27' } },
        },
        expectedVersions,
        { requiredPackages: [...expectedVersions.keys()] }
      ),
    /missing required package.*botruntime-runtime/
  )
})

test('installed release train accepts one coherent resolved graph', () => {
  const expectedVersions = new Map([
    ['@holocronlab/brt', '0.6.27'],
    ['@holocronlab/botruntime-runtime', '2.1.19'],
    ['@holocronlab/botruntime-evals', '2.1.9'],
  ])
  const tree = {
    dependencies: {
      '@holocronlab/brt': {
        version: '0.6.27',
        dependencies: {
          '@holocronlab/botruntime-runtime': {
            version: '2.1.19',
            dependencies: {
              '@holocronlab/botruntime-evals': { version: '2.1.9' },
            },
          },
        },
      },
    },
  }

  assert.deepEqual(
    validateInstalledReleaseTrain(tree, expectedVersions, {
      requiredPackages: [...expectedVersions.keys()],
    }),
    { checkedOccurrences: 3, packages: 3 }
  )
})
