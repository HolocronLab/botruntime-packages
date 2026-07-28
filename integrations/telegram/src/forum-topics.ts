import { RuntimeError } from '@holocronlab/botruntime-sdk'
import type { Context } from './bp'
import type { Client } from './misc/types'

type CreateForumTopicProps = {
  input: { chatId: string; name: string }
  ctx: Context
  client: Client
}

// Telegram Bot API does not expose a provider idempotency key or a way to list
// and find forum topics after createForumTopic loses its response. Until the
// platform exposes a scoped provider-receipt/conversation-binding capability,
// neither ordinary action retries nor Integration Operations can reconcile the
// external effect without risking a duplicate topic.
export const createForumTopic = async (_props: CreateForumTopicProps): Promise<never> => {
  throw new RuntimeError(
    'createForumTopic is temporarily disabled: Telegram cannot safely reconcile an ambiguous topic creation',
  )
}
