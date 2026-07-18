#!/usr/bin/env node
// Consumes accumulated .changeset/*.md entries (DEVLP-174), bumps each referenced
// package's package.json version, and prepends a CHANGELOG.md section. Run by a
// maintainer before tagging a release (mirrors this repo's existing pattern of
// manually-committed exact versions, e.g. prepare-package-publish.mjs) — this
// script does not publish anything and is not wired into CI.
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { readPublicPackages } from './changeset-packages.mjs'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const FRONTMATTER_BLOCK = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/
const FRONTMATTER_LINE = /^"([^"]+)":\s*(patch|minor|major)\s*$/
const SEVERITY = { patch: 1, minor: 2, major: 3 }

export function parseChangesetFile(content) {
  const match = FRONTMATTER_BLOCK.exec(content)
  if (!match) throw new Error('changeset file is missing --- frontmatter')
  const [, frontmatter, body] = match
  const bumps = new Map()
  for (const line of frontmatter.split('\n')) {
    if (!line.trim()) continue
    const lineMatch = FRONTMATTER_LINE.exec(line)
    if (!lineMatch) throw new Error(`invalid changeset frontmatter line: ${JSON.stringify(line)}`)
    bumps.set(lineMatch[1], lineMatch[2])
  }
  return { bumps, summary: body.trim() }
}

export function combineBumps(bumpsList) {
  const combined = new Map()
  for (const bumps of bumpsList) {
    for (const [name, level] of bumps) {
      const current = combined.get(name)
      if (!current || SEVERITY[level] > SEVERITY[current]) combined.set(name, level)
    }
  }
  return combined
}

export function bumpVersion(version, level) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version)
  if (!match) throw new Error(`cannot bump non-plain-semver version: ${version}`)
  let [major, minor, patch] = match.slice(1).map(Number)
  if (level === 'major') {
    major += 1
    minor = 0
    patch = 0
  } else if (level === 'minor') {
    minor += 1
    patch = 0
  } else if (level === 'patch') {
    patch += 1
  } else {
    throw new Error(`unknown bump level: ${level}`)
  }
  return `${major}.${minor}.${patch}`
}

export function buildChangelogSection(version, date, summaries) {
  const bullets = summaries.map((line) => `- ${line}`).join('\n')
  return `## ${version} (current) — ${date}\n\n${bullets}`
}

// The previous topmost version is no longer current, and the new section goes
// above it — right after the title/intro block, before the first existing
// "## " heading (or at the end, for a CHANGELOG that has none yet).
export function insertChangelogSection(content, section) {
  const withoutCurrentMarker = content.replace(/^(## \S.*) \(current\)(.*)$/m, '$1$2')
  const headingIndex = withoutCurrentMarker.search(/^## /m)
  if (headingIndex === -1) {
    return `${withoutCurrentMarker.trimEnd()}\n\n${section}\n`
  }
  return `${withoutCurrentMarker.slice(0, headingIndex)}${section}\n\n${withoutCurrentMarker.slice(headingIndex)}`
}

function readChangesetFiles(changesetDir) {
  if (!existsSync(changesetDir)) return []
  return readdirSync(changesetDir).filter((name) => name.endsWith('.md') && name !== 'README.md')
}

async function main() {
  const rootArg = process.argv.find((arg) => arg.startsWith('--root='))?.slice('--root='.length)
  const root = rootArg ? resolve(rootArg) : repoRoot
  const dryRun = process.argv.includes('--dry-run')
  const changesetDir = resolve(root, '.changeset')

  const files = readChangesetFiles(changesetDir)
  if (files.length === 0) {
    process.stdout.write('no .changeset entries to release\n')
    return
  }

  const parsed = files.map((name) => ({
    name,
    ...parseChangesetFile(readFileSync(resolve(changesetDir, name), 'utf8')),
  }))
  const combined = combineBumps(parsed.map((entry) => entry.bumps))

  const summariesByPackage = new Map()
  for (const { bumps, summary } of parsed) {
    for (const name of bumps.keys()) {
      if (!summariesByPackage.has(name)) summariesByPackage.set(name, [])
      summariesByPackage.get(name).push(summary)
    }
  }

  const byName = new Map(readPublicPackages(root).map((pkg) => [pkg.name, pkg]))
  const date = new Date().toISOString().slice(0, 10)

  for (const [name, level] of combined) {
    const pkg = byName.get(name)
    if (!pkg) throw new Error(`changeset references unknown or non-public package: ${name}`)

    const manifestPath = resolve(root, 'packages', pkg.dir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const newVersion = bumpVersion(manifest.version, level)

    const changelogPath = resolve(root, 'packages', pkg.dir, 'CHANGELOG.md')
    const changelog = existsSync(changelogPath) ? readFileSync(changelogPath, 'utf8') : `# ${name}\n\n`
    const section = buildChangelogSection(newVersion, date, summariesByPackage.get(name))
    const updatedChangelog = insertChangelogSection(changelog, section)

    console.log(`${name}: ${manifest.version} -> ${newVersion} (${level})`)
    if (!dryRun) {
      manifest.version = newVersion
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
      writeFileSync(changelogPath, updatedChangelog)
    }
  }

  if (dryRun) {
    process.stdout.write('(dry run — no files written; pass no --dry-run flag to apply)\n')
    return
  }

  for (const name of files) unlinkSync(resolve(changesetDir, name))
  process.stdout.write(`consumed ${files.length} changeset file(s)\n`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
