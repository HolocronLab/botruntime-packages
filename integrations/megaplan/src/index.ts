import * as sdk from '@botpress/sdk'
import actions from './actions'
import { buildClient } from './actions/shared'
import type { TMegaplan, IntegrationProps } from './bp'

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

// handler — Megaplan is action-centric (no inbound provider webhooks in scope); ack
// any inbound hit so the seam stays well-behaved.
const handler: IntegrationProps['handler'] = async () => {
  return { status: 200 }
}

export default new sdk.Integration<TMegaplan>({
  register,
  unregister,
  actions,
  channels: {},
  handler,
})
