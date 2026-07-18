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
  // ВЕСЬ assets-static ADK: стартеры (то, что brt init --type bot копирует
  // пользователю), agent0-скиллы И генераторные шаблоны инструкций
  // (assistant-instructions → CLAUDE.md/AGENTS.md генерируемого бота) — любой
  // из этих путей доезжает до каждого нового проекта.
  'packages/botruntime-adk/assets-static',
  // Source-шаблон инструкций генератора: пишется в CLAUDE.md/AGENTS.md каждого
  // нового проекта, живёт вне assets-static.
  'packages/botruntime-adk/src/agent-init',
]

const SCANNABLE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.md', '.mdx', '.json', '.html', '.yml', '.yaml', '.txt', '.css'])
const EXCLUDED_DIR_NAMES = new Set(['node_modules', 'dist', '.git'])

// Matches an actual module specifier, not prose: `from '@botpress/x'`,
// `require('@botpress/x')`, or a (possibly type-only) dynamic
// `import('@botpress/x')`. Deliberately does NOT match a bare "@botpress/x"
// mention (README/CHANGELOG provenance) or a scope-less reference like
// "botpress/skills" (a plugin-marketplace name, not an npm import).
// \s+ после ключевых слов покрывает и перенос строки (multiline import), а
// `import '...'` — side-effect форму без from; require допускает пробел до скобки.
// После stripComments прозы в кодовых файлах не остаётся (она живёт в
// комментариях), а .md сканится только по fenced-код-блокам — поэтому паттерны
// просты и не пере-статментны: кавычки и ; исключены из «окна», матч не может
// перепрыгнуть чужой спецификатор или соседний statement.
const SPEC = String.raw`['"\x60]@botpress\/[^'"\x60]+['"\x60]`
const IMPORT_PATTERN = new RegExp(
  String.raw`\b(?:import|export)\b[\s\w$\{\},*]*?\bfrom\s*${SPEC}` +
  String.raw`|\b(?:require|import)\s*\(\s*${SPEC}` +
  String.raw`|\bimport\s*${SPEC}`
)

// stripComments: закомментированный импорт — не живая зависимость; заодно
// исчезает проза в комментариях, которая иначе давала бы ложные срабатывания
// («This import was migrated from '@botpress/x'»). Наивно (не учитывает
// кавычки) — для гейта приемлемо.
export function stripComments(code) {
  return code
    .replace(/\/\*[^]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length))
}

// extractFencedCode: в Markdown сканируются ТОЛЬКО fenced-код-блоки — прочий
// текст это документация (provenance-проза легитимна). Позиции строк
// сохраняются заменой не-кодовых строк пустыми.
export function extractFencedCode(markdown) {
  const lines = markdown.split('\n')
  let inFence = false
  const out = lines.map((line) => {
    if (/^\s*(?:\x60{3,}|~{3,})/.test(line)) {
      inFence = !inFence
      return ''
    }
    return inFence ? line : ''
  })
  return out.join('\n')
}

// package.json dependency/devDependency/peerDependency key, e.g.
// `"@botpress/sdk": "1.0.0"`.
// Ключ ИЛИ npm-алиас в значении: "runtime": "npm:@botpress/runtime@1.0.0"
// ставит запрещённый пакет под легальным именем.
const JSON_DEP_PATTERN = /"@botpress\/[^"]+"\s*:|"npm:@botpress\/[^"]+"/

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
  const ext = extname(absoluteFilePath)
  const isJson = ext === '.json'
  const pattern = isJson ? JSON_DEP_PATTERN : IMPORT_PATTERN
  if (ext === '.md' || ext === '.mdx') {
    content = extractFencedCode(content)
  } else if (!isJson) {
    content = stripComments(content)
  }
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
