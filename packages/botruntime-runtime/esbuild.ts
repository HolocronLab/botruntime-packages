/**
 * Build script for @holocronlab/botruntime-runtime.
 *
 * Upstream's own package.json build script is `tsc && bun esbuild.ts`, but the
 * `esbuild.ts` file itself was never published to npm (only `dist/` is). This
 * recreates it: each of the package's public entry points (matching
 * package.json's "exports" map 1:1) is bundled independently into its own
 * self-contained ESM output file. Local relative imports are inlined; the
 * repointed botruntime-* sibling forks and third-party runtime dependencies
 * stay external so consumers resolve a single shared copy of each.
 *
 * `tsc -p tsconfig.build.json` (run separately, see package.json's "build"
 * script) emits the accompanying per-file .d.ts declarations for the whole
 * `src` tree, mirroring upstream's shipped dist layout.
 */
import esbuild from 'esbuild'
import { rm } from 'node:fs/promises'

import { dependencies, peerDependencies } from './package.json'

const ENTRY_POINTS = ['library', 'runtime', 'definition', 'internal', 'ui']

const external = [...Object.keys(dependencies), ...Object.keys(peerDependencies), 'worker_threads', 'node:*']

async function main() {
  await rm('dist', { recursive: true, force: true })

  for (const entry of ENTRY_POINTS) {
    await esbuild.build({
      bundle: true,
      minify: false,
      sourcemap: true,
      platform: 'node',
      format: 'esm',
      target: 'node22',
      external,
      entryPoints: [`src/${entry}.ts`],
      outfile: `dist/${entry}.js`,
      allowOverwrite: true,
    })
  }

  console.log(`Built ${ENTRY_POINTS.length} entry point(s) into dist/`)
}

void main()
  .then(() => {
    console.info('Done')
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
