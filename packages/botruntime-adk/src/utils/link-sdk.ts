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
 * Reconciles one generated-project package link with the package selected by
 * the owning agent dependency graph. Generated `.adk/bot` is a managed cache,
 * so a stale link must be replaced instead of silently preserving an older
 * runtime train.
 */
async function ensurePackageLink(sourcePath: string, targetPath: string): Promise<void> {
  const sourceRealPath = realpathSync(sourcePath)
  try {
    if (realpathSync(targetPath) === sourceRealPath) {
      return
    }
  } catch {
    // Missing and dangling targets are both repaired below.
  }

  if (await lexists(targetPath)) {
    const target = await fs.lstat(targetPath)
    if (!target.isSymbolicLink()) {
      throw new Error(
        `Refusing to replace unmanaged generated dependency path: ${targetPath}. Remove the generated .adk/bot cache and retry.`
      )
    }
  }

  await fs.mkdir(path.dirname(targetPath), { recursive: true })
  const temporaryPath = `${targetPath}.tmp-${process.pid}-${Date.now()}`
  if (await lexists(temporaryPath)) {
    await fs.rm(temporaryPath, { recursive: true, force: true })
  }

  const symlinkType = process.platform === 'win32' ? 'junction' : undefined
  await fs.symlink(sourceRealPath, temporaryPath, symlinkType)
  try {
    await fs.rename(temporaryPath, targetPath)
  } catch (error) {
    // POSIX rename replaces a symlink atomically. Windows junction replacement
    // can fail, but deleting the observed target would introduce a destructive
    // TOCTOU window. Fail closed and let the caller recreate the managed cache.
    await fs.rm(temporaryPath, { recursive: true, force: true })
    throw error
  }
}

async function assertPackageLink(sourcePath: string, targetPath: string): Promise<void> {
  let actualRealPath: string
  try {
    actualRealPath = realpathSync(targetPath)
  } catch {
    throw new Error(`Generated dependency link is missing or dangling after reconciliation: ${targetPath}`)
  }
  const expectedRealPath = realpathSync(sourcePath)
  if (actualRealPath !== expectedRealPath) {
    throw new Error(
      `Generated dependency link changed during reconciliation: ${targetPath} resolves to ${actualRealPath}, expected ${expectedRealPath}`
    )
  }
}

async function readPackageIdentity(packagePath: string): Promise<{ name: string; version: string }> {
  const manifestPath = path.join(packagePath, 'package.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
    name?: unknown
    version?: unknown
  }
  if (typeof manifest.name !== 'string' || typeof manifest.version !== 'string') {
    throw new Error(`Generated dependency has no valid package identity: ${manifestPath}`)
  }
  return { name: manifest.name, version: manifest.version }
}

async function reconcileGeneratedManifest(
  botDir: string,
  dependencies: Array<{ name: string; version: string }>
): Promise<void> {
  const manifestPath = path.join(botDir, 'package.json')
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  manifest.dependencies = {
    ...manifest.dependencies,
    ...Object.fromEntries(dependencies.map(({ name, version }) => [name, version])),
  }
  const temporaryPath = `${manifestPath}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  await fs.rename(temporaryPath, manifestPath)
}

/**
 * Links the generated bot's declared runtime dependencies from the agent's
 * isolated dependency graph into `.adk/bot/node_modules`.
 *
 * The generated source imports both `@holocronlab/botruntime-runtime` and
 * `@holocronlab/botruntime-sdk`. Bun's isolated workspace linker deliberately
 * does not expose the runtime's transitive SDK to the agent or its nested
 * generated project, so relying on hoisting is not a valid package contract.
 *
 * The linking strategy:
 * 1. Resolve the runtime selected by the agent.
 * 2. Resolve the SDK from that runtime's dependency graph.
 * 3. Reconcile exact links for both declared Holocron packages.
 * 4. Record the exact selected versions in the generated manifest without
 *    performing a second package-manager install.
 */
export async function linkGeneratedRuntimeDependencies(agentDir: string, botDir: string): Promise<void> {
  const runtimePath = findPackage('@holocronlab/botruntime-runtime', agentDir)
  if (!runtimePath) {
    throw new Error(
      'Generated bot requires @holocronlab/botruntime-runtime in the agent dependency graph. Run bun install with a coherent BRT/ADK/runtime release train.'
    )
  }

  const sdkPath = findPackage('@holocronlab/botruntime-sdk', runtimePath)
  if (!sdkPath) {
    throw new Error(
      `Generated bot requires @holocronlab/botruntime-sdk from the selected runtime dependency graph (${runtimePath}). Run bun install with a coherent BRT/ADK/runtime release train.`
    )
  }

  const [runtimeIdentity, sdkIdentity] = await Promise.all([
    readPackageIdentity(runtimePath),
    readPackageIdentity(sdkPath),
  ])
  if (runtimeIdentity.name !== '@holocronlab/botruntime-runtime') {
    throw new Error(`Resolved unexpected runtime package: ${runtimeIdentity.name}`)
  }
  if (sdkIdentity.name !== '@holocronlab/botruntime-sdk') {
    throw new Error(`Resolved unexpected SDK package: ${sdkIdentity.name}`)
  }

  await Promise.all([
    ensurePackageLink(
      runtimePath,
      path.join(botDir, 'node_modules', '@holocronlab', 'botruntime-runtime')
    ),
    ensurePackageLink(
      sdkPath,
      path.join(botDir, 'node_modules', '@holocronlab', 'botruntime-sdk')
    ),
  ])
  await reconcileGeneratedManifest(botDir, [runtimeIdentity, sdkIdentity])

  const runtimeTarget = path.join(
    botDir,
    'node_modules',
    '@holocronlab',
    'botruntime-runtime'
  )
  const sdkTarget = path.join(
    botDir,
    'node_modules',
    '@holocronlab',
    'botruntime-sdk'
  )
  await Promise.all([
    assertPackageLink(runtimePath, runtimeTarget),
    assertPackageLink(sdkPath, sdkTarget),
  ])
  const generatedManifest = JSON.parse(
    await fs.readFile(path.join(botDir, 'package.json'), 'utf8')
  ) as { dependencies?: Record<string, string> }
  for (const dependency of [runtimeIdentity, sdkIdentity]) {
    if (generatedManifest.dependencies?.[dependency.name] !== dependency.version) {
      throw new Error(
        `Generated dependency declaration changed during reconciliation: ${dependency.name}`
      )
    }
  }
}

/** @deprecated Use linkGeneratedRuntimeDependencies. */
export const linkSdk = linkGeneratedRuntimeDependencies
