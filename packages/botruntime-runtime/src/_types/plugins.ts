/**
 * Virtual module for plugin type definitions
 *
 * This module is populated by brt code generation.
 * The actual types are declared in `.adk/plugins-types.d.ts` via module augmentation.
 */
import type { Plugins as P } from '@holocronlab/botruntime-runtime/_types/plugins'

/**
 * All installed plugins with their typed definitions
 * Generated from agent.config.ts dependencies
 */
export type Plugins = P extends never ? Record<string, any> : P
