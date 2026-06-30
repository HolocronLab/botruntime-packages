import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

export const addComment: IntegrationProps['actions']['addComment'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const created = await api.addComment(input.owner, input.ownerId, input.contentHtml)
    return { id: created.id }
  })
