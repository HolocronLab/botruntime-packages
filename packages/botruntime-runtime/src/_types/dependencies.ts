import type { Integrations } from './integrations'

/**
 * Helper type to check if a type is empty (empty object or Record<string, never>)
 */
type IsEmptyObject<T> = T extends Record<string, never>
  ? true
  : keyof T extends never
    ? true
    : [T] extends [{}]
      ? {} extends T
        ? true
        : false
      : false

/**
 * Makes config optional if the config type is empty, otherwise requires it to be the specified type
 */
type ConfigField<T> = IsEmptyObject<T> extends true
  ? {
      config?: T
    }
  : {
      config?: T
    }

/**
 * Creates a discriminated union of configuration options for an integration.
 * When configurationType is set to a specific key, config must match that configuration's type.
 * When configurationType is omitted, it defaults to "default" and config must match the default configuration.
 * When config type is empty ({}), the config field can be omitted.
 */
type IntegrationConfigurationUnion<K extends keyof Integrations> = Integrations[K] extends {
  configurations: infer Configs
}
  ? Configs extends Record<string, unknown>
    ? 'default' extends keyof Configs
      ?
          | ({
              configurationType?: never
            } & ConfigField<Configs['default']>)
          | {
              [CT in keyof Configs]: {
                configurationType: CT
              } & ConfigField<Configs[CT]>
            }[keyof Configs]
      : {
          [CT in keyof Configs]: {
            configurationType: CT
          } & ConfigField<Configs[CT]>
        }[keyof Configs]
    : {
        configurationType?: string
        config?: unknown
      }
  : Integrations[K] extends { config: infer C }
    ? {
        configurationType?: string
      } & ConfigField<C>
    : {
        configurationType?: string
        config?: unknown
      }

export type IntegrationDependency<K extends keyof Integrations = keyof Integrations> = {
  version: string
  enabled: boolean
  connection?: string
} & IntegrationConfigurationUnion<K>

export type PluginDependency = {
  version: string
  config?: Record<string, unknown>
  dependencies?: Record<
    string,
    {
      integrationAlias: string
      integrationInterfaceAlias?: string
    }
  >
}

export type Dependencies = {
  integrations: {
    [K in keyof Integrations]: IntegrationDependency<K> | string
  }
  plugins?: Record<string, PluginDependency>
}
