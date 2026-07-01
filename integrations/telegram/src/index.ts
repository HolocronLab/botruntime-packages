import { Integration, type IntegrationProps } from '@holocronlab/botruntime-sdk'
import { ok } from 'assert'
import type { User } from 'telegraf/types'
import { makeTelegraf } from './misc/telegraf'
import { getStoredBotToken } from './botToken'
import {
  handleAudioMessage,
  handleBlocMessage,
  handleCardMessage,
  handleCarouselMessage,
  handleChoiceMessage,
  handleContactRequestMessage,
  handleDropdownMessage,
  handleFileMessage,
  handleImageMessage,
  handleLocationMessage,
  handleTextMessage,
  handleVideoMessage,
} from './misc/message-handlers'
import type { Context } from './bp'
import type { Client, HandlerProps, TelegramMessage, TypingActionProps } from './misc/types'
import {
  convertTelegramMessageToBotpressMessage,
  getChat,
  getMessageId,
  getUserNameFromTelegramUser,
  mapToRuntimeErrorAndThrow,
  wrapHandler,
} from './misc/utils'

// GAP (setMyCommands): the donor never registers a command menu. We set it at register() (install
// time), once. Inbound /start etc. still arrive as ordinary text (bot_command entity) — no inbound
// change needed. Commands are the AI-Юрист menu listed in the task.
const DEFAULT_COMMANDS = [
  { command: 'start', description: 'Начать' },
  { command: 'new', description: 'Новое дело' },
  { command: 'cases', description: 'Мои дела' },
  { command: 'status', description: 'Статус дела' },
  { command: 'lawyer', description: 'Связаться с юристом' },
]

// GAP (webhook secret): OUR cloudapi mints + ENFORCES a per-installation Telegram secret_token on
// every install; the donor never sets one (Botpress Cloud relies on the unguessable webhook URL).
// The SDK's register dispatch surfaces ONLY webhookUrl to register() and drops webhookSecret, so we
// thread the secret from the raw register body through this module var (set by the Lambda wrapper
// below, read by register, cleared in the wrapper's finally). Integration dispatch is serialized
// process-wide by the host (env critical section) and each bot runs in its own child process, so a
// single register op can never race another's secret. Absent (e.g. dev long-poll, which XORs
// register) -> setWebhook without secret_token, exactly the donor behavior.
let pendingWebhookSecret: string | undefined

const register = async ({ webhookUrl, ctx, client }: { webhookUrl: string; ctx: Context; client: Client }) => {
  const botToken = await getStoredBotToken(client, ctx.integrationId, ctx.configuration.botToken)
  const telegraf = makeTelegraf(botToken)
  const extra = pendingWebhookSecret
    ? { allowed_updates: ['message'] as const, secret_token: pendingWebhookSecret }
    : { allowed_updates: ['message'] as const }
  await telegraf.telegram
    .setWebhook(webhookUrl, extra)
    .catch(mapToRuntimeErrorAndThrow('Fail to set webhook. Check your bot token'))
  await telegraf.telegram
    .setMyCommands(DEFAULT_COMMANDS)
    .catch(mapToRuntimeErrorAndThrow('Fail to set bot commands'))
}

const unregister = async ({ ctx, client }: { ctx: Context; client: Client }) => {
  const botToken = await getStoredBotToken(client, ctx.integrationId, ctx.configuration.botToken)
  const telegraf = makeTelegraf(botToken)
  await telegraf.telegram
    .deleteWebhook({ drop_pending_updates: true })
    .catch(mapToRuntimeErrorAndThrow('Fail to delete webhook'))
}

const startTypingIndicator = async ({ input, ctx, client }: TypingActionProps) => {
  const botToken = await getStoredBotToken(client, ctx.integrationId, ctx.configuration.botToken)
  const telegraf = makeTelegraf(botToken)
  const { conversation } = await client.getConversation({ id: input.conversationId })
  const { message } = await client.getMessage({ id: input.messageId })

  const chat = getChat(conversation)
  const messageId = getMessageId(message)

  await telegraf.telegram.sendChatAction(chat, 'typing').catch(mapToRuntimeErrorAndThrow('Fail to start typing'))

  if (ctx.configuration.typingIndicatorEmoji === false) {
    return {}
  }

  await telegraf.telegram
    .setMessageReaction(chat, messageId, [{ type: 'emoji', emoji: '👀' }])
    .catch(mapToRuntimeErrorAndThrow('Fail to set message reaction'))

  return {}
}

