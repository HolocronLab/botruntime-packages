import * as sdk from '@holocronlab/botruntime-sdk'
import actions from './actions'
import { buildClient } from './actions/shared'
import type { TMegaplan, IntegrationProps } from './bp'
import { webhookHandler } from './webhook'

// register — validate creds loudly at install time: issue a token and hit a cheap
// read (listPrograms). A bad baseUrl / login fails here (fail fast on misconfig)
// rather than silently at the first action call.
const register: IntegrationProps['register'] = async ({ ctx, client, logger }) => {
  try {
    const api = buildClient(ctx, client)
    await api.listPrograms()
    logger.forBot().info('Megaplan: подключение успешно')
  } catch (thrown) {
    const error = thrown instanceof Error ? thrown : new Error(String(thrown))
    throw new sdk.RuntimeError(error.message)
  }
}

// unregister — drop the cached token so a re-install re-authenticates cleanly.
const unregister: IntegrationProps['unregister'] = async ({ ctx, client }) => {
  await client.setState({ type: 'integration', name: 'megaplanAuth', id: ctx.integrationId, payload: { accessToken: null } })
}

const integration = new sdk.Integration<TMegaplan>({
  register,
  unregister,
  actions,
  channels: {},
  handler: webhookHandler,
})

const sdkHandler = integration.handler.bind(integration)
type LambdaRequest = Parameters<typeof sdkHandler>[0]

// The runtime host forwards provider requests as a flat envelope while the SDK
// expects req nested in the webhook body. Keep the adapter inside the bundle so
// the integration remains portable and the host contract stays provider-neutral.
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

Object.defineProperty(integration, 'handler', { value: lambdaHandler })

export { lambdaHandler as handler }
export default integration
