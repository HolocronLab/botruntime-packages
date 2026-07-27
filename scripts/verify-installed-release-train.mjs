#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { resolveInstalledImportExport } from './installed-package-export.mjs'
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

const consumerDir = resolve(consumerArg)
const consumerRequire = createRequire(resolve(consumerDir, 'package.json'))
const installedClientPackage = consumerRequire('@holocronlab/botruntime-client')
const installedSdkPackage = consumerRequire('@holocronlab/botruntime-sdk')
const rawClient = new installedClientPackage.Client({
  apiUrl: 'https://release-smoke.invalid',
  token: 'release-smoke-token',
  botId: 'release-smoke-bot',
})
const botClient = new installedSdkPackage.BotSpecificClient(rawClient)
for (const [label, instance, operations] of [
  [
    'raw client',
    rawClient,
    ['reserveTableKey', 'atomicTables', 'transitionTableUniqueKey'],
  ],
  ['SDK BotSpecificClient', botClient, ['reserveTableKey', 'atomicTables']],
]) {
  for (const operation of operations) {
    if (typeof instance[operation] !== 'function') {
      throw new Error(`installed ${label} does not expose ${operation}`)
    }
  }
}
console.log('verified installed Tables primitives: raw client + SDK BotSpecificClient')

const bpCliContractPath = resolveInstalledImportExport(
  consumerRequire,
  '@holocronlab/botruntime-adk',
  './internal/bp-cli'
)
const bpCliContract = await import(pathToFileURL(bpCliContractPath).href)
if (typeof bpCliContract.resolveBpCliBinPath !== 'function') {
  throw new Error('installed ADK does not export resolveBpCliBinPath')
}

const expectedBrtVersion = expectedVersions.get('@holocronlab/brt')
if (!expectedBrtVersion) throw new Error('source release train does not contain @holocronlab/brt')
const resolvedBrtBin = bpCliContract.resolveBpCliBinPath(consumerDir, expectedBrtVersion)
const installedBrtVersion = execFileSync(resolvedBrtBin, ['--version'], {
  cwd: consumerDir,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'inherit'],
}).trim()
if (installedBrtVersion !== expectedBrtVersion) {
  throw new Error(
    `ADK resolved BRT ${installedBrtVersion} at ${resolvedBrtBin}; expected ${expectedBrtVersion}`
  )
}
execFileSync(resolvedBrtBin, ['run', '--help'], {
  cwd: consumerDir,
  stdio: ['ignore', 'ignore', 'inherit'],
})
console.log(`verified ADK -> BRT package bin contract: brt ${installedBrtVersion}; run --help`)
