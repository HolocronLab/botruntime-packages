#!/usr/bin/env bun
// Recreated build script — upstream shipped a build.ts + scripts/build-chat-bundle.ts
// that were not part of the reconstructed source. This produces the JS half of each
// entry point declared in package.json#exports (types are produced separately by
// `tsc --emitDeclarationOnly`, see the `build:types` script).
import { readFileSync, cpSync, existsSync } from 'node:fs'
import path from 'node:path'

const pkg = JSON.parse(readFileSync(path.join(import.meta.dir, '..', 'package.json'), 'utf-8')) as {
  dependencies?: Record<string, string>
}

// Keep every declared runtime dependency external — this is a first-party-source
// bundle (same-package .ts files are bundled together), not a vendored bundle of
// third-party packages, mirroring upstream's own dist/index.js shape.
const external = Object.keys(pkg.dependencies ?? {})

const entrypoints = [
  'src/index.ts',
  'src/dependencies/index.ts',
  'src/agent0/index.ts',
  'src/commands/bp-cli.ts',
]

// Build-time constants normally injected by esbuild's `define` upstream.
// __RUNTIME_VERSION__ / __BP_CLI_VERSION__ / __OPENCODE_VERSION__ are declared as
// ambient consts in generators/utils.ts, commands/bp-cli.ts, agent0/runtime/process.ts.
const define: Record<string, string> = {
  __RUNTIME_VERSION__: JSON.stringify(pkg.dependencies?.['@holocronlab/botruntime-runtime']?.replace(/^[\^~]/, '') ?? '2.0.2'),
  __BP_CLI_VERSION__: JSON.stringify(pkg.dependencies?.['@holocronlab/brt']?.replace(/^[\^~]/, '') ?? '0.2.0'),
  __OPENCODE_VERSION__: JSON.stringify(pkg.dependencies?.['opencode-ai'] ?? '1.15.10'),
}

const result = await Bun.build({
  entrypoints,
  outdir: 'dist',
  root: 'src',
  target: 'node',
  format: 'esm',
  sourcemap: 'external',
  external,
  define,
})

if (!result.success) {
  for (const message of result.logs) {
    console.error(message)
  }
  process.exit(1)
}

for (const output of result.outputs) {
  console.log(`built: ${output.path}`)
}

// Copy static runtime assets (templates/, agent0/capabilities/, assets/) into dist. These
// are .md/.json files the reconstructed .ts source loads from disk at runtime (agent0
// resolves dist/agent0/capabilities/{skills,commands}; the project generator resolves
// dist/templates). The JS build does not emit them; they live in assets-static/ mirroring
// their dist layout and are merged in here.
const assetsRoot = path.join(import.meta.dir, '..', 'assets-static')
if (existsSync(assetsRoot)) {
  cpSync(assetsRoot, path.join(import.meta.dir, '..', 'dist'), { recursive: true })
  console.log('copied static assets (templates, agent0 capabilities, assets) -> dist')
}
