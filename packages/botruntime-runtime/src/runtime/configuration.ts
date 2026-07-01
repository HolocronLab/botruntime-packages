import { Configuration as ConfigurationType } from '../_types/configuration'
import { context } from './context/context'
import { getSingleton } from './singletons'

/**
 * Cache for parsed environment configuration
 */
const getEnvConfigCache = () =>
  getSingleton('__ADK_GLOBAL_ENV_CONFIG_CACHE', (): { parsed: ConfigurationType | null; attempted: boolean } => ({
    parsed: null,
    attempted: false,
  }))

/**
 * Try to get configuration from ADK_CONFIGURATION environment variable
 * This is set by `adk dev` and `adk run` commands
 */
function getEnvConfig(): ConfigurationType | null {
  const cache = getEnvConfigCache()

  if (cache.attempted) {
    return cache.parsed
  }

  cache.attempted = true

  const envConfig = process.env.ADK_CONFIGURATION
  if (!envConfig) {
    return null
  }

  try {
    cache.parsed = JSON.parse(envConfig) as ConfigurationType
    return cache.parsed
  } catch {
    console.warn('[ADK] Failed to parse ADK_CONFIGURATION environment variable')
    return null
  }
}

/**
 * Get configuration, preferring request context over env fallback
 */
function getConfig(): ConfigurationType | null {
  // First try to get from request context (production / during request handling)
  const contextConfig = context.get('configuration', { optional: true })
  if (contextConfig) {
    return contextConfig
  }

  // Fall back to env variable (adk dev / adk run)
  return getEnvConfig()
}

/**
 * Access the bot's configuration
 * Configuration is available both during request handling (from context)
 * and at module load time (from ADK_CONFIGURATION env var set by adk dev/run)
 * Types are auto-generated from agent.config.ts configuration schema
 *
 * Note: Returns undefined for properties when configuration is not available
 * (e.g., during build/codegen phase). Code should handle undefined gracefully
 * or only access configuration during request handling.
 */
export const configuration: ConfigurationType = new Proxy({} as ConfigurationType, {
  get(_target, prop: string) {
    // Ignore Symbol properties (like Symbol.toStringTag, Symbol.iterator, etc.)
    if (typeof prop === 'symbol') {
      return undefined
    }

    const config = getConfig()
    if (!config) {
      // Return undefined instead of throwing - allows module-level access
      // during build/codegen phase without crashing
      return undefined
    }

    return config[prop]
  },
  set(_target, prop: string, _value: unknown) {
    throw new Error(`Cannot set configuration property "${prop}". Configuration is read-only.`)
  },
  ownKeys() {
    const config = getConfig()
    return config ? Object.keys(config) : []
  },
  getOwnPropertyDescriptor(_target, prop: string) {
    const config = getConfig()
    if (!config || !(prop in config)) {
      return undefined
    }
    return {
      enumerable: true,
      configurable: true,
      value: config[prop],
    }
  },
})
