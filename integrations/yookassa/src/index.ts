import * as sdk from '@holocronlab/botruntime-sdk'
import { createPayment, getPayment } from './actions'
import { YookassaClient } from './yookassa-api'
import { handlePaymentNotification } from './webhook'

const integration: sdk.IntegrationProps = {
  register: async ({ ctx, logger }) => {
    await new YookassaClient(ctx.configuration).verifyCredentials()
    logger.forBot().info('ЮKassa: учётные данные приняты, интеграция подключена')
  },
  unregister: async () => {},
  actions: {
    createPayment: async ({ ctx, input, logger }) => createPayment(ctx.configuration, input, logger),
    getPayment: async ({ ctx, input }) => getPayment(ctx.configuration, input.paymentId),
  },
  channels: {},
  handler: async ({ req, ctx, client }) =>
    handlePaymentNotification({
      body: req.body,
      api: new YookassaClient(ctx.configuration),
      emit: (event) => client.createEvent(event),
    }),
}

const instance = new sdk.Integration(integration)
const sdkHandler = instance.handler.bind(instance)
type LambdaRequest = Parameters<typeof sdkHandler>[0]

const lambdaHandler = async (req: LambdaRequest) => {
  const headers: Record<string, string | undefined> = { ...req.headers }
  const botId = headers['x-bot-id']
  if (botId && !headers['x-bot-user-id']) headers['x-bot-user-id'] = `${botId}_bot`
  const integrationId = headers['x-integration-id']
  if (integrationId && !headers['x-integration-alias']) headers['x-integration-alias'] = integrationId
  if (!headers['x-webhook-id']) headers['x-webhook-id'] = integrationId ?? 'webhook'
  const body =
    headers['x-bp-operation'] === 'webhook_received'
      ? JSON.stringify({ req: { method: req.method, path: req.path, query: req.query, headers: req.headers, body: req.body } })
      : req.body
  return sdkHandler({ ...req, headers, body })
}

Object.defineProperty(instance, 'handler', { value: lambdaHandler })

export { lambdaHandler as handler }
export default instance
