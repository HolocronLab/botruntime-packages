import { existsSync, realpathSync } from 'fs'
import fs from 'fs/promises'
import path from 'path'

async function lexists(p: string): Promise<boolean> {
  try {
    await fs.lstat(p)
    return true
  } catch (err) {
    // Only treat "not found" as not-exists. Other errors (e.g. EACCES) should
    // surface so we don't silently skip cleanup and then fail with a confusing
    // EEXIST from fs.symlink below.
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }
    throw err
  }
}

/**
 * Finds a package by name by walking up the directory tree looking in node_modules.
 * If startDir is a symlink (common with pnpm), it will resolve the real path first.
 */
function findPackage(name: string, startDir: string): string | null {
  // Resolve symlinks to handle pnpm's node_modules structure
  let current: string
  try {
    current = realpathSync(startDir)
  } catch {
    current = startDir
  }

  while (current !== path.dirname(current)) {
    const pkgPath = path.join(current, 'node_modules', name)
    if (existsSync(pkgPath)) {
      return pkgPath
    }
    current = path.dirname(current)
  }
  return null
}

/**
 * Links @holocronlab/botruntime-sdk from the agent's node_modules to .adk/bot/node_modules
 *
 * This ensures that the generated bot project can resolve @holocronlab/botruntime-sdk
 * using the same version that @holocronlab/botruntime-runtime depends on.
 *
 * The linking strategy:
 * 1. If .adk/bot/node_modules/@holocronlab/botruntime-sdk already exists, do nothing
 * 2. Find @holocronlab/botruntime-runtime from the agent directory
 * 3. Find @holocronlab/botruntime-sdk from the runtime's location (either nested or by walking up)
 * 4. Create a symlink in .adk/bot/node_modules/@holocronlab/botruntime-sdk pointing to the found SDK
 */
export async function linkSdk(agentDir: string, botDir: string): Promise<void> {
  const targetSdkPath = path.join(botDir, 'node_modules', '@botpress', 'sdk')

  // If a real SDK already exists at the target, we're done. existsSync follows
  // symlinks, so it returns false for broken symlinks left over from a prior
  // run (e.g. node_modules wiped) — we have to handle that case explicitly
  // below, otherwise fs.symlink fails with EEXIST.
  if (existsSync(targetSdkPath)) {
    return
  }

  // Find @holocronlab/botruntime-runtime from the agent directory
  const runtimePath = findPackage('@holocronlab/botruntime-runtime', agentDir)
  if (!runtimePath) {
    console.warn('Warning: Could not find @holocronlab/botruntime-runtime in agent directory')
    return
  }

  // Find @holocronlab/botruntime-sdk from the runtime's location
  // First try nested (runtime might have its own node_modules)
  // Then try walking up from runtime
  let sdkPath = findPackage('@holocronlab/botruntime-sdk', runtimePath)

  if (!sdkPath) {
    console.warn(`Warning: Could not find @holocronlab/botruntime-sdk from @holocronlab/botruntime-runtime location (${runtimePath})`)
    return
  }

  // Create the target directory structure
  const targetBotpressDir = path.join(botDir, 'node_modules', '@botpress')
  await fs.mkdir(targetBotpressDir, { recursive: true })

  // If there's a dangling symlink (or any file) at the target, remove it
  // before creating the new symlink. lstat detects the link itself instead
  // of following it, which is what we need to catch broken symlinks.
  if (await lexists(targetSdkPath)) {
    await fs.rm(targetSdkPath, { force: true })
  }

  // Create symlink - use 'dir' on Windows, default (no type) on Unix/macOS
  const symlinkType = process.platform === 'win32' ? 'junction' : undefined
  await fs.symlink(sdkPath, targetSdkPath, symlinkType)
}
