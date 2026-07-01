import { context } from '../runtime/context/context'
import { PluginActions } from '../_types/plugin-actions'
import { Errors } from '../errors'
import { extractMissingRequiredFields } from '../utilities/missing-fields'

/**
 * Runtime proxy for calling plugin actions.
 *
 * Mirrors the integration action proxy in actions.ts (capability guard + drift
 * backstop), so an unconfigured/uninstalled plugin is inert and yields a typed,
 * catchable error instead of crashing the turn:
 * - Reads the plugin capability status from the context carrier (`plugins`).
 * - Gets the client from AsyncLocalStorage context (shared across bundles).
 * - Calls client.callAction() which routes through the SDK server, which
 *   dispatches to the plugin handler via the `#` prefix.
 *
 * Plugin actions use the format: pluginAlias#actionName (vs integrationAlias:actionName for integrations)
 */

export function setup(_bot: unknown): void {
  // No-op. Kept for backward compatibility with generated setupAdkRuntime.
  // The proxy uses client.callAction() instead of bot.actionHandlers directly,
  // so no bot reference is needed.
}

export const plugins: PluginActions = new Proxy({} as PluginActions, {
  get(_, pluginAlias: string) {
    if (typeof pluginAlias !== 'string') {
      return undefined
    }

    return {
      actions: new Proxy(
        {},
        {
          get(_, actionName: string) {
            if (typeof actionName !== 'string') {
              return undefined
            }

            return async (input: unknown) => {
              // Capability guard — fails closed, symmetric with the integration proxy.
              // Every real context wires the `plugins` carrier (the request handler and
              // the standalone script runner both set it from `agentRegistry.plugins`),
              // so an absent carrier or an unknown plugin means "not registered" and a
              // non-`available` status means "inert". All three throw a typed, catchable
              // error instead of crashing the turn.
              const pluginsCarrier = context.get('plugins', { optional: true })
              const plugin = pluginsCarrier?.find((p) => p.alias === pluginAlias)
              if (!plugin) {
                throw new Errors.PluginUnavailableError({
                  alias: pluginAlias,
                  action: actionName,
                  status: { state: 'unresolved', reason: 'plugin is not registered in this bot' },
                })
              }
              if (plugin.status?.state !== 'available') {
                throw new Errors.PluginUnavailableError({
                  alias: pluginAlias,
                  action: actionName,
                  status: plugin.status ?? { state: 'unresolved', reason: 'no status carried for this plugin' },
                })
              }

              const client = context.get('client', { optional: true })
              if (!client) {
                throw new Errors.PluginUnavailableError({
                  alias: pluginAlias,
                  action: actionName,
                  status: { state: 'unresolved', reason: 'no client available in the current context' },
                })
              }

              // Drift backstop: normalize a missing-required-config rejection into the
              // typed error so it stays catchable and non-fatal; re-throw genuine errors.
              try {
                const res = await client.callAction({
                  type: `${pluginAlias}#${actionName}`,
                  input,
                })
                // oxlint-disable-next-line no-explicit-any -- SDK response type lacks proper typing
                return (res as any).output
              } catch (err) {
                const missingFields = extractMissingRequiredFields(err)
                if (missingFields) {
                  throw new Errors.PluginUnavailableError({
                    alias: pluginAlias,
                    action: actionName,
                    status: { state: 'unconfigured', missingFields },
                  })
                }
                throw err
              }
            }
          },
        }
      ),
    }
  },
})
