import { BotContext, context } from '../runtime/context/context'
import { BotActions } from '../_types/actions'
import { IntegrationActions } from '../_types/integration-actions'
import { adk } from './adk'
import { Autonomous } from './autonomous'
import { Errors } from '../errors'
import { extractMissingRequiredFields } from '../utilities/missing-fields'

// Combined proxy that handles both bot actions (direct) and integration actions (nested)
type ActionsProxy = IntegrationActions & BotActions

export const actions: ActionsProxy = new Proxy({} as ActionsProxy, {
  get(_, propertyName: string) {
    if (typeof propertyName !== 'string') {
      return undefined
    }
    let client: BotContext['client']
    client ??= context.get('client', { optional: true })

    // First check if it's a bot action
    const botAction = adk.project.actions.find((a) => a.name === propertyName)
    if (botAction) {
      const handler = async (input: unknown) => {
        return await botAction.execute({
          input,
          client,
        })
      }

      handler.asTool = () =>
        new Autonomous.Tool({
          name: botAction.name,
          description: botAction.description ?? `Runs the ${botAction.name} action`,
          input: botAction.input,
          output: botAction.output,
          handler: async (input) => handler(input),
        })

      return handler
    }

    // Otherwise, treat it as an integration name
    let integrations: BotContext['integrations']

    integrations ??= context.get('integrations', { optional: true })

    // Create a proxy for integration actions
    const integrationName = propertyName.replace('__', '/') // Private integrations are named with __ instead of / for typings compatibility
    return new Proxy(
      {},
      {
        get(_, actionName: string) {
          if (typeof actionName !== 'string') {
            return undefined
          }

          integrations ??= context.get('integrations', { optional: true })
          client ??= context.get('client', { optional: true })

          // Verify the integration exists
          const integration = integrations?.find((i) => i.alias === integrationName)

          const actionDef = integration?.definition.actions?.[actionName]

          const handler = async (params: unknown) => {
            // Re-derive from the freshest context so a late-populated registry is seen.
            integrations ??= context.get('integrations', { optional: true })
            client ??= context.get('client', { optional: true })
            const liveIntegration = integrations?.find((i) => i.alias === integrationName) ?? integration
            const liveActionDef = liveIntegration?.definition.actions?.[actionName] ?? actionDef

            // Genuine absence (typo / not declared) keeps the original "not found" error.
            if (!liveIntegration || !liveActionDef) {
              throw new Error(`Could not find integration "${integrationName}" and action "${actionName}"`)
            }

            // Capability guard (MODE A): only `available` integrations are callable.
            // Everything else (unconfigured / not_installed / disabled / unresolved /
            // errored) is present for discovery but inert — throw a typed, catchable
            // error instead of letting the SDK throw an opaque config error that
            // crashes the turn. A missing status (untyped construction / version skew)
            // fails closed to inert rather than defaulting to callable.
            if (liveIntegration.status?.state !== 'available') {
              throw new Errors.IntegrationUnavailableError({
                alias: integrationName,
                action: actionName,
                status: liveIntegration.status ?? {
                  state: 'unresolved',
                  reason: 'no status carried for this integration',
                },
              })
            }

            if (!client) {
              throw new Errors.IntegrationUnavailableError({
                alias: integrationName,
                action: actionName,
                status: { state: 'unresolved', reason: 'no client available in the current context' },
              })
            }

            // Drift backstop: even when status says `available`, Cloud may reject the
            // call (lock/cloud drift). Normalize a missing-required-config rejection
            // into the same typed error so it stays catchable and non-fatal; re-throw
            // genuine action errors untouched.
            try {
              const res = await client.callAction({
                type: `${liveIntegration.alias}:${actionName}`,
                input: params,
              })
              return res.output
            } catch (err) {
              const missingFields = extractMissingRequiredFields(err)
              if (missingFields) {
                throw new Errors.IntegrationUnavailableError({
                  alias: integrationName,
                  action: actionName,
                  status: { state: 'unconfigured', missingFields },
                })
              }
              throw err
            }
          }

          handler.asTool = () => {
            if (!integration || !actionDef) {
              throw new Error(`Could not find integration "${integrationName}" and action "${actionName}"`)
            }

            return new Autonomous.Tool({
              name: actionName,
              description:
                actionDef.description || `Calls the ${actionName} action from the ${integrationName} integration`,
              input: actionDef.input.schema,
              output: actionDef.output.schema,
              handler: async (input) => handler(input),
            })
          }

          return handler
        },
        ownKeys() {
          try {
            const integrations = context.get('integrations', {
              optional: true,
            })
            if (!integrations) return []

            const integration = integrations.find((i) => i.alias === integrationName)

            if (!integration?.definition?.actions) return []

            return Object.keys(integration.definition.actions)
          } catch {
            return []
          }
        },
        has(_, actionName: string) {
          try {
            const integrations = context.get('integrations', {
              optional: true,
            })
            if (!integrations) return false

            const integration = integrations.find((i) => i.alias === integrationName)

            return !!integration?.definition?.actions?.[actionName]
          } catch {
            return false
          }
        },
        getOwnPropertyDescriptor(target, actionName: string) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proxy handler self-reference requires any
          const proxyHandler = this as any
          if (proxyHandler.has(target, actionName)) {
            return {
              enumerable: true,
              configurable: true,
              value: proxyHandler.get(target, actionName),
            }
          }
          return undefined
        },
      }
    )
  },
  ownKeys() {
    try {
      const botActionKeys = adk.project.actions.map((a) => a.name)
      const integrations = context.get('integrations', { optional: true })
      const integrationKeys = integrations ? integrations.map((i) => i.alias) : []

      return [...botActionKeys, ...integrationKeys]
    } catch {
      return []
    }
  },
  has(_, propertyName: string) {
    const botActionKeys = adk.project.actions.map((a) => a.name)

    // Check if it's a bot action
    if (botActionKeys.includes(propertyName)) {
      return true
    }

    // Check if it's an integration
    try {
      const integrations = context.get('integrations', { optional: true })
      if (!integrations) return false

      return integrations.some((i) => i.name === propertyName)
    } catch {
      return false
    }
  },
  getOwnPropertyDescriptor(target, integrationName: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- proxy handler self-reference requires any
    const proxyHandler = this as any
    if (proxyHandler.has(target, integrationName)) {
      return {
        enumerable: true,
        configurable: true,
        value: proxyHandler.get(target, integrationName),
      }
    }
    return undefined
  },
})
