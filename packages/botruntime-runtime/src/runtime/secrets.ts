import { Secrets as SecretsType } from '../_types/secrets'
import { Environment } from '../environment'

/**
 * Set of secret keys that have already been warned about in development mode.
 * Prevents spamming the console with repeated warnings for the same key.
 */
const warnedKeys = new Set<string>()

/**
 * Access the bot's secrets.
 *
 * Secrets are available as `process.env.SECRET_<NAME>` at runtime,
 * injected by the Botpress platform. This proxy provides typed access.
 *
 * Usage:
 *   import { secrets } from '@holocronlab/botruntime-runtime'
 *   const apiKey = secrets.MY_API_KEY
 *
 * In local development, SECRET_* env vars are not automatically injected.
 * Set them manually in your shell or .env file.
 */
export const secrets: SecretsType = new Proxy({} as SecretsType, {
  get(_target, prop: string) {
    // Ignore Symbol properties (like Symbol.toStringTag, Symbol.iterator, etc.)
    if (typeof prop === 'symbol') {
      return undefined
    }

    const value = process.env[`SECRET_${prop}`]

    // Dev-mode diagnostic: warn once per key when a secret is undefined
    if (value === undefined && !warnedKeys.has(prop)) {
      try {
        if (Environment.isDevelopment()) {
          warnedKeys.add(prop)
          console.warn(`[brt] Secret ${prop} is not set. Export SECRET_${prop}=... in your environment.`)
        }
      } catch {
        // Environment may not be initialized yet — skip warning
      }
    }

    return value
  },
  set(_target, prop: string, _value: unknown) {
    throw new Error(`Cannot set secret "${prop}". Secrets are read-only; configure it through brt/cloud settings.`)
  },
  ownKeys() {
    // Enumeration is not supported — secrets are access-by-name only.
    // process.env enumeration is unreliable across environments.
    return []
  },
  has(_target, prop: string | symbol) {
    if (typeof prop === 'symbol') return false
    return process.env[`SECRET_${prop}`] !== undefined
  },
  getOwnPropertyDescriptor() {
    return undefined
  },
})
