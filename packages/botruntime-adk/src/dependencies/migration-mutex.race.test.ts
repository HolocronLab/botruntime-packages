import * as crypto from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const raceProbe = vi.hoisted(() => ({
  enabled: false,
  finalUnlinks: 0,
  bothUnlinksEntered: Promise.resolve(),
  resolveBothUnlinksEntered: (() => {}) as () => void,
  successorPublished: Promise.resolve(),
  resolveSuccessorPublished: (() => {}) as () => void,
}))

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    link: async (existingPath: fs.PathLike, newPath: fs.PathLike) => {
      const result = await actual.link(existingPath, newPath)
      if (raceProbe.enabled && String(newPath).endsWith(`${path.sep}migration.lock`)) {
        raceProbe.resolveSuccessorPublished()
      }
      return result
    },
    unlink: async (filePath: fs.PathLike) => {
      if (raceProbe.enabled && String(filePath).endsWith(`${path.sep}migration.lock`)) {
        raceProbe.finalUnlinks += 1
        if (raceProbe.finalUnlinks === 1) {
          await Promise.race([
            raceProbe.bothUnlinksEntered,
            new Promise<void>((resolve) => setTimeout(resolve, 50)),
          ])
        } else if (raceProbe.finalUnlinks === 2) {
          raceProbe.resolveBothUnlinksEntered()
          await raceProbe.successorPublished
        }
      }
      return actual.unlink(filePath)
    },
  }
})

import {
  acquireDependencyMigrationLock,
  type DependencyMigrationLock,
} from './migration-mutex.js'

describe('dependency migration stale-owner takeover', () => {
  let projectPath: string

  beforeEach(() => {
    projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'adk-migration-mutex-race-'))
    const dependenciesDir = path.join(projectPath, '.adk', 'dependencies')
    fs.mkdirSync(dependenciesDir, { recursive: true })
    fs.writeFileSync(
      path.join(dependenciesDir, 'migration.lock'),
      `${JSON.stringify(
        {
          version: 1,
          token: crypto.randomUUID(),
          pid: 2_147_483_647,
          hostname: os.hostname(),
          startedAt: new Date().toISOString(),
        },
        null,
        2
      )}\n`
    )

    let resolveBoth!: () => void
    let resolveSuccessor!: () => void
    raceProbe.enabled = true
    raceProbe.finalUnlinks = 0
    raceProbe.bothUnlinksEntered = new Promise<void>((resolve) => {
      resolveBoth = resolve
    })
    raceProbe.resolveBothUnlinksEntered = resolveBoth
    raceProbe.successorPublished = new Promise<void>((resolve) => {
      resolveSuccessor = resolve
    })
    raceProbe.resolveSuccessorPublished = resolveSuccessor

    vi.spyOn(process, 'kill').mockImplementation(((pid: number) => {
      if (pid === 2_147_483_647) {
        throw Object.assign(new Error('no such process'), { code: 'ESRCH' })
      }
      return true
    }) as typeof process.kill)
  })

  afterEach(() => {
    raceProbe.enabled = false
    fs.rmSync(projectPath, { recursive: true, force: true })
    vi.restoreAllMocks()
  })

  it('allows exactly one successor when two processes recover the same dead owner', async () => {
    const outcomes = await Promise.allSettled([
      acquireDependencyMigrationLock(projectPath),
      acquireDependencyMigrationLock(projectPath),
    ])

    const acquired = outcomes.filter(
      (outcome): outcome is PromiseFulfilledResult<DependencyMigrationLock> => outcome.status === 'fulfilled'
    )
    const rejected = outcomes.filter(
      (outcome): outcome is PromiseRejectedResult => outcome.status === 'rejected'
    )
    expect(acquired).toHaveLength(1)
    expect(rejected).toHaveLength(1)

    const lockPath = path.join(projectPath, '.adk', 'dependencies', 'migration.lock')
    const finalOwner = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    expect(finalOwner.token).toBe(acquired[0]!.value.owner.token)

    await acquired[0]!.value.release()
    expect(fs.existsSync(lockPath)).toBe(false)
  })

  it('preserves an unfinished recovery claim and fails closed', async () => {
    raceProbe.enabled = false
    const dependenciesDir = path.join(projectPath, '.adk', 'dependencies')
    const recoveryPath = path.join(dependenciesDir, 'migration.lock.recovery')
    const recoveryRaw = `${JSON.stringify(
      {
        version: 1,
        token: crypto.randomUUID(),
        pid: 2_147_483_647,
        hostname: os.hostname(),
        startedAt: new Date().toISOString(),
      },
      null,
      2
    )}\n`
    fs.writeFileSync(recoveryPath, recoveryRaw)

    await expect(acquireDependencyMigrationLock(projectPath)).rejects.toThrow(/recovery claim|preserved/i)

    expect(fs.readFileSync(recoveryPath, 'utf8')).toBe(recoveryRaw)
    expect(fs.existsSync(path.join(dependenciesDir, 'migration.lock'))).toBe(true)
  })
})