const stopTypingIndicator = async ({ input, ctx, client }: TypingActionProps) => {
  if (ctx.configuration.typingIndicatorEmoji === false) {
    return {}
  }

  const botToken = await getStoredBotToken(client, ctx.integrationId, ctx.configuration.botToken)
  const telegraf = makeTelegraf(botToken)
  const { conversation } = await client.getConversation({ id: input.conversationId })
  const { message } = await client.getMessage({ id: input.messageId })

  const chat = getChat(conversation)
  const messageId = getMessageId(message)

  await telegraf.telegram
    .setMessageReaction(chat, messageId, [])
    .catch(mapToRuntimeErrorAndThrow('Fail to set message reaction'))

  return {}
}

const webhookHandler = async (props: HandlerProps) =>
  wrapHandler(async ({ req, client, ctx, logger }) => {
    logger.forBot().debug('Handler received request from Telegram with payload:', req.body)

    ok(req.body, 'Handler received an empty body, so the message was ignored')

    const data = JSON.parse(req.body)

    ok(!data.my_chat_member, 'Handler received a chat member update, so the message was ignored')
    ok(!data.channel_post, 'Handler received a channel post, so the message was ignored')
    ok(!data.edited_channel_post, 'Handler received an edited channel post, so the message was ignored')
    ok(!data.edited_message, 'Handler received an edited message, so the message was ignored')
    ok(data.message, 'Handler received a non-message update, so the event was ignored')

    const message = data.message as TelegramMessage
    const telegramConversationId = message.chat.id
    const telegramUserId = message.from?.id
    const messageId = message.message_id

    ok(!message.from?.is_bot, 'Handler received a message from a bot, so the message was ignored')
    ok(telegramConversationId, 'Handler received message with empty "chat.id" value')
    ok(telegramUserId, 'Handler received message with empty "from.id" value')
    ok(messageId, 'Handler received an empty message id')

    const fromUser = message.from as User
    const userName = getUserNameFromTelegramUser(fromUser)

    // Wrapped in mapToRuntimeErrorAndThrow (like every telegraf call below): the SDK's
    // handlerErrorToHttpResponse (@holocronlab/botruntime-sdk 6.13.0+) only preserves the original
    // status code for a RuntimeError/InvalidPayloadError — any other thrown ApiError (e.g. the
    // client's own 401 when BP_TOKEN is unset) is now re-wrapped as an unexpected error and always
    // reported as 500. Re-throwing as RuntimeError here keeps the honest 4xx for a client-reported
    // failure instead of masking it as a generic server error.
    const { conversation } = await client
      .getOrCreateConversation({
        channel: 'channel',
        tags: {
          id: telegramConversationId.toString(),
          fromUserId: telegramUserId.toString(),
          fromUserUsername: fromUser.username,
          fromUserName: userName,
          chatId: telegramConversationId.toString(),
        },
        discriminateByTags: ['id'],
      })
      .catch(mapToRuntimeErrorAndThrow('Fail to get or create conversation'))

    // Donor also fetched the avatar and client.updateUser({pictureUrl,name}). DROPPED: our cloudapi
    // does not serve PUT /v1/chat/users/:id, so updateUser would throw — and (in the donor's
    // swallow-all wrapper) silently drop a new user's FIRST message. The name is already set at
    // get-or-create; the avatar is non-essential. (Study GAP: updateUser unserved.)
    const { user } = await client
      .getOrCreateUser({
        tags: { id: telegramUserId.toString() },
        ...(userName && { name: userName }),
        discriminateByTags: ['id'],
      })
      .catch(mapToRuntimeErrorAndThrow('Fail to get or create user'))

    const botToken = await getStoredBotToken(client, ctx.integrationId, ctx.configuration.botToken)
    const telegraf = makeTelegraf(botToken)
    const bpMessage = await convertTelegramMessageToBotpressMessage({ message, telegram: telegraf.telegram, logger })

    logger.forBot().debug(`Received message from user ${telegramUserId}: ${JSON.stringify(message)}`)

    await client
      .createMessage({
        tags: {
          id: messageId.toString(),
          chatId: telegramConversationId.toString(),
        },
        type: bpMessage.type,
        payload: bpMessage.payload,
        userId: user.id,
        conversationId: conversation.id,
      })
      .catch(mapToRuntimeErrorAndThrow('Fail to create message'))

    return { status: 200 }
  })(props)

