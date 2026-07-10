/**
 * Virtual module for integration type definitions
 *
 * This module is populated by brt code generation.
 * The actual types are declared in `.adk/integrations.d.ts` via module augmentation.
 */
import type { Integrations as I } from '@holocronlab/botruntime-runtime/_types/integrations'

/**
 * All installed integrations with their typed definitions
 * Generated from agent.config.ts dependencies
 */
export type Integrations = I extends never ? Record<string, any> : I
