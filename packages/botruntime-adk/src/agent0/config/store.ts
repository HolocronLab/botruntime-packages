import { readFile, rename, writeFile, chmod } from 'node:fs/promises'
import { dirname } from 'node:path'
import { AdkError } from '@holocronlab/botruntime-analytics'
import type { Agent0Config } from '../types.js'
import { ensureAgent0Directory, getAgent0ConfigPath, type Agent0PathOptions } from './paths.js'
import { createDefaultAgent0Config, parseAgent0Config } from './schema.js'

export type Agent0ConfigErrorCode = 'AGENT0_CONFIG_READ_FAILED' | 'AGENT0_CONFIG_INVALID'

/**
 * The Agent(0) config file is user-owned (hand-editable, on-disk), so both
 * read and parse failures are expected user/environment conditions.
 */
export class Agent0ConfigError extends AdkError<Agent0ConfigErrorCode> {
  constructor(message: string, cause?: unknown, code: Agent0ConfigErrorCode = 'AGENT0_CONFIG_INVALID') {
    super({ code, message, expected: true, cause })
  }
}

export interface Agent0ConfigStoreOptions extends Agent0PathOptions {
  configPath?: string
  now?: () => Date
}

export class Agent0ConfigStore {
  readonly configPath: string
  private readonly now: () => Date
  private writeLock: Promise<void> = Promise.resolve()

  constructor(options: Agent0ConfigStoreOptions = {}) {
    this.configPath = options.configPath ?? getAgent0ConfigPath(options)
    this.now = options.now ?? (() => new Date())
  }

  async read(): Promise<Agent0Config> {
    let content: string
    try {
      content = await readFile(this.configPath, 'utf-8')
    } catch (error) {
      if (isFileNotFoundError(error)) return createDefaultAgent0Config(this.now())
      throw new Agent0ConfigError(
        `Failed to read Agent(0) config at ${this.configPath}`,
        error,
        'AGENT0_CONFIG_READ_FAILED'
      )
    }

    try {
      return parseAgent0Config(JSON.parse(content))
    } catch (error) {
      throw new Agent0ConfigError(`Invalid Agent(0) config at ${this.configPath}`, error)
    }
  }

  async write(config: Agent0Config): Promise<void> {
    const parsed = parseAgent0Config(config)
    await writeOwnerOnlyJson(this.configPath, parsed)
  }

  async reset(): Promise<Agent0Config> {
    const config = createDefaultAgent0Config(this.now())
    await this.write(config)
    return config
  }

  async update(updater: (config: Agent0Config) => Agent0Config | void): Promise<Agent0Config> {
    const result = this.writeLock.then(async () => {
      const current = await this.read()
      const draft = structuredClone(current)
      const updated = updater(draft) ?? draft
      const next = parseAgent0Config({
        ...updated,
        updatedAt: this.now().toISOString(),
      })
      await this.write(next)
      return next
    })
    this.writeLock = result.then(
      () => {},
      () => {}
    )
    return result
  }
}

async function writeOwnerOnlyJson(filePath: string, value: unknown): Promise<void> {
  await ensureAgent0Directory(dirname(filePath))
  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`
  await writeFile(tmpPath, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
  await chmod(tmpPath, 0o600)
  await rename(tmpPath, filePath)
  await chmod(filePath, 0o600)
}

function isFileNotFoundError(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
