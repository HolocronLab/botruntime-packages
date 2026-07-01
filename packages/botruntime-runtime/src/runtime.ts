/**
 * @module @holocronlab/botruntime-runtime/runtime
 * @description This module is the main entry point for running a Botpress agent built with the ADK from the `@holocronlab/botruntime-sdk` package.
 * @note This module is intended for use only within the Botpress ADK monorepo, mainly auto-generated code in the `./.adk` folder of a bot project.
 * @usage
 * import { setup } from "@holocronlab/botruntime-runtime/runtime"
 * setup(bot) // where `bot` is provided by the Botpress SDK
 */

// Don't reorder these imports - they must be imported in this order

// <side-effect>
import './globals'
import './environment'
import './telemetry/tracing'
import { installStructuredLogging } from './telemetry/structured-logging'
import { Environment } from './environment'

// Install structured logging when running in development
// (but not during build/compile commands)
if (Environment.isDevelopment()) {
  installStructuredLogging()
}
// </side-effect>

export { z } from '@holocronlab/botruntime-sdk'

// Export only runtime-specific functionality
// Primitives (Conversation, Workflow, etc.) should be imported from "@holocronlab/botruntime-runtime" (main export)
export type { Asset } from './_types/assets'
export * from './runtime/index'
export * from './types'
export * from './errors'

export { bot, user } from './runtime/state'
export { configuration } from './runtime/configuration'
export { secrets } from './runtime/secrets'
export type { Secrets } from './_types/secrets'
export { agentRegistry, buildIntegrationRegistry, buildPluginRegistry } from './runtime/agent-registry'
export { defineConfig } from './define-config'

export { initialize, register, registerIntegration } from './runtime/adk'
