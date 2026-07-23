// Реализация интеграции: register/unregister + actions. Тип props фиксируем как
// IntegrationProps (=BaseIntegration), чтобы хэндлеры контекстно типизировались
// без сгенерированного .botpress (там ctx.configuration/input — any; узкие типы
// живут в actions.ts/config.ts). Только actions — входящих вебхуков нет.
import { Integration, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { createCaseFolder, getLink, uploadDocument } from './actions'
import { handleDurableOperation, type FileStreamClient } from './durable-operation'
import { onRegister } from './setup'

const integration: IntegrationProps = {
  register: async ({ ctx, logger }) => {
    await onRegister(ctx.configuration, logger)
  },
  unregister: async () => {
    // Нет вебхука/внешних ресурсов — отключать нечего.
  },
  actions: {
    createCaseFolder: async ({ ctx, input, logger }) => createCaseFolder(ctx.configuration, input.path, logger),
    uploadDocument: async () => uploadDocument(),
    getLink: async ({ ctx, input, logger }) => getLink(ctx.configuration, input.path, logger),
  },
  channels: {},
  handler: async () => {
    // Интеграция только actions — входящих сообщений/вебхуков нет.
  },
  __advanced: {
    unknownOperationHandler: async ({ ctx, req, client, logger }) => {
      if (ctx.operation !== 'integration_operation') return
      const outcome = await handleDurableOperation(
        req.headers['x-bp-type'],
        req.body,
        ctx.configuration,
        // v0.3.0 is published only after SDK 6.19.0; the repository lock stays
        // on the last public SDK until that immutable release exists.
        { files: client as unknown as FileStreamClient },
        logger,
      )
      return {
        status: 200,
        body: JSON.stringify(outcome),
      }
    },
  },
}

const instance = new Integration(integration)
const sdkHandler = instance.handler.bind(instance)
type LambdaRequest = Parameters<typeof sdkHandler>[0]

// The SDK requires webhook identity in every context, while action-only
// installations do not own a webhook. Fill the neutral alias before the SDK
// dispatches the native durable operation.
const lambdaHandler = async (req: LambdaRequest) => {
  const headers: Record<string, string | undefined> = { ...req.headers }
  const integrationId = headers['x-integration-id']
  if (!headers['x-webhook-id']) headers['x-webhook-id'] = integrationId ?? 'operation'
  return sdkHandler({ ...req, headers })
}

Object.defineProperty(instance, 'handler', { value: lambdaHandler })

export { lambdaHandler as handler }
export default instance
