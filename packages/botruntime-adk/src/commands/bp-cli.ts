import { readFileSync, realpathSync, statSync } from 'fs'
import os from 'os'
import path from 'path'
import createDebug from 'debug'
import { AdkError } from '@holocronlab/botruntime-analytics'

const debug = createDebug('adk:bp-cli')

export interface BpCliInfo {
  path: string
  version: string
}

// This constant is injected at build time by esbuild's define
declare const __BP_CLI_VERSION__: string

// BP_CLI_* names are kept for minimal diff against upstream; the CLI they now
// point at is @holocronlab/brt (a full fork of the former upstream Botpress
// CLI package), not the original upstream CLI.
export const BP_CLI_VERSION =
  typeof __BP_CLI_VERSION__ === 'undefined'
    ? ((globalThis as { __BP_CLI_VERSION__?: string }).__BP_CLI_VERSION__ ?? '0.0.0')
    : __BP_CLI_VERSION__
export const BP_CLI_INSTALL_ALL = path.join(os.homedir(), '.adk', `bp-cli`)
export const BP_CLI_INSTALL_DIR = path.join(BP_CLI_INSTALL_ALL, BP_CLI_VERSION)
export const BP_CLI_PACKAGE_DIR = path.join(
  BP_CLI_INSTALL_DIR,
  'node_modules',
  '@holocronlab',
  'brt'
)
// Compatibility-only nominal path for callers that imported the old constant.
// getBpCli() resolves package.json#bin at runtime and does not trust this path.
export const BP_CLI_BIN_PATH = path.join(BP_CLI_PACKAGE_DIR, 'src', 'cli.ts')

const BP_CLIENT_ENV_KEYS = [
  'BP_API_URL',
  'BP_TOKEN',
  'BP_WORKSPACE_ID',
  'BP_BOT_ID',
  'BP_INTEGRATION_ID',
  'BP_INTEGRATION_ALIAS',
] as const

debug('BP_CLI_VERSION=%s (injected at build time)', BP_CLI_VERSION)
debug('BP_CLI_INSTALL_ALL=%s', BP_CLI_INSTALL_ALL)
debug('BP_CLI_INSTALL_DIR=%s', BP_CLI_INSTALL_DIR)
debug('BP_CLI_BIN_PATH=%s', BP_CLI_BIN_PATH)

type BpCliPackageManifest = {
  name?: unknown
  version?: unknown
  bin?: unknown
}

function bpCliMissing(expectedVersion: string, installDir: string, reason: string): AdkError {
  debug('invalid @holocronlab/brt installation: %s', reason)
  return new AdkError({
    code: 'INTERNAL_BP_CLI_MISSING',
    message: `@holocronlab/brt version ${expectedVersion} is not installed correctly in the ADK directory "${installDir}". This is a bug, please report it upstream.`,
    expected: false,
  })
}

function isPathInside(parentPath: string, childPath: string): boolean {
  const relative = path.relative(parentPath, childPath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

/**
 * Resolve the executable declared by the installed BRT package itself.
 *
 * The package manifest is the canonical CLI contract. This deliberately avoids
 * hard-coding an internal filename such as bin.js and validates both the
 * package version and the resolved real path before executing it.
 */
export function resolveBpCliBinPath(
  installDir: string = BP_CLI_INSTALL_DIR,
  expectedVersion: string = BP_CLI_VERSION
): string {
  const packageDir = path.join(installDir, 'node_modules', '@holocronlab', 'brt')
  const manifestPath = path.join(packageDir, 'package.json')
  let manifest: BpCliPackageManifest

  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as BpCliPackageManifest
  } catch (error) {
    throw bpCliMissing(expectedVersion, installDir, `cannot read ${manifestPath}: ${String(error)}`)
  }

  if (manifest.name !== '@holocronlab/brt') {
    throw bpCliMissing(expectedVersion, installDir, `unexpected package name ${String(manifest.name)}`)
  }
  if (manifest.version !== expectedVersion) {
    throw bpCliMissing(
      expectedVersion,
      installDir,
      `installed version ${String(manifest.version)} does not match ${expectedVersion}`
    )
  }

  const declaredBin =
    typeof manifest.bin === 'string'
      ? manifest.bin
      : manifest.bin &&
          typeof manifest.bin === 'object' &&
          !Array.isArray(manifest.bin) &&
          typeof (manifest.bin as Record<string, unknown>).brt === 'string'
        ? (manifest.bin as Record<string, string>).brt
        : undefined
  if (!declaredBin) {
    throw bpCliMissing(expectedVersion, installDir, 'package.json does not declare bin.brt')
  }

  const binPath = path.resolve(packageDir, declaredBin)
  if (!isPathInside(packageDir, binPath)) {
    throw bpCliMissing(expectedVersion, installDir, `bin.brt escapes the package directory: ${declaredBin}`)
  }

  try {
    const realPackageDir = realpathSync(packageDir)
    const realBinPath = realpathSync(binPath)
    if (!isPathInside(realPackageDir, realBinPath)) {
      throw bpCliMissing(expectedVersion, installDir, `bin.brt resolves outside the package directory: ${declaredBin}`)
    }
    if (!statSync(realBinPath).isFile()) {
      throw bpCliMissing(expectedVersion, installDir, `bin.brt is not a file: ${declaredBin}`)
    }
    return realBinPath
  } catch (error) {
    if (error instanceof AdkError) throw error
    throw bpCliMissing(expectedVersion, installDir, `cannot resolve bin.brt ${declaredBin}: ${String(error)}`)
  }
}

/**
 * Get bp CLI info (path and version)
 */
export function getBpCli(): BpCliInfo {
  debug('getBpCli() called')
  const resolvedPath = resolveBpCliBinPath()

  const info = {
    path: resolvedPath,
    version: BP_CLI_VERSION,
  }

  debug('returning BpCliInfo: %O', info)
  return info
}

export function getBpCliEnvironment(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  // Callers must pass this with execa's extendEnv: false; otherwise execa merges
  // process.env back in after these stale Botpress client keys are removed.
  const env = { ...process.env }

  for (const key of BP_CLIENT_ENV_KEYS) {
    delete env[key]
  }

  return {
    ...env,
    ...overrides,
  }
}
