import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const INVALID_COMMAND_GUIDANCE =
  /\b(?:adk\s+(?:add|build|chat|deploy|dev|eval|integrations|login)|brt\s+(?:eval\b|models\b|chat\s+--single\b|integrations\s+add\b|deploy\b(?!\s+--adk\b)))/gi

function shippedTextFiles(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) return shippedTextFiles(file)
    if (!/\.(?:ts|md)$/.test(entry.name) || /\.test\.ts$/.test(entry.name) || entry.name.endsWith('.d.ts')) return []
    return [file]
  })
}

describe('evals one-binary guidance', () => {
  it('contains no retired or invented CLI commands', () => {
    const packageRoot = path.resolve(__dirname, '..')
    const files = [path.join(packageRoot, 'readme.md'), ...shippedTextFiles(path.join(packageRoot, 'src'))]
    const findings = files.flatMap((file) =>
      [...fs.readFileSync(file, 'utf8').matchAll(INVALID_COMMAND_GUIDANCE)].map((match) => ({
        file: path.relative(packageRoot, file),
        token: match[0],
      }))
    )
    expect(findings).toEqual([])
  })
})
