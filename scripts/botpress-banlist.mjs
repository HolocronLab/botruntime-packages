#!/usr/bin/env node
// DEVLP-175: packages/brt/templates/ scaffolds real projects for external
// developers (`brt init`), and the vendored ADK skill docs under
// botruntime-adk/assets-static teach coding agents how to write bot code —
// both are copy-paste sources. An `@botpress/*` import surviving in either
// silently hands a copier code that only resolves against the real Botpress
// packages this fork explicitly forbids depending on (CLAUDE.md: "@botpress/*
// запрещены, даже транзитивно"). Fail loud on the IMPORT syntax specifically —
// a comment/README/CHANGELOG saying "fork of @botpress/x" (there are dozens,
// legitimately, across this repo) is provenance, not a live dependency, and
// must not trip this gate.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Only scan copy-paste surfaces, not the whole repo: packages/botruntime-api's
// build-time @botpress/api pin (ADR-0005) and the many "fork of @botpress/x"
// provenance comments elsewhere are deliberate and out of this gate's scope.
export const DEFAULT_TARGET_DIRS = [
  'packages/brt/templates',
  // Стартеры ADK — то, что brt init --type bot реально копирует пользователю
  // (AgentProjectGenerator): без них гейт пропускал бы запрещённый импорт в
  // каждый новый сгенерированный проект.
  'packages/botruntime-adk/assets-static/templates',
  'packages/botruntime-adk/assets-static/agent0/capabilities/skills',
]

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.md', '.mdx', '.json'])
const EXCLUDED_DIR_NAMES = new Set(['node_modules', 'dist', '.git'])

// Matches an actual module specifier, not prose: `from '@botpress/x'`,
// `require('@botpress/x')`, or a (possibly type-only) dynamic
// `import('@botpress/x')`. Deliberately does NOT match a bare "@botpress/x"
// mention (README/CHANGELOG provenance) or a scope-less reference like
// "botpress/skills" (a plugin-marketplace name, not an npm import).
// \s+ после ключевых слов покрывает и перенос строки (multiline import), а
// `import '...'` — side-effect форму без from; require допускает пробел до скобки.
const IMPORT_PATTERN = /\b(?:from\s+|require\s*\(\s*|import\s*\(\s*|import\s+)['"]@botpress\/[^'"]+['"]/

// package.json dependency/devDependency/peerDependency key, e.g.
// `"@botpress/sdk": "1.0.0"`.
const JSON_DEP_PATTERN = /"@botpress\/[^"]+"\s*:/

function listFilesRecursively(startDir) {
  const out = []
  const stack = [startDir]
  while (stack.length > 0) {
    const dir = stack.pop()
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        stack.push(path)
      } else if (entry.isFile()) {
        out.push(path)
      }
    }
  }
  return out
}

export function findBannedImports(absoluteFilePath, content) {
  const isJson = extname(absoluteFilePath) === '.json'
  const pattern = isJson ? JSON_DEP_PATTERN : IMPORT_PATTERN
  // По ВСЕМУ контенту, не построчно: multiline-форма (`from` в конце строки,
  // спецификатор на следующей) иначе проходила бы чистой. Номер строки — по
  // смещению совпадения.
  const violations = []
  const global = new RegExp(pattern.source, 'g')
  for (const match of content.matchAll(global)) {
    const line = content.slice(0, match.index).split('\n').length
    violations.push({ line, text: match[0].replace(/\s+/g, ' ').trim() })
  }
  return violations
}

export function scanDirectories(targetDirs, { root: repoRoot = root } = {}) {
  const violations = []
  for (const targetDir of targetDirs) {
    const absoluteDir = resolve(repoRoot, targetDir)
    let rootStat
    try {
      rootStat = statSync(absoluteDir)
    } catch {
      throw new Error(`banlist target directory does not exist: ${targetDir}`)
    }
    if (!rootStat.isDirectory()) {
      throw new Error(`banlist target is not a directory: ${targetDir}`)
    }

    for (const filePath of listFilesRecursively(absoluteDir)) {
      if (!SCANNABLE_EXTENSIONS.has(extname(filePath))) continue
      const content = readFileSync(filePath, 'utf8')
      for (const violation of findBannedImports(filePath, content)) {
        violations.push({ file: filePath.slice(repoRoot.length + 1), ...violation })
      }
    }
  }
  return violations.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

function main() {
  const argDirs = process.argv.slice(2)
  const targetDirs = argDirs.length > 0 ? argDirs : DEFAULT_TARGET_DIRS
  const violations = scanDirectories(targetDirs)

  if (violations.length > 0) {
    const details = violations.map((v) => `  - ${v.file}:${v.line}: ${v.text}`).join('\n')
    throw new Error(
      `@botpress/* import found in a copy-paste template/skill surface:\n${details}\n\n` +
        'Replace with the matching @holocronlab/botruntime-* package (see package.json in the ' +
        'affected project, or an already-fixed sibling skill/template for the mapping).\n'
    )
  }

  process.stdout.write(`botpress banlist: ${targetDirs.length} target dir(s) clean, no @botpress/* imports\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
