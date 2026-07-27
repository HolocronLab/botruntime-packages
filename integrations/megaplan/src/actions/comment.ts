import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { IntegrationProps } from '../bp'
import { buildClient, run } from './shared'

export const addComment: IntegrationProps['actions']['addComment'] = async ({ ctx, input, client }) =>
  run(async () => {
    const api = buildClient(ctx, client)
    const created = await api.addComment(input.owner, input.ownerId, input.contentHtml)
    return { id: created.id }
  })

// File publication is capability-only. CloudAPI must pin every nested FileRef
// and start a fenced native durable operation; an ordinary action invocation
// must never fall back to inline bytes, base64, or internal Files API URLs.
export const publishCaseDocument: IntegrationProps['actions']['publishCaseDocument'] = async () => {
  throw new RuntimeError('publishCaseDocument: используйте startIntegrationOperation с immutable FileRef')
}
