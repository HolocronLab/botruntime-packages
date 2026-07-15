import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { test } from 'node:test'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const runtimeRoot = resolve('packages/botruntime-runtime')
const runtimeRequire = createRequire(pathToFileURL(join(runtimeRoot, 'package.json')))
const { build } = runtimeRequire('esbuild')

test('runtime telemetry bundle loads in supported Node ESM', async () => {
  const outputDir = await mkdtemp(join(runtimeRoot, '.node-esm-test-'))
  const outfile = join(outputDir, 'telemetry-utils.js')

  try {
    await build({
      bundle: true,
      entryPoints: [join(runtimeRoot, 'src/telemetry/utils.ts')],
      format: 'esm',
      outfile,
      packages: 'external',
      platform: 'node',
      target: 'node22',
    })
    await import(pathToFileURL(outfile).href)
  } finally {
    await rm(outputDir, { force: true, recursive: true })
  }
})
