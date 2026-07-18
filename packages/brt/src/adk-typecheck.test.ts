import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { runAdkTypecheck, TSCONFIG_FILE } from './adk-typecheck'
import * as utils from './utils'

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

  // Codex review (DEVLP-173): a resolved `typescript` entry that doesn't
  // actually expose the compiler API (e.g. a native/non-JS-API distribution,
  // or an unrelated package resolved from outside the project's own
  // dependency graph) must fail loud with a message that does NOT claim
  // "not installed" — it plainly IS installed, just unusable by this
  // module — never crash later on a missing ts.sys/ts.createProgram.
  it('fails with an "unusable", not "not installed", message for a resolvable but non-compiler-shaped "typescript"', () => {
    const dir = makeProjectDir()
    fs.writeFileSync(path.join(dir, TSCONFIG_FILE), VALID_TSCONFIG)
    fs.mkdirSync(path.join(dir, 'src'))
    fs.writeFileSync(path.join(dir, 'src', 'index.ts'), 'export const answer: number = 42\n')
    vi.spyOn(utils.require, 'requireJsFile').mockReturnValue({ version: '7.0.0-native' } as any)

    expect(() => runAdkTypecheck(dir, { skip: false })).toThrow(
      /typecheck could not use.*"typescript".*--noTypecheck/is
    )
    expect(() => runAdkTypecheck(dir, { skip: false })).not.toThrow(/not installed/i)

    vi.restoreAllMocks()
  })
})
