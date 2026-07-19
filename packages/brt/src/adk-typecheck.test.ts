import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it } from 'vitest'
import { runAdkTypecheck, TSCONFIG_FILE } from './adk-typecheck'

const packageRoot = path.resolve(__dirname, '..')
const createdDirs: string[] = []

// Placed INSIDE packages/brt (not os.tmpdir()) so ancestor node_modules
// resolution finds this package's own installed `typescript` — the same
// pattern botruntime-adk's agent-project-generator.test.ts smoke test uses.
function makeProjectDir(): string {
  const dir = fs.mkdtempSync(path.join(packageRoot, '.tmp-typecheck-'))
  createdDirs.push(dir)
  return dir
}

const VALID_TSCONFIG = JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'ES2022',
    moduleResolution: 'Bundler',
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  },
  include: ['src/**/*'],
})

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('runAdkTypecheck', () => {
  it('skips explicitly when --noTypecheck is passed, without reading tsconfig.json', () => {
    const dir = makeProjectDir()
    // no tsconfig.json written — must not matter for the explicit skip path.
    expect(runAdkTypecheck(dir, { skip: true })).toEqual({ status: 'skipped-explicit' })
  })

  it('warns-and-skips (does not fail) when the project has no tsconfig.json', () => {
    const dir = makeProjectDir()
    expect(runAdkTypecheck(dir, { skip: false })).toEqual({ status: 'skipped-no-tsconfig' })
  })

  it('fails loudly with an actionable message when tsconfig.json exists but typescript is not resolvable', () => {
    // A bare OS tmp dir (outside this package's node_modules ancestry) has no
    // resolvable `typescript` in this sandboxed test environment.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'brt-typecheck-no-ts-'))
    createdDirs.push(dir)
    fs.writeFileSync(path.join(dir, TSCONFIG_FILE), VALID_TSCONFIG)

    expect(() => runAdkTypecheck(dir, { skip: false })).toThrow(
      /typecheck requires "typescript".*bun install.*--noTypecheck/is
    )
  })

  it('passes a project with no type errors', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(path.join(dir, TSCONFIG_FILE), VALID_TSCONFIG)
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer: number = 42\n')

    expect(runAdkTypecheck(dir, { skip: false })).toEqual({ status: 'ok' })
  })

  it('uses the project-local tsc binary when the package has no legacy Compiler API', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true }))
    fs.writeFileSync(path.join(dir, TSCONFIG_FILE), VALID_TSCONFIG)
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer: number = 42\n')

    const typescriptDir = path.join(dir, 'node_modules', 'typescript')
    fs.mkdirSync(path.join(typescriptDir, 'bin'), { recursive: true })
    fs.mkdirSync(path.join(typescriptDir, 'lib'), { recursive: true })
    fs.writeFileSync(
      path.join(typescriptDir, 'package.json'),
      JSON.stringify({
        name: 'typescript',
        version: '7.0.2',
        type: 'module',
        exports: { '.': './lib/version.cjs', './package.json': './package.json' },
        bin: { tsc: './bin/tsc' },
      })
    )
    fs.writeFileSync(path.join(typescriptDir, 'lib', 'version.cjs'), 'module.exports = { version: "7.0.2" }\n')
    fs.writeFileSync(
      path.join(typescriptDir, 'bin', 'tsc'),
      [
        '#!/usr/bin/env node',
        'const args = process.argv.slice(2)',
        'const projectIndex = args.indexOf("--project")',
        'if (!args.includes("--noEmit") || projectIndex < 0 || !args[projectIndex + 1].endsWith("tsconfig.json")) {',
        '  console.error("unexpected compiler arguments: " + JSON.stringify(args))',
        '  process.exit(2)',
        '}',
      ].join('\n')
    )
    fs.chmodSync(path.join(typescriptDir, 'bin', 'tsc'), 0o755)

    expect(runAdkTypecheck(dir, { skip: false })).toEqual({ status: 'ok' })
  })

  it('fails with a readable file:line diagnostic when the project has a type error', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(path.join(dir, TSCONFIG_FILE), VALID_TSCONFIG)
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer: number = "not a number"\n')

    const outcome = runAdkTypecheck(dir, { skip: false })

    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') throw new Error('unreachable')
    expect(outcome.errorCount).toBe(1)
    expect(outcome.formatted).toContain('index.ts')
    // tsc's own 1-based line/column diagnostic location for this exact source
    // (plain, non-colorized format.ts.formatDiagnostics, since a test run has
    // no TTY — see runTypecheck's useColor switch).
    expect(outcome.formatted).toMatch(/index\.ts\(1,14\)/)
    expect(outcome.formatted).toMatch(/TS2322/)
  })

  it('reports every error across multiple files, not just the first', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(path.join(dir, TSCONFIG_FILE), VALID_TSCONFIG)
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'a.ts'), 'export const a: number = "nope"\n')
    fs.writeFileSync(path.join(dir, 'src', 'b.ts'), 'export const b: string = 1\n')

    const outcome = runAdkTypecheck(dir, { skip: false })

    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') throw new Error('unreachable')
    expect(outcome.errorCount).toBe(2)
    expect(outcome.formatted).toContain('a.ts')
    expect(outcome.formatted).toContain('b.ts')
  })

  // Codex review (DEVLP-173): forces `--noEmit` CLI-flag semantics regardless
  // of what the project's own tsconfig says, so `allowImportingTsExtensions`
  // (in the generated default tsconfig) combined with a tsconfig that omits
  // `noEmit` never surfaces a spurious TS5096 config error instead of real
  // source diagnostics.
  it('still passes (no spurious TS5096) when tsconfig omits noEmit alongside allowImportingTsExtensions', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(
      path.join(dir, TSCONFIG_FILE),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
          // noEmit deliberately omitted (defaults to false)
        },
        include: ['src/**/*'],
      })
    )
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer: number = 42\n')

    expect(runAdkTypecheck(dir, { skip: false })).toEqual({ status: 'ok' })
  })

  it('still catches a real type error when tsconfig omits noEmit alongside allowImportingTsExtensions', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(
      path.join(dir, TSCONFIG_FILE),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'ES2022',
          moduleResolution: 'Bundler',
          strict: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
        },
        include: ['src/**/*'],
      })
    )
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer: number = "not a number"\n')

    const outcome = runAdkTypecheck(dir, { skip: false })

    expect(outcome.status).toBe('failed')
    if (outcome.status !== 'failed') throw new Error('unreachable')
    expect(outcome.errorCount).toBe(1)
    expect(outcome.formatted).toMatch(/TS2322/)
    expect(outcome.formatted).not.toMatch(/TS5096/)
  })

  it('fails with an "unusable", not "not installed", message when the package has no tsc binary', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ private: true }))
    fs.writeFileSync(path.join(dir, TSCONFIG_FILE), VALID_TSCONFIG)
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer: number = 42\n')
    const typescriptDir = path.join(dir, 'node_modules', 'typescript')
    fs.mkdirSync(path.join(typescriptDir, 'lib'), { recursive: true })
    fs.writeFileSync(
      path.join(typescriptDir, 'package.json'),
      JSON.stringify({
        name: 'typescript',
        version: '7.0.2',
        exports: { '.': './lib/version.cjs', './package.json': './package.json' },
      })
    )
    fs.writeFileSync(path.join(typescriptDir, 'lib', 'version.cjs'), 'module.exports = { version: "7.0.2" }\n')

    expect(() => runAdkTypecheck(dir, { skip: false })).toThrow(
      /typecheck could not use.*"typescript".*--noTypecheck/is
    )
    expect(() => runAdkTypecheck(dir, { skip: false })).not.toThrow(/not installed/i)
  })
})
