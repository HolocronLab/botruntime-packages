import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import commandDefinitions from './command-definitions'
import {
  buildBrtDocsContract,
  serializeBrtDocsContract,
  validateDocsCriticalRequirements,
} from './docs-contract'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const contractPath = path.join(packageRoot, 'brt-docs-contract.json')

describe('brt documentation contract', () => {
  it('matches the real command tree and schemas byte-for-byte after generation', () => {
    const checkedIn = fs.readFileSync(contractPath, 'utf8')

    expect(checkedIn).toBe(serializeBrtDocsContract(buildBrtDocsContract(commandDefinitions)))
  })

  it('keeps every curated workflow command and option attached to the live tree', () => {
    expect(() => validateDocsCriticalRequirements(commandDefinitions)).not.toThrow()
  })
})
