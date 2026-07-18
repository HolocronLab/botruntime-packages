import { createRequire } from 'module'
import * as fs from 'fs'
import * as path from 'path'
// Type-only: erased at runtime (bun/tsc strip it). typescript is intentionally
// NOT a runtime dependency of brt (see resolveProjectTypescript below), so this
// import must add zero runtime cost — same pattern as adkLib in adk-bundle.ts.
import type * as TSNamespace from 'typescript'
import * as errors from './errors'
import * as utils from './utils'

// adk-typecheck — brt deploy --adk's pre-bundle safety net (DEVLP-173). The ADK
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

// A resolved module is only trusted as a usable compiler if it actually
// exposes the exact API surface this file drives. Node/Bun module resolution
// can succeed against something that ISN'T a working `tsc` — e.g. Bun's own
// package cache resolving a differently-shaped `typescript` release with no
// project devDependency at all — and silently trusting that would either
// crash later on a missing `ts.sys` (an obscure TypeError deep in
// runTypecheck) or, worse, quietly typecheck against a compiler outside the
// project's own declared dependency graph.
function isUsableTypescript(candidate: unknown): candidate is typeof TSNamespace {
  if (!candidate || typeof candidate !== 'object') return false
  const ts = candidate as Partial<typeof TSNamespace>
  return (
    typeof ts.createProgram === 'function' &&
    typeof ts.readConfigFile === 'function' &&
    typeof ts.parseJsonConfigFileContent === 'function' &&
    typeof ts.getPreEmitDiagnostics === 'function' &&
    typeof ts.formatDiagnostics === 'function' &&
    typeof ts.sys?.readFile === 'function'
  )
}

export type ResolvedProjectTypescript =
  | { status: 'not-found' }
  // Resolved to SOMETHING under the name `typescript`, but not this module's
  // expected JS Compiler API shape — e.g. a native/non-JS-API TypeScript
  // distribution. Kept distinct from 'not-found' so the caller's error message
  // never claims "not installed" about a package that plainly IS there.
  | { status: 'unusable' }
  | { status: 'ok'; ts: typeof TSNamespace }

// Resolves `typescript` from the AGENT PROJECT's own dependency graph, never
// from brt's own devDependency copy (used only to build/test brt itself, and
// not published to npm consumers of @holocronlab/brt). The project pins its
// own compiler version against its own tsconfig.json (see
// agent-project-generator.ts's createTsConfig/createPackageJson, which puts
// `typescript` in devDependencies), so brt intentionally never bundles or
// depends on a TypeScript version of its own for this check.
export function resolveProjectTypescript(dir: string): ResolvedProjectTypescript {
  let entry: string
  try {
    entry = createRequire(path.join(dir, 'package.json')).resolve('typescript')
  } catch {
    return { status: 'not-found' }
  }
  const candidate = utils.require.requireJsFile<typeof TSNamespace>(entry)
  return isUsableTypescript(candidate) ? { status: 'ok', ts: candidate } : { status: 'unusable' }
}

function formatHost(ts: typeof TSNamespace, dir: string): TSNamespace.FormatDiagnosticsHost {
  return {
    getCurrentDirectory: () => dir,
    getCanonicalFileName: (fileName) => (ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase()),
    getNewLine: () => ts.sys.newLine,
  }
}

// Runs the project's own `tsc --noEmit` and formats diagnostics exactly the way
// `tsc` prints them (colorized with source context on a TTY, plain otherwise) —
// never a raw Diagnostic[] dump. Synchronous: ts.createProgram itself is sync.
function runTypecheck(ts: typeof TSNamespace, dir: string): { formatted: string; errorCount: number } {
  const tsconfigPath = path.join(dir, TSCONFIG_FILE)
  const host = formatHost(ts, dir)
  const useColor = Boolean(process.stderr.isTTY)
  const format = (diagnostics: readonly TSNamespace.Diagnostic[]) =>
    useColor ? ts.formatDiagnosticsWithColorAndContext(diagnostics, host) : ts.formatDiagnostics(diagnostics, host)

  const { config, error: readError } = ts.readConfigFile(tsconfigPath, ts.sys.readFile)
  if (readError) {
    return { formatted: format([readError]), errorCount: 1 }
  }

  // tsconfigPath как configFileName обязателен: без него options.configFilePath
  // пуст и discovery дефолтных node_modules/@types якорится к cwd ЗАПУСКА CLI, а
  // не к каталогу проекта (--workDir) — валидный проект с ambient-типами падал
  // бы TS2304, а чужие типы из cwd могли бы маскировать ошибки.
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, dir, undefined, tsconfigPath)
  if (parsed.errors.length > 0) {
    return { formatted: format(parsed.errors), errorCount: parsed.errors.length }
  }

  // Force noEmit the same way the `--noEmit` CLI flag overrides tsconfig: this
  // is a check, never a compile, regardless of what the project's own
  // tsconfig says. Without this override, a tsconfig that omits `noEmit`
  // (unlike the generated default, which sets it) combined with
  // `allowImportingTsExtensions` would surface a spurious TS5096 "can only be
  // used when noEmit is set" and block deployment for the wrong reason.
  // Pass through project references (composite tsconfig.json `references`) so
  // a referenced project's own diagnostics (e.g. TS6305, unbuilt declaration
  // output) are still reported instead of silently ignored — the generated
  // default tsconfig has none, but a hand-authored one may.
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: { ...parsed.options, noEmit: true },
    projectReferences: parsed.projectReferences,
  })
  const diagnostics = ts.getPreEmitDiagnostics(program).filter((d) => d.category === ts.DiagnosticCategory.Error)

  return { formatted: format(diagnostics), errorCount: diagnostics.length }
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

  const resolved = resolveProjectTypescript(dir)
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
      `typecheck could not use the "typescript" package resolved for this project: it does not expose the expected ` +
        `TypeScript Compiler API (this feature does not yet support native/non-JS-API TypeScript distributions). ` +
        `Pass --noTypecheck to skip type checking.`
    )
  }

  const { formatted, errorCount } = runTypecheck(resolved.ts, dir)
  if (errorCount === 0) {
    return { status: 'ok' }
  }
  return { status: 'failed', formatted, errorCount }
}
