import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import test from 'node:test'

import { resolveInstalledImportExport } from './installed-package-export.mjs'

function withInstalledAdk(exportsDeclaration, run) {
  const consumerDir = mkdtempSync(join(tmpdir(), 'installed-adk-export-'))
  try {
    const packageRoot = join(
      consumerDir,
      'node_modules',
      '@holocronlab',
      'botruntime-adk'
    )
    mkdirSync(join(packageRoot, 'dist', 'commands'), { recursive: true })
    writeFileSync(join(packageRoot, 'dist', 'commands', 'bp-cli.js'), 'export {}\n')
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@holocronlab/botruntime-adk',
        version: '2.9.1',
        type: 'module',
        exports: {
          './internal/bp-cli': exportsDeclaration,
          './package.json': './package.json',
        },
      })
    )
    writeFileSync(join(consumerDir, 'package.json'), '{}')
    run({
      consumerRequire: createRequire(join(consumerDir, 'package.json')),
      packageRoot,
    })
  } finally {
    rmSync(consumerDir, { recursive: true, force: true })
  }
}

test('resolves an ESM-only package export without a require condition', () => {
  withInstalledAdk(
    {
      types: './dist/commands/bp-cli.d.ts',
      import: './dist/commands/bp-cli.js',
    },
    ({ consumerRequire, packageRoot }) => {
      assert.equal(
        resolveInstalledImportExport(
          consumerRequire,
          '@holocronlab/botruntime-adk',
          './internal/bp-cli'
        ),
        realpathSync(join(packageRoot, 'dist', 'commands', 'bp-cli.js'))
      )
    }
  )
})

test('rejects an import target outside the installed package', () => {
  withInstalledAdk('../outside.js', ({ consumerRequire }) => {
    assert.throws(
      () =>
        resolveInstalledImportExport(
          consumerRequire,
          '@holocronlab/botruntime-adk',
          './internal/bp-cli'
        ),
      /relative import target/
    )
  })
})

test('rejects an export with no import target', () => {
  withInstalledAdk(
    { types: './dist/commands/bp-cli.d.ts' },
    ({ consumerRequire }) => {
      assert.throws(
        () =>
          resolveInstalledImportExport(
            consumerRequire,
            '@holocronlab/botruntime-adk',
            './internal/bp-cli'
          ),
        /does not declare a relative import target/
      )
    }
  )
})
