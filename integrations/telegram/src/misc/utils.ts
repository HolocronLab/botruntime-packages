import { RuntimeError } from '@botpress/sdk'
import { AssertionError } from 'assert'
import { ok } from 'assert'
import _ from 'lodash'
import { Context, Markup, Telegraf, Telegram, TelegramError } from 'telegraf'
import type { Update, User, Sticker } from 'telegraf/types'
import { ingestTelegramFileLink } from './files'
import { telegramTextMsgToStdMarkdown } from './telegram-to-markdown'
import type {
  AckFunction,
  Card,
  Conversation,
  HandlerProps,
  HandlerResponse,
  Logger,
  Message,
  TelegramMessage,
} from './types'

export const mapToRuntimeErrorAndThrow =
  (message: string) =>
  (thrown: unknown): never => {
    if (thrown instanceof TelegramError) {
      throw new RuntimeError(`${message}: ${thrown.description}`, thrown)
    }

    throw thrown instanceof Error
      ? new RuntimeError(`${message}: ${thrown.message}`, thrown)
      : new RuntimeError(`${message}: ${thrown}`)
  }

export async function ackMessage(message: TelegramMessage, ack: AckFunction) {
  await ack({ tags: { id: `${message.message_id}` } })
}

export async function sendCard(payload: Card, client: Telegraf<Context<Update>>, chat: string, ack: AckFunction) {
  const text = `*${payload.title}*${payload.subtitle ? '\n' + payload.subtitle : ''}`
  const buttons = payload.actions
    .filter((item) => item.value && item.label)
    .map((item) => {
      switch (item.action) {
        case 'url':
          return Markup.button.url(item.label, item.value)
        case 'postback':
          return Markup.button.callback(item.label, `postback:${item.value}`)
        case 'say':
          return Markup.button.callback(item.label, `say:${item.value}`)
        default:
          throw new RuntimeError(`Unknown action type: ${item.action}`)
      }
    })
  if (payload.imageUrl) {
    const message = await client.telegram
      .sendPhoto(chat, payload.imageUrl, {
        caption: text,
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(buttons),
      })
      .catch(mapToRuntimeErrorAndThrow('Fail to send photo'))
    await ackMessage(message, ack)
  } else {
    const message = await client.telegram
      .sendMessage(chat, text, {
        parse_mode: 'MarkdownV2',
        ...Markup.inlineKeyboard(buttons),
      })
      .catch(mapToRuntimeErrorAndThrow('Fail to send message'))
    await ackMessage(message, ack)
  }
}

export function getChat(conversation: Conversation): string {
  const chat = conversation.tags.chatId

  if (!chat) {
    throw new RuntimeError(`No chat found for conversation ${conversation.id}`)
  }

  return chat
}

export function getMessageId(message: Message): number {
  const messageId = message.tags.id

  if (!messageId) {
    throw new RuntimeError(`No message ID found for message ${message.id}`)
  }

  return Number(messageId)
}

export const getUserNameFromTelegramUser = (telegramUser: User) => {
  if (telegramUser.first_name && telegramUser.last_name) {
    return `${telegramUser.first_name} ${telegramUser.last_name}`
  } else if (telegramUser.username) {
    return telegramUser.username
  }
  return telegramUser.first_name
}

export type IncomingMessage = { type: string; payload: Record<string, unknown> }

// Resolve a Telegram file_id to its public link (token-bearing, used server-side only) then
// byte-ingest into cloudapi, returning a token-free URL (see files.ts for the WHY).
async function ingestById(
  telegram: Telegram,
  fileId: string,
  fileUniqueId: string,
  contentType: string
): Promise<string> {
  const link = await telegram.getFileLink(fileId).catch(mapToRuntimeErrorAndThrow('Fail to get file link'))
  return ingestTelegramFileLink(link.href, `telegram/${fileUniqueId}`, contentType)
}

export const convertTelegramMessageToBotpressMessage = async ({
  message,
  telegram,
  logger,
}: {
  message: TelegramMessage
  telegram: Telegram
  logger: Logger
}): Promise<IncomingMessage> => {
  if ('photo' in message) {
    const photo = _.maxBy(message.photo, (p) => p.height * p.width)
    ok(photo, 'No photo found in message')
    const imageUrl = await ingestById(telegram, photo.file_id, photo.file_unique_id, 'image/jpeg')
    return { type: 'image', payload: { imageUrl } }
  }

  if ('sticker' in message) {
    const sticker = (message as TelegramMessage & { sticker: Sticker }).sticker
    const imageUrl = await ingestById(telegram, sticker.file_id, sticker.file_unique_id, 'image/webp')
    return { type: 'image', payload: { imageUrl } }
  }

  if ('audio' in message) {
    const audioUrl = await ingestById(
      telegram,
      message.audio.file_id,
      message.audio.file_unique_id,
      message.audio.mime_type ?? 'audio/mpeg'
    )
    return { type: 'audio', payload: { audioUrl } }
  }

  if ('voice' in message) {
    const audioUrl = await ingestById(
      telegram,
      message.voice.file_id,
      message.voice.file_unique_id,
      message.voice.mime_type ?? 'audio/ogg'
    )
    return { type: 'audio', payload: { audioUrl } }
  }

  if ('video' in message) {
    const videoUrl = await ingestById(
      telegram,
      message.video.file_id,
      message.video.file_unique_id,
      message.video.mime_type ?? 'video/mp4'
    )
    return { type: 'video', payload: { videoUrl } }
  }

  if ('document' in message) {
    const contentType = message.document.mime_type ?? 'application/octet-stream'
    const fileUrl = await ingestById(telegram, message.document.file_id, message.document.file_unique_id, contentType)
    return {
      type: 'file',
      payload: { fileUrl, title: message.document.file_name ?? 'файл', mimeType: contentType },
    }
  }

  if ('text' in message) {
    const { text, warnings } = telegramTextMsgToStdMarkdown(message.text, message.entities)
    warnings?.forEach((warningMsg) => logger.forBot().warn(warningMsg))
    return { type: 'text', payload: { text } }
  }

  if ('location' in message) {
    return {
      type: 'location',
      payload: { latitude: message.location.latitude, longitude: message.location.longitude },
    }
  }

  // GAP (request_contact inbound): a shared contact arrives as message.contact. The donor has no
  // such branch (it throws -> the phone is lost). We surface the phone number as a text message so
  // the bot's consent/share-phone flow captures it from the conversation history.
  if ('contact' in message) {
    return { type: 'text', payload: { text: message.contact.phone_number } }
  }

  throw new RuntimeError(`Unsupported message type from Telegram: ${JSON.stringify(message)}`)
}

type Handler = (args: HandlerProps) => Promise<HandlerResponse>

// Ignorable Telegram updates are signalled with `ok(...)` assertions: swallow ONLY those (ack 200 so
// Telegram does not retry). A genuine processing failure (createMessage/ingest) is rethrown to fail
// loud (the host turns it into a visible 500) — never silently dropped (the donor swallowed ALL
// throws, which is how a new user with a profile photo could lose their first message; CLAUDE.md).
export const wrapHandler =
  (handler: Handler): Handler =>
  async (args: HandlerProps): Promise<HandlerResponse> => {
    try {
      return await handler(args)
    } catch (thrown) {
      if (thrown instanceof AssertionError) {
        args.logger.forBot().debug('Ignored Telegram update:', thrown.message)
        return { status: 200 }
      }
      throw thrown
    }
  }
