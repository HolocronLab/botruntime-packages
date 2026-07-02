import { Plugin } from '@holocronlab/botruntime-client'

export type PluginDefinition = Plugin

export interface PluginRef {
  name: string
  version: string
  fullName: string
}

export interface PluginDependencyMapping {
  integrationAlias: string
  integrationInterfaceAlias?: string
}

export interface ParsedPlugin {
  alias: string
  ref: PluginRef
  config?: Record<string, unknown>
  dependencies?: Record<string, PluginDependencyMapping>
  definition?: PluginDefinition
}
