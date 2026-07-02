import fs from 'fs/promises'
import path from 'path'
import { AdkError } from '@holocronlab/botruntime-analytics'

interface SecretsStore {
  dev: Record<string, string>
  prod: Record<string, string>
}

export type Environment = 'dev' | 'prod'

export class SecretsManager {
  private storePath: string

  constructor(projectPath: string) {
    this.storePath = path.join(projectPath, '.adk', 'secrets.json')
  }

  private async readStore(): Promise<SecretsStore> {
    let content: string
    try {
      content = await fs.readFile(this.storePath, 'utf-8')
    } catch (err) {
      // No store yet (first run) → empty store. Any other read failure
      // (permissions, I/O) must NOT silently reset to empty: the next write
      // would overwrite the real file and destroy every local secret.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return { dev: {}, prod: {} }
      }
      throw new AdkError({
        code: 'SECRETS_STORE_UNREADABLE',
        message: `Could not read the local secrets store at ${this.storePath}.`,
        expected: true,
        suggestion: 'Check the file permissions, or delete the file to start over (local secret values will be lost).',
        cause: err,
      })
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(content)
    } catch (err) {
      throw new AdkError({
        code: 'SECRETS_STORE_CORRUPT',
        message: `The local secrets store at ${this.storePath} is not valid JSON.`,
        expected: true,
        suggestion:
          'Fix the JSON by hand, or delete the file and re-enter your secrets with `adk secrets set` (local secret values will be lost).',
        cause: err,
      })
    }
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      typeof (parsed as SecretsStore).dev !== 'object' ||
      typeof (parsed as SecretsStore).prod !== 'object'
    ) {
      throw new AdkError({
        code: 'SECRETS_STORE_CORRUPT',
        message: `The local secrets store at ${this.storePath} has an unexpected shape (expected { dev, prod }).`,
        expected: true,
        suggestion:
          'Fix the JSON by hand, or delete the file and re-enter your secrets with `adk secrets set` (local secret values will be lost).',
      })
    }
    return parsed as SecretsStore
  }

  private async writeStore(store: SecretsStore): Promise<void> {
    // Atomic write with 0600 perms:
    // - Writing to a tmp file + rename prevents a half-written JSON from being observed
    //   if the process is killed mid-write (readStore throws SECRETS_STORE_CORRUPT on a
    //   torn store, so a non-atomic write would brick every secrets command).
    // - mode 0o600 on the tmp file ensures .adk/secrets.json is owner-only (matches
    //   the ~/.ssh/id_rsa, ~/.aws/credentials convention for on-disk secrets).
    await fs.mkdir(path.dirname(this.storePath), { recursive: true })
    const tmpPath = `${this.storePath}.tmp`
    await fs.writeFile(tmpPath, JSON.stringify(store, null, 2) + '\n', { encoding: 'utf-8', mode: 0o600 })
    await fs.rename(tmpPath, this.storePath)
  }

  /**
   * List secret names and their values for the given environment.
   * Returns names only (not values) for display purposes.
   */
  async list(env: Environment): Promise<string[]> {
    const store = await this.readStore()
    return Object.keys(store[env])
  }

  /**
   * Get declared secret key-value pairs for the given environment.
   * Used internally to inject into bp dev/deploy.
   *
   * Secrets present in the local store but not listed in `declaredSecrets`
   * (i.e. orphans from a removed declaration) are filtered out so they are
   * never injected into the bot process or forwarded to `bp dev`/`bp deploy`.
   * The local file is not modified — call `delete` to remove a value for good.
   */
  async getAll(
    env: Environment,
    declaredSecrets: Record<string, { optional?: boolean; description?: string }>
  ): Promise<Record<string, string>> {
    const store = await this.readStore()
    const declared = new Set(Object.keys(declaredSecrets))
    return Object.fromEntries(Object.entries(store[env]).filter(([key]) => declared.has(key)))
  }

  /**
   * Set a secret value in the local store.
   */
  async set(key: string, value: string, env: Environment): Promise<void> {
    const store = await this.readStore()
    store[env][key] = value
    await this.writeStore(store)
  }

  /**
   * Delete a secret from the local store.
   */
  async delete(key: string, env: Environment): Promise<void> {
    const store = await this.readStore()
    delete store[env][key]
    await this.writeStore(store)
  }

  /**
   * Compare declared secrets against what's stored locally.
   */
  getMissing(
    declaredSecrets: Record<string, { optional?: boolean; description?: string }>,
    storedSecrets: Record<string, string>
  ): { required: string[]; optional: string[] } {
    const stored = new Set(Object.keys(storedSecrets))
    const required: string[] = []
    const optional: string[] = []

    for (const [name, def] of Object.entries(declaredSecrets)) {
      if (!stored.has(name)) {
        if (def.optional) {
          optional.push(name)
        } else {
          required.push(name)
        }
      }
    }

    return { required, optional }
  }
}
