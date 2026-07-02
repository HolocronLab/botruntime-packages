import { createHash } from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import { chmod, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import type { Agent0ProjectPaths } from '../types.js'

const PROJECT_HASH_LENGTH = 32
const OWNER_ONLY_DIR_MODE = 0o700

export interface Agent0PathOptions {
  homeDir?: string
}

export function getAgent0HomeDir(options: Agent0PathOptions = {}): string {
  return join(options.homeDir ?? process.env.HOME ?? homedir(), '.adk', 'agent0')
}

export function getAgent0ConfigPath(options: Agent0PathOptions = {}): string {
  return join(getAgent0HomeDir(options), 'config.json')
}

export async function ensureAgent0Directory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true, mode: OWNER_ONLY_DIR_MODE })
  await chmod(dirPath, OWNER_ONLY_DIR_MODE)
}

export function canonicalizeAgent0ProjectPath(projectPath: string): string {
  const resolved = resolve(projectPath)
  return existsSync(resolved) ? realpathSync(resolved) : resolved
}

export function getAgent0ProjectHash(projectPath: string): string {
  return createHash('sha256')
    .update(canonicalizeAgent0ProjectPath(projectPath))
    .digest('hex')
    .slice(0, PROJECT_HASH_LENGTH)
}

export function getAgent0ProjectPaths(projectPath: string, options: Agent0PathOptions = {}): Agent0ProjectPaths {
  const canonicalProjectPath = canonicalizeAgent0ProjectPath(projectPath)
  const projectHash = getAgent0ProjectHash(canonicalProjectPath)
  const rootDir = join(getAgent0HomeDir(options), 'projects', projectHash)
  const xdgConfigHome = join(rootDir, 'xdg', 'config')
  const xdgDataHome = join(rootDir, 'xdg', 'data')
  const xdgCacheHome = join(rootDir, 'xdg', 'cache')
  const xdgStateHome = join(rootDir, 'xdg', 'state')
  const fakeHomeDir = join(rootDir, 'home')

  return {
    projectHash,
    canonicalProjectPath,
    rootDir,
    xdgConfigHome,
    xdgDataHome,
    xdgCacheHome,
    xdgStateHome,
    fakeHomeDir,
    engineBinDir: join(rootDir, 'bin'),
    engineConfigDir: join(xdgConfigHome, 'opencode'),
    engineDataDir: join(xdgDataHome, 'opencode'),
    sessionsDir: join(xdgStateHome, 'sessions'),
  }
}

export async function ensureAgent0ProjectDirs(projectPath: string, options: Agent0PathOptions = {}) {
  const paths = getAgent0ProjectPaths(projectPath, options)
  await Promise.all([
    ensureAgent0Directory(paths.rootDir),
    ensureAgent0Directory(join(paths.rootDir, 'xdg')),
    ensureAgent0Directory(paths.xdgConfigHome),
    ensureAgent0Directory(paths.xdgDataHome),
    ensureAgent0Directory(paths.xdgCacheHome),
    ensureAgent0Directory(paths.xdgStateHome),
    ensureAgent0Directory(paths.fakeHomeDir),
    ensureAgent0Directory(paths.engineBinDir),
    ensureAgent0Directory(paths.engineConfigDir),
    ensureAgent0Directory(paths.engineDataDir),
    ensureAgent0Directory(paths.sessionsDir),
  ])
  return paths
}
