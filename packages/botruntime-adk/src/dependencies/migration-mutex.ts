import crypto from 'crypto'
import * as fs from 'fs/promises'
import os from 'os'
import path from 'path'
import { DependencyError } from './errors.js'

const LOCK_VERSION = 1 as const
const LOCK_FILE_NAME = 'migration.lock'
const RECOVERY_FILE_NAME = 'migration.lock.recovery'

export interface DependencyMigrationLockOwner {
  version: typeof LOCK_VERSION
  token: string
  pid: number
  hostname: string
  startedAt: string
}

export interface DependencyMigrationLock {
  path: string
  owner: DependencyMigrationLockOwner
  release(): Promise<void>
}

export async function withDependencyMigrationLock<T>(
  projectPath: string,
  run: (lock: DependencyMigrationLock) => Promise<T>
): Promise<T> {
  const lock = await acquireDependencyMigrationLock(projectPath)
  let primaryError: unknown
  try {
    return await run(lock)
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    try {
      await lock.release()
    } catch (releaseError) {
      if (primaryError === undefined) throw releaseError
    }
  }
}

export async function acquireDependencyMigrationLock(projectPath: string): Promise<DependencyMigrationLock> {
  const dependenciesDir = path.join(projectPath, '.adk', 'dependencies')
  const lockPath = path.join(dependenciesDir, LOCK_FILE_NAME)
  const recoveryPath = path.join(dependenciesDir, RECOVERY_FILE_NAME)
  await fs.mkdir(dependenciesDir, { recursive: true })

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const recovery = await recoverStaleOwnerIfPresent(lockPath, recoveryPath, dependenciesDir)

    const owner: DependencyMigrationLockOwner = {
      version: LOCK_VERSION,
      token: crypto.randomUUID(),
      pid: process.pid,
      hostname: os.hostname(),
      startedAt: new Date().toISOString(),
    }

    try {
      await publishOwnerExclusive({ dependenciesDir, lockPath, owner })
    } catch (error) {
      await recovery?.release()
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      // Another process won the race between the preflight read and publication.
      // The next iteration inspects that fully published owner before trying again.
      continue
    }

    try {
      await recovery?.release()
    } catch (error) {
      // Do not leave an apparently active owner behind when its takeover claim
      // could not be retired. The claim itself remains as a fail-closed signal.
      await releaseOwnedLock(lockPath, owner.token).catch(() => {})
      throw error
    }

    return {
      path: lockPath,
      owner,
      release: () => releaseOwnedLock(lockPath, owner.token),
    }
  }

  throw lockError(`Could not acquire dependency migration lock at ${lockPath}.`)
}

interface DependencyMigrationRecoveryClaim {
  release(): Promise<void>
}

async function recoverStaleOwnerIfPresent(
  lockPath: string,
  recoveryPath: string,
  dependenciesDir: string
): Promise<DependencyMigrationRecoveryClaim | null> {
  await assertNoRecoveryClaim(recoveryPath, lockPath)

  let existing: Awaited<ReturnType<typeof readStrictOwner>>
  try {
    existing = await readStrictOwner(lockPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      // A stale-owner winner may be between unlinking the dead owner and
      // publishing its successor. Its fixed claim closes that empty-path gap.
      await assertNoRecoveryClaim(recoveryPath, lockPath)
      return null
    }
    throw error
  }

  if (existing.owner.hostname !== os.hostname()) {
    throw lockError(
      `Dependency migration is locked by pid ${existing.owner.pid} on host ${existing.owner.hostname}. ` +
        `The lock is preserved at ${lockPath}.`
    )
  }

  if (isProcessAlive(existing.owner.pid)) {
    throw lockError(
      `Dependency migration is already running in pid ${existing.owner.pid}. ` +
        `The active lock is ${lockPath}.`
    )
  }

  try {
    await fs.link(lockPath, recoveryPath)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'EEXIST') {
      throw lockError(
        `Dependency migration stale-owner recovery is already in progress at ${recoveryPath}; it was preserved.`
      )
    }
    if (code === 'ENOENT') {
      throw lockError(`Dependency migration lock changed before stale-owner recovery could claim it: ${lockPath}.`)
    }
    throw error
  }

  let claimed = true
  try {
    const [claim, current, claimStat, currentStat] = await Promise.all([
      readStrictOwner(recoveryPath),
      readStrictOwner(lockPath),
      fs.stat(recoveryPath),
      fs.stat(lockPath),
    ])
    if (
      claim.raw !== existing.raw ||
      claim.owner.token !== existing.owner.token ||
      current.raw !== existing.raw ||
      current.owner.token !== existing.owner.token ||
      claimStat.dev !== currentStat.dev ||
      claimStat.ino !== currentStat.ino
    ) {
      throw lockError(`Dependency migration lock changed while stale-owner recovery was being claimed: ${lockPath}.`)
    }

    await fs.unlink(lockPath)
    await syncDirectoryBestEffort(dependenciesDir)
    return {
      release: async () => {
        if (!claimed) return
        const claimNow = await readStrictOwner(recoveryPath)
        if (claimNow.raw !== existing.raw || claimNow.owner.token !== existing.owner.token) {
          throw lockError(`Dependency migration recovery claim changed before release: ${recoveryPath}.`)
        }
        await fs.unlink(recoveryPath)
        claimed = false
        await syncDirectoryBestEffort(dependenciesDir)
      },
    }
  } catch (error) {
    if (claimed) {
      await releaseRecoveryClaimIfOwned(recoveryPath, existing).catch(() => {})
      claimed = false
    }
    throw error
  }
}

