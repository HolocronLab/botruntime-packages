// rollup-plugin-dts bundles src/operations/*.ts's `declare module '@holocronlab/botruntime-zai' {
// interface Zai { ... } }` cross-file augmentation blocks into dist/index.d.ts verbatim, still
// wrapped in `declare module '<own package name>' { ... }`.
//
// That wrapper only merges with `declare class Zai` when TypeScript can resolve the module
// specifier '@holocronlab/botruntime-zai' back to *this exact file* - which requires "self
// reference" support (moduleResolution: bundler/node16/nodenext + a matching "exports" map).
// This repo's packages standardize on moduleResolution: "node" (classic), which does not
// implement self-referencing packages, so downstream consumers would see `zai.extract` (etc.)
// as missing on `Zai`.
//
// Since rollup-plugin-dts already bundled everything into a single file, we don't need
// cross-module resolution at all: stripping the `declare module '...' { }` wrapper leaves the
// `interface Zai { ... }` blocks at the file's top level, right alongside `declare class Zai`,
// where TypeScript merges class + interface declarations lexically (same file, same scope) -
// this works under every moduleResolution mode because it never needs to resolve the package's
// own name as a module specifier.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distPath = path.join(__dirname, '../dist/index.d.ts')
const pkg = JSON.parse(readFileSync(path.join(__dirname, '../package.json'), 'utf8'))

const wrapperOpen = `declare module '${pkg.name}' {`

const src = readFileSync(distPath, 'utf8')
const lines = src.split('\n')
const out = []
let removed = 0

for (let i = 0; i < lines.length; i++) {
  const line = lines[i]
  if (line !== wrapperOpen) {
    out.push(line)
    continue
  }

  // Find the matching closing brace for this wrapper by brace-depth counting,
  // starting right after the wrapper's own opening `{`.
  let depth = 1
  let j = i + 1
  for (; j < lines.length && depth > 0; j++) {
    const l = lines[j]
    for (const ch of l) {
      if (ch === '{') depth++
      else if (ch === '}') depth--
      if (depth === 0) break
    }
  }
  const closeIdx = j - 1
  if (depth !== 0 || lines[closeIdx].trim() !== '}') {
    throw new Error(`Could not find matching closing brace for wrapper at line ${i + 1}`)
  }

  // Emit the wrapper's inner content (excluding the opening/closing wrapper lines themselves).
  out.push(...lines.slice(i + 1, closeIdx))
  removed++
  i = closeIdx
}

if (removed === 0) {
  throw new Error(`No '${wrapperOpen}' wrapper blocks found - is the augmentation pattern still in use?`)
}

writeFileSync(distPath, out.join('\n'))
console.info(`Flattened ${removed} '${pkg.name}' self-augmentation block(s) in dist/index.d.ts`)
