import * as childProcess from 'child_process'
import { createHash } from 'crypto'
import * as fs from 'fs'
import * as path from 'path'
import { cloudInfo, cloudWarn } from './cloud-io'
import * as errors from './errors'

// brt deploy --adk — WRAPPER over a project's own SDK bundler, ported from the
// (deleted) thin brt CLI's commands/build.ts. This fork ships its OWN native
// esbuild-based bundler for Botpress-shaped projects (see build-command.ts /
// bundle-command.ts) — ADK-shaped projects are a separate lineage that bring
// their own build toolchain (their own `adk`/`bp` binary, resolved from the
// PROJECT's node_modules/PATH, never from this CLI's own dependencies). This
// module only shells out to that project-local toolchain and normalizes
// whatever nested artifact it produces to a deterministic .brt/dist/index.cjs;
// it does not (and must not) depend on any specific SDK package itself.
//
// REBRAND RULE: the build dirs (.adk/, .botpress/) and the SDK binary name are
// produced/consumed by the target project's own toolchain — brt reads them,
// it does not rename them.

export const ADK_BUNDLE_REL_PATH = path.join('.brt', 'dist', 'index.cjs')

// Where a project's SDK toolchain drops its single-file CJS bundle, most-specific first.
const BUNDLE_CANDIDATES = [path.join('.adk', 'bot', '.botpress', 'dist', 'index.cjs'), path.join('.botpress', 'dist', 'index.cjs'), path.join('dist', 'index.cjs')]

// Candidate SDK build binaries. Override with BRT_SDK_BUILD="<bin> <args...>".
const SDK_BIN_CANDIDATES = ['adk', 'bp']

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex')
}

export async function buildBundle(dir: string, opts: { quiet?: boolean } = {}): Promise<string> {
  const cmd = resolveBuildCommand(dir)
  if (!opts.quiet) cloudInfo(`build: ${cmd.join(' ')} (in ${dir})`)

  const [bin, ...args] = cmd
  const result = childProcess.spawnSync(bin!, args, { cwd: dir, stdio: 'inherit' })
  if (result.error) {
    throw errors.BotpressCLIError.wrap(result.error, 'SDK build failed to start')
  }
  if (result.status !== 0) {
    throw new errors.BotpressCLIError(
      `SDK build failed (exit ${result.status}). The bundler is the project's own SDK toolchain; ` +
        'ensure it is installed, or set BRT_SDK_BUILD="<bin> build".'
    )
  }

  const produced = BUNDLE_CANDIDATES.map((p) => path.join(dir, p)).find((p) => fs.existsSync(p))
  if (!produced) {
    throw new errors.BotpressCLIError(
      `build produced no bundle; looked for ${BUNDLE_CANDIDATES.join(', ')}. ` +
        'If the toolchain emits elsewhere, set BRT_BUNDLE_PATH.'
    )
  }

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.copyFileSync(produced, out)
  if (!opts.quiet) cloudInfo(`bundle -> ${ADK_BUNDLE_REL_PATH} (${fs.statSync(out).size} bytes)`)
  return out
}

function resolveBuildCommand(dir: string): string[] {
  const override = process.env['BRT_SDK_BUILD']
  if (override) {
    const parts = override.split(/\s+/).filter(Boolean)
    if (parts.length === 0) {
      throw new errors.BotpressCLIError('BRT_SDK_BUILD is set but empty')
    }
    return parts
  }

  for (const bin of SDK_BIN_CANDIDATES) {
    const local = path.join(dir, 'node_modules', '.bin', bin)
    if (fs.existsSync(local)) return [local, 'build']
    const onPath = findOnPath(bin)
    if (onPath) return [onPath, 'build']
  }
  throw new errors.BotpressCLIError(
    `no SDK build command found (tried ${SDK_BIN_CANDIDATES.join(', ')} in node_modules/.bin and PATH). ` +
      'Set BRT_SDK_BUILD="<bin> build" once the project toolchain is installed.'
  )
}

// Returns an up-to-date bundle path, building if missing or if force is set.
export async function ensureBundle(dir: string, force: boolean): Promise<string> {
  const envOverride = bundlePathOverride()
  if (envOverride) return envOverride

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  if (!force && fs.existsSync(out)) {
    cloudWarn(`reusing existing ${ADK_BUNDLE_REL_PATH} (delete it, or set BRT_SDK_BUILD, to force a rebuild)`)
    return out
  }
  return buildBundle(dir, { quiet: false })
}

// requireExistingBundle backs `brt deploy --adk --noBuild`: the caller
// explicitly opted out of building, so a missing bundle is a loud failure,
// never a silent fall-through to a build the caller asked to skip.
export function requireExistingBundle(dir: string): string {
  const envOverride = bundlePathOverride()
  if (envOverride) return envOverride

  const out = path.join(dir, ADK_BUNDLE_REL_PATH)
  if (!fs.existsSync(out)) {
    throw new errors.BotpressCLIError(`--noBuild was set but no existing bundle was found at ${out}`)
  }
  return out
}

function bundlePathOverride(): string | undefined {
  const env = process.env['BRT_BUNDLE_PATH']
  if (!env) return undefined
  if (!fs.existsSync(env)) {
    throw new errors.BotpressCLIError(`BRT_BUNDLE_PATH is set but the file is missing: ${env}`)
  }
  return env
}

function findOnPath(bin: string): string | undefined {
  const pathEnv = process.env['PATH'] ?? ''
  const exts = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
  for (const dir of pathEnv.split(path.delimiter)) {
    if (!dir) continue
    for (const ext of exts) {
      const candidate = path.join(dir, bin + ext)
      if (fs.existsSync(candidate) && isExecutable(candidate)) return candidate
    }
  }
  return undefined
}

function isExecutable(p: string): boolean {
  try {
    fs.accessSync(p, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}
