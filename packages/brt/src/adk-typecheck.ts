import { createRequire } from 'module'
import { spawnSync } from 'node:child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as errors from './errors'

// adk-typecheck — brt deploy --adk's pre-bundle safety net. The ADK
// bundling pipeline (adk-bundle.ts -> BuildCommand -> BundleCommand -> esbuild)
// only ever STRIPS types; it never runs the TypeScript checker. A bot with a
// tool-props type error therefore deployed clean and only failed at runtime,
// inside the sandboxed llmz execution, far from the actual mistake. This module
// runs `tsc --noEmit` semantics against the agent project's OWN tsconfig.json
// and its OWN installed `typescript`, and formats diagnostics the way `tsc`
// itself does (file:line:column + source context), before any bundling starts.

export const TSCONFIG_FILE = 'tsconfig.json'

export type AdkTypecheckOutcome =
  | { status: 'skipped-explicit' }
  | { status: 'skipped-no-tsconfig' }
  | { status: 'ok' }
  | { status: 'failed'; formatted: string; errorCount: number }

export function hasTsconfig(dir: string): boolean {
  return fs.existsSync(path.join(dir, TSCONFIG_FILE))
}

export type ResolvedProjectTsc =
  | { status: 'not-found' }
  | { status: 'unusable'; reason: string }
  | { status: 'ok'; entry: string }

// TypeScript 7 deliberately replaced the legacy in-process JS Compiler API.
// The project-local `tsc` executable is the stable boundary shared by legacy
// TypeScript and the native compiler, and is also what `bun run typecheck`
// invokes. Resolve its declared package bin instead of importing a private API.
export function resolveProjectTsc(dir: string): ResolvedProjectTsc {
  let packageJsonPath: string
  try {
    packageJsonPath = createRequire(path.join(dir, 'package.json')).resolve('typescript/package.json')
  } catch {
    return { status: 'not-found' }
  }

  let packageJson: { bin?: string | Record<string, string> }
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
  } catch {
    return { status: 'unusable', reason: 'its package.json could not be read' }
  }

  const declaredBin = typeof packageJson.bin === 'string' ? packageJson.bin : packageJson.bin?.tsc
  if (!declaredBin || path.isAbsolute(declaredBin)) {
    return { status: 'unusable', reason: 'its package.json does not declare a valid bin.tsc entry' }
  }

  const packageDir = path.dirname(packageJsonPath)
  const entry = path.resolve(packageDir, declaredBin)
  const relativeEntry = path.relative(packageDir, entry)
  if (relativeEntry.startsWith(`..${path.sep}`) || relativeEntry === '..' || !fs.existsSync(entry)) {
    return { status: 'unusable', reason: 'its declared bin.tsc entry does not exist inside the package' }
  }
  return { status: 'ok', entry }
}

function runTypecheck(entry: string, dir: string): { formatted: string; errorCount: number } {
  const tsconfigPath = path.join(dir, TSCONFIG_FILE)
  const result = spawnSync(process.execPath, [entry, '--noEmit', '--project', tsconfigPath], {
    cwd: dir,
    encoding: 'utf8',
    env: process.env,
    // Large projects can legitimately emit more diagnostics than Node's 1 MiB
    // default. Preserve actionable compiler output instead of surfacing ENOBUFS.
    maxBuffer: 16 * 1024 * 1024,
  })
  if (result.error) {
    throw new errors.BotpressCLIError(`typecheck could not start the project-local TypeScript compiler: ${result.error.message}`)
  }
  if (result.status === 0) return { formatted: '', errorCount: 0 }

  const formatted = [result.stdout, result.stderr].filter(Boolean).join('\n').trim()
  const errorCount = formatted.match(/\berror TS\d+\b/g)?.length ?? 1
  return {
    formatted: formatted || `TypeScript compiler exited with status ${result.status ?? 'unknown'}`,
    errorCount,
  }
}

// runAdkTypecheck is the single entry point deploy-command.ts wires up before
// bundling. `skip` is the --noTypecheck escape hatch (deliberate, logged by the
// caller); a missing tsconfig.json is a distinct, non-fatal "cannot check"
// outcome — also logged by the caller — never a silent no-op.
export function runAdkTypecheck(dir: string, opts: { skip: boolean }): AdkTypecheckOutcome {
  if (opts.skip) {
    return { status: 'skipped-explicit' }
  }
  if (!hasTsconfig(dir)) {
    return { status: 'skipped-no-tsconfig' }
  }

  const resolved = resolveProjectTsc(dir)
  if (resolved.status === 'not-found') {
    throw new errors.BotpressCLIError(
      `typecheck requires "typescript" in this project's own dependencies (tsconfig.json is present at ${path.join(
        dir,
        TSCONFIG_FILE
      )}, but "typescript" is not installed). Run \`bun install\`, or pass --noTypecheck to skip type checking.`
    )
  }
  if (resolved.status === 'unusable') {
    throw new errors.BotpressCLIError(
      `typecheck could not use the "typescript" package resolved for this project because ${resolved.reason}. ` +
        `Reinstall the project dependencies, or pass --noTypecheck to skip type checking.`
    )
  }

  const { formatted, errorCount } = runTypecheck(resolved.entry, dir)
  if (errorCount === 0) {
    return { status: 'ok' }
  }
  return { status: 'failed', formatted, errorCount }
}
