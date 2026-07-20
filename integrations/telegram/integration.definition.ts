import { z, IntegrationDefinition } from '@holocronlab/botruntime-sdk'
import typingIndicator from './bp_modules/typing-indicator'
import { telegramMessageChannels } from './definitions/channels'

// Originally ported from @botpresshub/telegram v1.0.9. Faithful to the donor definition: ONE channel,
// the legacy `botToken` config (we deliver the token per-install via ctx.configuration —
// x-bp-configuration — and use credentials-state only for legacy installs), the
// `typingIndicatorEmoji` toggle, and the typing-indicator interface extension. Differences vs the
// donor are intentional and documented at their site:
//   - `linkTemplateScript`/OAuth wizard dropped (no Botpress-cloud OAuth on our host).
//   - channels gain `contactRequest` (definitions/channels.ts) for the share-phone gap.
export default new IntegrationDefinition({
  name: 'telegram',
  version: '1.1.12',
  title: 'Telegram',
  description: 'Engage with your audience in real-time.',
  icon: 'icon.svg',
  readme: 'hub.md',
  configuration: {
    schema: z.object({
      botToken: z
        .string()
        .min(1)
        .secret()
        .optional()
        .title('Bot Token')
        .describe('Telegram bot token from @BotFather. Delivered per-install via ctx.configuration.'),
      typingIndicatorEmoji: z
        .boolean()
        .default(false)
        .title('Typing Indicator Emoji')
        .describe('Temporarily add an emoji reaction to received messages to indicate when bot is processing message'),
    }),
  },
  states: {
    credentials: {
      type: 'integration',
      schema: z.object({
        botToken: z.string().title('Bot Token').min(1).secret().describe('The Telegram bot token'),
      }),
    },
  },
  channels: {
    channel: {
      title: 'Channel',
      description: 'Telegram Channel',
      messages: telegramMessageChannels,
      message: {
        tags: {
          id: { title: 'ID', description: 'The message id' },
          chatId: { title: 'Chat ID', description: 'The message Chat id' },
          updateId: { title: 'Update ID', description: 'Telegram update_id used for webhook deduplication' },
          webhookId: { title: 'Webhook ID', description: 'Botruntime installation webhook identity' },
        },
      },
      conversation: {
        tags: {
          id: { title: 'ID', description: 'The conversation ID' },
          fromUserId: { title: 'From User ID', description: 'The conversation From User id' },
          fromUserUsername: { title: 'From User UserName', description: 'The converstation from user username' },
          fromUserName: { title: 'From User Name', description: 'The conversation from user name' },
          chatId: { title: 'Chat ID', description: 'The conversation Chat id' },
          threadId: {
            title: 'Thread ID',
            description: 'Telegram forum topic message_thread_id',
          },
        },
      },
    },
  },
  actions: {
    createForumTopic: {
      title: 'Create forum topic',
      description: 'Create a topic in a forum-enabled Telegram supergroup',
      input: {
        schema: z.object({
          chatId: z
            .string()
            .min(1)
            .title('Chat ID')
            .describe('Telegram chat id of the forum-enabled supergroup'),
          name: z.string().min(1).max(128).title('Topic name').describe('Forum topic title'),
        }),
      },
      output: {
        schema: z.object({
          threadId: z.string().title('Thread ID').describe('Telegram message_thread_id of the created topic'),
          conversationId: z
            .string()
            .title('Conversation ID')
            .describe('Routing-bound Botruntime conversation id for the topic'),
        }),
      },
    },
  },
  events: {},
  network: {
    providerHosts: ['api.telegram.org'],
    ingressRelayed: true,
    webhookAuthMode: 'shared_secret',
  },

  user: {
    tags: {
      id: { title: 'ID', description: 'The id of the user' },
    },
  },
  __advanced: {
    useLegacyZuiTransformer: true,
  },
  attributes: {
    category: 'Communication & Channels',
    guideSlug: 'telegram',
    repo: 'botpress',
  },
}).extend(typingIndicator, () => ({
  entities: {},
}))
