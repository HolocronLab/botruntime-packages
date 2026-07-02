import * as fs from 'fs/promises'
import * as path from 'path'
import { dependencyStateSchema, type DependencyStateData, type Environment } from './types.js'
import { DependencyError } from './errors.js'

export class LegacyDependencyLockFile {
  private readonly filePath: string
  private readonly env: Environment

  constructor(opts: { projectPath: string; env: Environment }) {
    this.env = opts.env
    this.filePath = path.join(opts.projectPath, `dependencies.${opts.env}.lock.json`)
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this.filePath)
      return true
    } catch {
      return false
    }
  }

  async read(options?: { tolerant?: boolean }): Promise<DependencyStateData> {
    let raw: string
    try {
      raw = await fs.readFile(this.filePath, 'utf8')
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return dependencyStateSchema.parse({ version: 1, env: this.env })
      }
      throw err
    }

    try {
      return dependencyStateSchema.parse(JSON.parse(raw))
    } catch (err) {
      if (options?.tolerant) {
        return dependencyStateSchema.parse({ version: 1, env: this.env })
      }
      throw new DependencyError({
        code: 'INVALID_CONFIG',
        message: `Legacy dependency lock at ${this.filePath} failed schema validation`,
        details: { issues: (err as { issues?: unknown }).issues ?? String(err) },
      })
    }
  }

  async delete(): Promise<void> {
    try {
      await fs.unlink(this.filePath)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }
}
