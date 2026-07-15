import { Integration, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { handleChatRequest } from './chat-api'

const outbound = async () => {}

const impl = {
  register: async () => {},
  unregister: async () => {},
  actions: {},
  channels: {
    channel: {
      messages: {
        text: outbound,
        image: outbound,
        audio: outbound,
        video: outbound,
        file: outbound,
        location: outbound,
        carousel: outbound,
        card: outbound,
        dropdown: outbound,
        choice: outbound,
        bloc: outbound,
      },
    },
  },
  handler: async ({ req, client, ctx }: any) =>
    handleChatRequest({
      req,
      client,
      webhookId: ctx.webhookId,
      encryptionKey: ctx.configuration.encryptionKey,
    }),
}

const integration = new Integration(impl as unknown as IntegrationProps)
const sdkHandler = integration.handler.bind(integration)
type LambdaRequest = Parameters<typeof sdkHandler>[0]

const lambdaHandler = async (req: LambdaRequest) => {
  const headers: Record<string, string | undefined> = { ...req.headers }
  const botId = headers['x-bot-id']
  if (botId && !headers['x-bot-user-id']) headers['x-bot-user-id'] = `${botId}_bot`
  const integrationId = headers['x-integration-id']
  if (integrationId && !headers['x-integration-alias']) headers['x-integration-alias'] = integrationId
  if (!headers['x-webhook-id']) headers['x-webhook-id'] = integrationId ?? 'webhook'

  let body = req.body
  if (headers['x-bp-operation'] === 'webhook_received') {
    body = JSON.stringify({
      req: {
        method: req.method,
        path: req.path,
        query: req.query,
        headers: req.headers,
        body: req.body,
      },
    })
  }
  return sdkHandler({ ...req, headers, body })
}

Object.defineProperty(integration, 'handler', { value: lambdaHandler })

export { lambdaHandler as handler }
export default integration
