import * as fs from 'node:fs'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'

const FORMER_CLI_COMMAND =
  /\b(?:(?:bp|botpress)\s+(?:add|assets|build|bundle|chat|check|debug|deploy|dev|generate|init|integrations|kb|link|login|logout|run|secret:set|serve|typecheck|validate)|adk\s+(?:add|assets|build|bundle|chat|check|debug|deploy|dev|generate|init|integrations|kb|link|login|logout|run|secret:set|serve|typecheck|validate))\b/gi
const INVALID_BRT_GUIDANCE =
  /\bbrt\s+(?:models\b|traces\b|chat\s+--single\b|integrations\s+(?:add|status)\b|add\s+browser\b|build\b|deploy\b(?!\s+--adk\b))/gi

function shippedTextFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(root, entry.name)
    if (entry.isDirectory()) return shippedTextFiles(filePath)
    if (!/\.(?:[cm]?js|ts|md)$/.test(entry.name)) return []
    if (/\.(?:test|spec|fixture)\.[^.]+$/.test(entry.name) || entry.name.endsWith('.d.ts')) return []
    return [filePath]
  })
}

describe('runtime one-binary contract', () => {
  it('never directs users or maintainers to a retired CLI', () => {
    const packageRoot = path.resolve(__dirname, '..')
    const files = [path.join(packageRoot, 'readme.md'), ...shippedTextFiles(path.join(packageRoot, 'src'))]
    const findings = files.flatMap((filePath) => {
      const text = fs.readFileSync(filePath, 'utf8')
      return [FORMER_CLI_COMMAND, INVALID_BRT_GUIDANCE].flatMap((pattern) =>
        [...text.matchAll(pattern)].map((match) => ({
          file: path.relative(packageRoot, filePath),
          token: match[0],
        }))
      )
    })
    expect(findings).toEqual([])
  })
})
