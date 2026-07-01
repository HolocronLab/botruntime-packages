import type { PluginActions as PA } from '@holocronlab/botruntime-runtime/_types/plugin-actions'

export type PluginActions = PA extends never ? never : PA
