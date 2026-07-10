import * as fs from 'fs'
import * as path from 'path'
import { describe, expect, it } from 'vitest'

const FORMER_CLI_COMMAND = /\b(?:(?:bp|botpress)\s+(?:add|build|bundle|chat|check|debug|deploy|dev|generate|init|link|login|logout|serve|typecheck|validate)|adk\s+(?:add|build|chat|check|debug|deploy|dev|generate|init|link|login|logout|serve|typecheck|validate))\b/gi

function executableFiles(root: string): string[] {
  if (!fs.existsSync(root)) return []
  const files: string[] = []
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const filePath = path.join(root, entry.name)
    if (entry.isDirectory()) {
      files.push(...executableFiles(filePath))
      continue
    }
    if (!/\.(?:[cm]?js|ts)$/.test(entry.name)) continue
    if (/\.(?:test|spec)\.[^.]+$/.test(entry.name) || entry.name.endsWith('.d.ts')) continue
    files.push(filePath)
  }
  return files
}

describe('brt one-binary contract', () => {
  it('contains no former CLI command in shipped source or built output', () => {
    const packageRoot = path.resolve(import.meta.dirname, '..')
    const findings = [...executableFiles(path.join(packageRoot, 'src')), ...executableFiles(path.join(packageRoot, 'dist'))]
      .flatMap((filePath) => {
        const raw = fs.readFileSync(filePath, 'utf8')
        return [...raw.matchAll(FORMER_CLI_COMMAND)].map((match) => ({
          file: path.relative(packageRoot, filePath),
          token: match[0],
        }))
      })

    expect(findings).toEqual([])
  })
})
