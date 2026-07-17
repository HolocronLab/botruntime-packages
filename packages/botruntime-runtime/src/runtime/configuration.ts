import { Configuration as ConfigurationType } from '../_types/configuration'
import { context } from './context/context'

/**
 * Get canonical configuration from request/script context.
 */
function getConfig(): ConfigurationType | null {
  return context.get('configuration', { optional: true }) ?? null
}

/**
 * Access the bot's configuration
 * Configuration is available during request handling and in script context.
 * Types are auto-generated from agent.config.ts configuration schema
 *
 * At module load/build time no context exists, so properties are undefined.
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
