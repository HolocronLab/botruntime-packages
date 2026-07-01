import type { IntegrationPackage, PluginPackage } from '@holocronlab/botruntime-sdk'
import { RegisteredIntegration, RegisteredInterface, RegisteredPlugin, StatusVerdict } from '../types'
import { getSingleton } from './singletons'

/**
 * Configuration for the agent registry
 */
export interface AgentRegistryConfig {
  // Integrations and interfaces
  integrations: RegisteredIntegration[]
  interfaces: RegisteredInterface[]
  interfacesMapping: Record<string, unknown>
  // Installed plugins, carrying their capability status (parallel to integrations)
  plugins: RegisteredPlugin[]
}

/**
 * Singleton class for managing agent configuration and primitives
 * Provides a single source of truth for all runtime components
 */
class AgentRegistry {
  private _data: AgentRegistryConfig | null = null

  /**
   * Initialize the registry with configuration
   * This should be called once during bot startup
   */
  initialize(data: AgentRegistryConfig): void {
    if (this._data) {
      throw new Error('Agent registry has already been initialized')
    }
    this._data = data
  }

  // Getters for all registry properties

  get integrations() {
    this.ensureInitialized()
    return this._data!.integrations
  }

  get interfaces() {
    this.ensureInitialized()
    return this._data!.interfaces
  }

  get plugins() {
    this.ensureInitialized()
    return this._data!.plugins
  }

  get interfacesMapping() {
    this.ensureInitialized()
    return this._data!.interfacesMapping
  }

  private ensureInitialized(): void {
    if (!this._data) {
      throw new Error('Agent registry not initialized. Call agentRegistry.initialize() during bot startup.')
    }
  }
}

/** Per-alias carrier verdicts baked by codegen into the generated bootstrap. */
type CarrierStatuses = Record<string, StatusVerdict>

const NOT_INSTALLED: StatusVerdict = { state: 'not_installed' }

/**
 * Build the status-bearing integration carrier consumed by the action proxy, and
 * register the installed ones with the ADK API. Extracted from the generated
 * `setupAdkRuntime` so the fault-isolation logic is unit-testable:
 *
 * - A `not_installed` entry is a MODE B stub (no real module) — skipped, never registered.
 * - A `registerIntegration` fault is isolated to the offending integration (demoted to
 *   `errored`) instead of aborting bootstrap for every other dependency.
 * - A missing carrier entry fails closed to `not_installed` (inert), never `available`.
 */
export function buildIntegrationRegistry(
  definitions: Record<string, IntegrationPackage>,
  statuses: CarrierStatuses,
  registerIntegration: (props: { alias: string; definition: IntegrationPackage['definition'] }) => void
): RegisteredIntegration[] {
  const registry: RegisteredIntegration[] = Object.entries(definitions).map(([alias, def]) => ({
    ...def,
    alias,
    status: statuses[alias] ?? NOT_INSTALLED,
  }))

  for (const integration of registry) {
    if (integration.status.state === 'not_installed') continue
    try {
      registerIntegration({ alias: integration.alias, definition: integration.definition })
    } catch (err) {
      integration.status = { state: 'errored', reason: err instanceof Error ? err.message : String(err) }
    }
  }

  return registry
}

/** Build the status-bearing plugin carrier (parallel to {@link buildIntegrationRegistry}). */
export function buildPluginRegistry(
  definitions: Record<string, PluginPackage>,
  statuses: CarrierStatuses
): RegisteredPlugin[] {
  return Object.entries(definitions).map(([alias, def]) => ({
    ...def,
    alias,
    status: statuses[alias] ?? NOT_INSTALLED,
  }))
}

// TODO: remove this in favor of `adk` API once we have it everywhere
// we need to remove interfacesMapping and interfaces from here
/**
 * Export singleton instance
 * We need this because the import of this file can happen from different entrypoints and we want
 * to share the same instance across them.
 */
export const agentRegistry = getSingleton('__ADK_GLOBAL_AGENT_REGISTRY', () => new AgentRegistry())
