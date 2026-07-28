import { expect, test } from 'bun:test'
import { createForumTopic } from '../src/forum-topics'
import type { Client } from '../src/misc/types'

test('ordinary createForumTopic fails before reading credentials, calling Telegram, or creating a conversation', async () => {
  const client = new Proxy(
    {},
    {
      get: (_target, property) => {
        throw new Error(`ordinary action touched client.${String(property)}`)
      },
    },
  ) as Client

  await expect(
    createForumTopic({
      input: { chatId: '-100123', name: 'Дело № 42' },
      ctx: {
        integrationId: 'telegram-installation',
        webhookId: 'wh_test',
        configuration: { botToken: 'must-not-be-read' },
      },
      client,
    }),
  ).rejects.toThrow(/temporarily disabled.*cannot safely reconcile/i)
})
