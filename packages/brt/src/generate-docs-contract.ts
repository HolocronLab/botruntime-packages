#!/usr/bin/env bun
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import commandDefinitions from './command-definitions'
import { buildBrtDocsContract, serializeBrtDocsContract } from './docs-contract'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(packageRoot, 'brt-docs-contract.json')
const expected = serializeBrtDocsContract(buildBrtDocsContract(commandDefinitions))

if (process.argv.includes('--stdout')) {
  process.stdout.write(expected)
  process.exit(0)
}

if (process.argv.includes('--check')) {
  const actual = fs.existsSync(contractPath) ? fs.readFileSync(contractPath, 'utf8') : ''
  if (actual !== expected) {
    console.error(`BRT docs contract drift: run \`bun src/generate-docs-contract.ts\` and commit ${contractPath}`)
    process.exit(1)
  }
  console.log('BRT docs contract matches the live command tree and schemas.')
  process.exit(0)
}

fs.writeFileSync(contractPath, expected)
console.log(`Wrote ${contractPath}`)
