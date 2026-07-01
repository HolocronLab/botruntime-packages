/**
 * Virtual module for channel type definitions
 *
 * This module is populated by code generation from the ADK.
 * The actual types are declared in `.adk/runtime.d.ts` via module augmentation.
 */
import type { Channels as C, ChannelSpec as CS } from '@holocronlab/botruntime-runtime/_types/channels'

/**
 * All available channels from installed integrations
 * Generated from agent.config.ts dependencies
 */
export type Channels = C extends never ? string : C

/**
 * Channel specification type - supports single channel, array of channels, or glob '*'
 * Generated from agent.config.ts dependencies
 */
export type ChannelSpec = CS extends never ? string | readonly string[] | '*' : CS
