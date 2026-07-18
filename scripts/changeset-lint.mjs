#!/usr/bin/env node
// CI gate for DEVLP-174: "no CHANGELOG anywhere, so an updated brt/ADK ships with
// no record of what changed or what could break." A PR that touches a published
// package's source without a .changeset/*.md entry merges silently — the same
// silent-degradation failure mode this repo already fails loud on elsewhere
// (release-version-closure.mjs). Fail loud here too, before merge.
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { readPublicPackages } from './changeset-packages.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Path filter (not a --empty bypass): tests, generated/vendored output, and the
// changelog/readme files themselves are not release-relevant, so touching only
// those never demands a changeset. Any other src change under a published
// package's directory does — including "just a refactor", per CLAUDE.md TDD/
// review discipline: a silent behavior-neutral change is still worth one line.
const IGNORED_PATH_PATTERN = /(\.test\.|\.spec\.|\/__tests__\/|\/(dist|node_modules)\/|\/CHANGELOG\.md$|\/README\.md$)/

export function isReleaseRelevantPath(path, packageDir) {
  const prefix = `packages/${packageDir}/`
  if (!path.startsWith(prefix)) return false
  return !IGNORED_PATH_PATTERN.test(path)
}

export function findMissingChangesets({ changedPaths, publicPackages, declaredPackageNames }) {
  const touched = publicPackages.filter((pkg) => changedPaths.some((path) => isReleaseRelevantPath(path, pkg.dir)))
  return touched
    .map((pkg) => pkg.name)
    .filter((name) => !declaredPackageNames.has(name))
    .sort()
}

const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---/
const FRONTMATTER_LINE = /^"([^"]+)":\s*(?:patch|minor|major)\s*$/gm

export function parseDeclaredPackages(changesetContents) {
  const declared = new Set()
  for (const content of changesetContents) {
    const frontmatter = FRONTMATTER_BLOCK.exec(content)?.[1] ?? ''
    for (const match of frontmatter.matchAll(FRONTMATTER_LINE)) {
      declared.add(match[1])
    }
  }
  return declared
}

function readChangesetContents(changesetRoot) {
  const changesetDir = resolve(changesetRoot, '.changeset')
  if (!existsSync(changesetDir)) return []
  return readdirSync(changesetDir)
    .filter((name) => name.endsWith('.md') && name !== 'README.md')
    .map((name) => readFileSync(resolve(changesetDir, name), 'utf8'))
}

function readChangedPaths(base) {
  const output = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], { cwd: root, encoding: 'utf8' })
  return output.split('\n').filter(Boolean)
}

function assertBaseCommit(base) {
  try {
    execFileSync('git', ['cat-file', '-e', `${base}^{commit}`], { cwd: root, stdio: 'ignore' })
  } catch {
    throw new Error(`base commit is unavailable: ${base}`)
  }
}

async function main() {
  const base = process.argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length)
  if (!base) throw new Error('usage: changeset-lint.mjs --base=<git-sha>')

  assertBaseCommit(base)
  const changedPaths = readChangedPaths(base)
  const publicPackages = readPublicPackages(root)
  const declaredPackageNames = parseDeclaredPackages(readChangesetContents(root))

  const missing = findMissingChangesets({ changedPaths, publicPackages, declaredPackageNames })
  if (missing.length > 0) {
    const details = missing.map((name) => `  - ${name}`).join('\n')
    throw new Error(
      `missing .changeset entry for published package(s) with source changes:\n${details}\n\n` +
        'Add a file to .changeset/ describing the change (see .changeset/README.md), e.g.:\n\n' +
        `  ---\n  "${missing[0]}": patch\n  ---\n\n  Describe the change and why it matters to consumers.\n`
    )
  }

  process.stdout.write(`changeset gate: ${publicPackages.length} published package(s) checked, none missing an entry\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
