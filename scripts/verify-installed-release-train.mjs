#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { validateInstalledReleaseTrain } from './package-release-contract.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const consumerArg = process.argv.find((arg) => arg.startsWith('--consumer='))?.slice('--consumer='.length)
if (!consumerArg) throw new Error('pass --consumer=/path/to/clean/npm/project')

const expectedVersions = new Map()
for (const entry of readdirSync(resolve(root, 'packages'), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue
  try {
    const manifest = JSON.parse(
      readFileSync(resolve(root, 'packages', entry.name, 'package.json'), 'utf8')
    )
    if (manifest.private !== true && manifest.name?.startsWith('@holocronlab/')) {
      expectedVersions.set(manifest.name, manifest.version)
    }
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
}

const dependencyTree = JSON.parse(
  execFileSync('npm', ['ls', '--json', '--all', '--userconfig=/dev/null'], {
    cwd: resolve(consumerArg),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  })
)

const requiredPackages = [
  '@holocronlab/brt',
  '@holocronlab/botruntime-adk',
  '@holocronlab/botruntime-runtime',
  '@holocronlab/botruntime-evals',
]
const result = validateInstalledReleaseTrain(dependencyTree, expectedVersions, { requiredPackages })
console.log(
  `verified coherent installed release train: ${result.packages} package(s), ${result.checkedOccurrences} occurrence(s)`
)
