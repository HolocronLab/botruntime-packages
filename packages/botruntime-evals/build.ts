/**
 * Build script for @holocronlab/botruntime-evals.
 *
 * Bundles every public entry point (mirroring package.json's "exports" map)
 * independently with Bun's bundler, matching upstream's own multi-entry
 * esbuild-based build (each output file is self-contained; local relative
 * imports are inlined, and the botruntime-* siblings + node/bun builtins stay
 * external so consumers resolve a single shared copy of each).
 */
import { rm } from 'node:fs/promises'

const ENTRY_POINTS = [
  'src/index.ts',
  'src/client.ts',
  'src/definition.ts',
  'src/graders/index.ts',
  'src/graders/llm.ts',
  'src/graders/match.ts',
  'src/graders/outcome.ts',
  'src/graders/response.ts',
  'src/graders/state.ts',
  'src/graders/timing.ts',
  'src/graders/tools.ts',
  'src/graders/workflow.ts',
  'src/loader.ts',
  'src/manifest.ts',
  'src/runner.ts',
  'src/spans/index.ts',
  'src/spans/sse-collector.ts',
  'src/spans/trace.ts',
  'src/stores/index.ts',
  'src/stores/vortex-eval-store-entry.ts',
  'src/transformer.ts',
  'src/types.ts',
]

const EXTERNAL = [
  '@holocronlab/botruntime-chat',
  '@holocronlab/botruntime-client',
  '@holocronlab/botruntime-cognitive',
  '@holocronlab/botruntime-zai',
  'bun:sqlite',
  'fs',
  'path',
  'crypto',
]

async function main() {
  await rm('dist', { recursive: true, force: true })

  const result = await Bun.build({
    entrypoints: ENTRY_POINTS,
    outdir: 'dist',
    root: 'src',
    target: 'bun',
    format: 'esm',
    splitting: false,
    external: EXTERNAL,
    sourcemap: 'linked',
  })

  if (!result.success) {
    for (const message of result.logs) {
      console.error(message)
    }
    throw new Error('Build failed')
  }

  console.log(`Built ${result.outputs.length} output file(s) into dist/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