async function assertNoRecoveryClaim(recoveryPath: string, lockPath: string): Promise<void> {
  try {
    await fs.access(recoveryPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  throw lockError(
    `Dependency migration has an unfinished stale-owner recovery claim at ${recoveryPath}. ` +
      `It was preserved; inspect it together with ${lockPath} before manual recovery.`
  )
}

async function releaseRecoveryClaimIfOwned(
  recoveryPath: string,
  expected: Awaited<ReturnType<typeof readStrictOwner>>
): Promise<void> {
  let current: Awaited<ReturnType<typeof readStrictOwner>>
  try {
    current = await readStrictOwner(recoveryPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (current.raw !== expected.raw || current.owner.token !== expected.owner.token) return
  await fs.unlink(recoveryPath)
}

async function publishOwnerExclusive(opts: {
  dependenciesDir: string
  lockPath: string
  owner: DependencyMigrationLockOwner
}): Promise<void> {
  const tmp = `${opts.lockPath}.create-${process.pid}-${Date.now()}-${crypto.randomUUID()}`
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(tmp, 'wx', 0o600)
    await handle.writeFile(`${JSON.stringify(opts.owner, null, 2)}\n`, 'utf8')
    await handle.sync()
    await handle.close()
    handle = undefined
    await fs.link(tmp, opts.lockPath)
    await fs.unlink(tmp)
    await syncDirectoryBestEffort(opts.dependenciesDir)
  } catch (error) {
    await handle?.close().catch(() => {})
    await fs.unlink(tmp).catch(() => {})
    throw error
  }
}

async function releaseOwnedLock(lockPath: string, token: string): Promise<void> {
  let first: { raw: string; owner: DependencyMigrationLockOwner }
  try {
    first = await readStrictOwner(lockPath)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  if (first.owner.token !== token) return

  const current = await readStrictOwner(lockPath)
  if (current.raw !== first.raw || current.owner.token !== token) return
  await fs.unlink(lockPath).catch((error) => {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  })
  await syncDirectoryBestEffort(path.dirname(lockPath))
}

async function readStrictOwner(
  lockPath: string
): Promise<{ raw: string; owner: DependencyMigrationLockOwner }> {
  const raw = await fs.readFile(lockPath, 'utf8')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch (error) {
    throw lockError(`Dependency migration lock owner is corrupt at ${lockPath}; it was preserved.`, error)
  }
  if (!isLockOwner(value)) {
    throw lockError(`Dependency migration lock owner is invalid at ${lockPath}; it was preserved.`)
  }
  return { raw, owner: value }
}

function isLockOwner(value: unknown): value is DependencyMigrationLockOwner {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  return (
    Object.keys(record).sort().join(',') === 'hostname,pid,startedAt,token,version' &&
    record.version === LOCK_VERSION &&
    typeof record.token === 'string' &&
    record.token.length > 0 &&
    typeof record.pid === 'number' &&
    Number.isSafeInteger(record.pid) &&
    record.pid > 0 &&
    typeof record.hostname === 'string' &&
    record.hostname.length > 0 &&
    typeof record.startedAt === 'string' &&
    !Number.isNaN(Date.parse(record.startedAt))
  )
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    if (code === 'EPERM') return true
    throw error
  }
}

async function syncDirectoryBestEffort(dirPath: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  try {
    handle = await fs.open(dirPath, 'r')
    await handle.sync()
  } catch {
    // Directory fsync is unsupported on some platforms. The owner file itself
    // is fsynced before its atomic hard-link publication.
  } finally {
    await handle?.close().catch(() => {})
  }
}

function lockError(message: string, cause?: unknown): DependencyError {
  return new DependencyError({
    code: 'INVALID_CONFIG',
    message,
    ...(cause === undefined ? {} : { details: { cause: String(cause) } }),
  })
}