// yadisk pattern: build the impl with our own precise handler types, then construct the SDK
// Integration. The cast bridges our types to the SDK's generic BaseIntegration handler signatures
// (we dispatch by string key; full generic codegen is the broken `bp build` path we avoid).
const impl = {
  register,
  unregister,
  actions: { startTypingIndicator, stopTypingIndicator },
  channels: {
    channel: {
      messages: {
        text: handleTextMessage,
        image: handleImageMessage,
        audio: handleAudioMessage,
        video: handleVideoMessage,
        file: handleFileMessage,
        location: handleLocationMessage,
        card: handleCardMessage,
        carousel: handleCarouselMessage,
        dropdown: handleDropdownMessage,
        choice: handleChoiceMessage,
        contactRequest: handleContactRequestMessage,
        bloc: handleBlocMessage,
      },
    },
  },
  handler: webhookHandler,
}

const integration = new Integration(impl as unknown as IntegrationProps)
const sdkHandler = integration.handler.bind(integration)
type LambdaRequest = Parameters<typeof sdkHandler>[0]

// Lambda entrypoint the host's loader picks up (module.exports.handler). It is a thin ADAPTER from
// our host's integration envelope (dispatch.ts — shaped for the prior hand-written thin bundle) to
// the CANONICAL @botpress/sdk envelope the real integration dispatch expects. We adapt in the
// bundle rather than change the host so the live thin bundle stays a drop-in revert. Two bridges:
//   (1) Headers: the SDK context parser requires x-bot-user-id / x-integration-alias / x-webhook-id
//       on EVERY op; the host always sends x-bot-id / x-integration-id / x-bp-operation /
//       x-bp-configuration[-type] but only conditionally the other three. Fill them deterministically.
//   (2) webhook_received body: the SDK reads the provider request from body.req (nested), but the
//       host forwards the raw provider request FLAT (method/path/query/headers/body). Re-nest it.
// Plus the register-secret capture (see pendingWebhookSecret): read webhookSecret off the flat
// register body before the SDK (which drops it) runs.
const lambdaHandler = async (req: LambdaRequest) => {
  const op = req.headers?.['x-bp-operation']

  const headers: Record<string, string | undefined> = { ...req.headers }
  const botId = headers['x-bot-id']
  if (botId && !headers['x-bot-user-id']) headers['x-bot-user-id'] = `${botId}_bot`
  const integrationId = headers['x-integration-id']
  if (integrationId && !headers['x-integration-alias']) headers['x-integration-alias'] = integrationId
  if (!headers['x-webhook-id']) headers['x-webhook-id'] = integrationId ?? 'webhook'

  let body = req.body
  if (op === 'webhook_received') {
    body = JSON.stringify({
      req: { method: req.method, path: req.path, query: req.query, headers: req.headers, body: req.body },
    })
  }

  if (op === 'register') {
    try {
      const parsed = req.body ? (JSON.parse(req.body) as { webhookSecret?: unknown }) : {}
      pendingWebhookSecret =
        typeof parsed.webhookSecret === 'string' && parsed.webhookSecret.length > 0 ? parsed.webhookSecret : undefined
    } catch {
      pendingWebhookSecret = undefined
    }
    try {
      return await sdkHandler({ ...req, headers, body })
    } finally {
      pendingWebhookSecret = undefined
    }
  }
  return sdkHandler({ ...req, headers, body })
}

export { lambdaHandler as handler }
export default integration
