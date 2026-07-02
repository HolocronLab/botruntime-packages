import { existsSync } from 'fs'
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
export const BP_CLI_VERSION = __BP_CLI_VERSION__
export const BP_CLI_INSTALL_ALL = path.join(os.homedir(), '.adk', `bp-cli`)
export const BP_CLI_INSTALL_DIR = path.join(BP_CLI_INSTALL_ALL, BP_CLI_VERSION)
export const BP_CLI_BIN_PATH = path.join(BP_CLI_INSTALL_DIR, 'node_modules', '@holocronlab', 'brt', 'bin.js')

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

/**
 * Get bp CLI info (path and version)
 */
export function getBpCli(): BpCliInfo {
  debug('getBpCli() called')
  debug('checking if BP_CLI_BIN_PATH exists: %s', BP_CLI_BIN_PATH)

  const exists = existsSync(BP_CLI_BIN_PATH)
  debug('BP_CLI_BIN_PATH exists=%s', exists)

  if (!exists) {
    debug('ERROR: bp CLI not found at expected path')
    throw new AdkError({
      code: 'INTERNAL_BP_CLI_MISSING',
      message: `@holocronlab/brt version ${BP_CLI_VERSION} is not installed in the ADK directory "${BP_CLI_INSTALL_DIR}". This is a bug, please report it upstream.`,
      expected: false,
    })
  }

  const info = {
    path: BP_CLI_BIN_PATH,
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
