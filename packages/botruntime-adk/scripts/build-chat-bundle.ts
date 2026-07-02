#!/usr/bin/env bun
// Recreated build step — upstream shipped scripts/build-chat-bundle.ts, which was
// not part of the reconstructed source. Produces dist/chat-bundle.cjs: a
// self-contained CJS bundle of @holocronlab/botruntime-chat (with axios and its
// other dependencies inlined) that src/utils/require-chat.ts statically imports.
// See that file's header comment for why this indirection exists (bun-compile
// binary interop with @holocronlab/botruntime-chat's dual CJS/ESM axios adapters).
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const chatCjsEntry = require.resolve('@holocronlab/botruntime-chat')

const result = await Bun.build({
  entrypoints: [chatCjsEntry],
  outdir: 'dist',
  naming: 'chat-bundle.cjs',
  target: 'node',
  format: 'cjs',
  // Inline everything (axios, etc.) — this must be a single self-contained file,
  // not a package.json-driven module graph, since it gets statically inlined into
  // a bun-compiled binary that has no node_modules at runtime.
  external: [],
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
