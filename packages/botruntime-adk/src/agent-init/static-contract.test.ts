import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  loadAgent0BuiltInCommandConfig,
  resolveAgent0BuiltInInstructionFiles,
  resolveAgent0BuiltInSkillPaths,
} from '../agent0/capabilities/builtins.js'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const shippedRoots = [
  path.join(packageRoot, 'README.md'),
  path.join(packageRoot, 'assets-static'),
  path.join(packageRoot, 'src'),
]

const textExtensions = new Set(['.json', '.md', '.ts'])

function collectTextFiles(root: string): string[] {
  if (statSync(root).isFile()) return [root]

  return readdirSync(root)
    .toSorted()
    .flatMap((entry) => collectTextFiles(path.join(root, entry)))
    .filter((file) => textExtensions.has(path.extname(file)) && !file.endsWith('.test.ts'))
}

describe('shipped Agent(0) and project starter contract', () => {
  it('contains only Holocron branding and the executable brt command surface', () => {
    const foreignCli = [
      new RegExp(
        `\\b${['a', 'd', 'k'].join('')}\\s+(?:login|link|dev|deploy|check|build|init|mcp:init|agent0|integrations|plugins|dependencies|workflows|evals?|secrets|run|ps)\\b`
      ),
      new RegExp(`\\b${['ADK', 'CLI'].join(' ')}\\b`, 'i'),
      new RegExp(`\\b${['ADK', 'commands?'].join(' ')}\\b`, 'i'),
    ]
    const foreignBranding = [
      new RegExp(`@${['bot', 'press'].join('')}/evals`, 'i'),
      new RegExp(`${['bot', 'press'].join('')}\\.com`, 'i'),
      new RegExp(`${['local', 'host'].join('')}:3001`, 'i'),
      new RegExp(`${['Bot', 'press'].join(' ')} Cloud`, 'i'),
      new RegExp(`${['Dev', 'Console'].join(' ')}`, 'i'),
    ]

    const findViolations = (roots: string[], patterns: RegExp[]) =>
      roots.flatMap((root) =>
        collectTextFiles(root).flatMap((file) => {
          const content = readFileSync(file, 'utf8')
          return patterns.flatMap((pattern) =>
            pattern.test(content) ? [`${path.relative(packageRoot, file)} matches ${pattern.source}`] : []
          )
        })
      )

    const violations = [...findViolations(shippedRoots, foreignCli), ...findViolations(shippedRoots, foreignBranding)]

    expect(violations).toEqual([])
  })

  it('allowlists the single legacy package parser literal', () => {
    const legacyRuntime = `@${['bot', 'press'].join('')}/runtime`
    const occurrences = collectTextFiles(path.join(packageRoot, 'src')).flatMap((file) => {
      const content = readFileSync(file, 'utf8')
      return Array.from(content.matchAll(new RegExp(legacyRuntime.replace('/', '\\/'), 'g')), () =>
        path.relative(packageRoot, file)
      )
    })

    expect(occurrences).toEqual(['src/dependencies/migration.ts'])
  })

  it('keeps the runtime-loadable skill and brt playbooks', () => {
    const capabilitiesRoot = path.join(packageRoot, 'assets-static', 'agent0', 'capabilities')
    const skillsRoot = path.join(capabilitiesRoot, 'skills')
    const commandsRoot = path.join(capabilitiesRoot, 'commands')

    expect(resolveAgent0BuiltInSkillPaths(skillsRoot).map((skillPath) => path.basename(skillPath))).toEqual(['adk'])
    expect(resolveAgent0BuiltInInstructionFiles(skillsRoot).map((file) => path.relative(skillsRoot, file))).toEqual([
      path.join('adk', 'SKILL.md'),
    ])
    expect(Object.keys(loadAgent0BuiltInCommandConfig(commandsRoot))).toEqual([
      'brt-debug',
      'brt-deploy',
      'brt-typecheck',
      'brt-validate',
    ])
  })
})
